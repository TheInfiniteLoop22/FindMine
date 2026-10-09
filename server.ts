// Unlike `next dev`/`next build`, a plain custom server doesn't auto-load .env —
// this must run before anything below (e.g. ./src/lib/prisma) reads process.env.
import 'dotenv/config';
import { createServer } from 'http';
import next from 'next';
import { Server as IOServer } from 'socket.io';
import { getToken } from 'next-auth/jwt';
import { parseCookie } from 'cookie';
import { setIO } from './src/lib/socket';
import { prisma } from './src/lib/prisma';
import { startStaleEmbeddingSweep } from './src/lib/directRunner';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port, turbopack: dev });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const upgradeHandler = app.getUpgradeHandler();
  const httpServer = createServer((req, res) => {
    handler(req, res);
  });

  const io = new IOServer(httpServer, {
    // Default socket.io path (/socket.io/) — kept out of the Next.js `/api` tree
    // entirely since it's handled by this custom server, not a Next route.
    cors: { origin: false },
  });

  // Socket.IO's own 'upgrade' listener only reacts to requests under /socket.io/
  // and ignores everything else — so Next's dev-mode Turbopack HMR websocket
  // (a *different* upgrade request path) still needs to be forwarded to Next's
  // own upgrade handler here, or hot-reload breaks under the custom server.
  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/socket.io/')) {
      upgradeHandler(req, socket, head).catch((err) => {
        console.error('[Next HMR upgrade] error:', err);
      });
    }
  });

  // Authenticate every socket connection against the same NextAuth JWT cookie
  // Next.js API routes already trust via getServerSession — read directly here
  // since a raw socket handshake isn't a normal Next.js request context.
  io.use(async (socket, next_) => {
    try {
      // A raw Node IncomingMessage (what socket.request is) has no `.cookies`
      // convenience property the way Next's own request wrapper does — getToken's
      // SessionStore reads `req.cookies` directly and does NOT fall back to
      // parsing the raw `Cookie` header itself, so that parsing has to happen here.
      const cookieHeader = socket.request.headers.cookie;
      const cookies = cookieHeader ? parseCookie(cookieHeader) : {};

      const token = await getToken({
        // getToken()'s runtime only ever reads `req.headers`/`req.cookies` (see
        // the comment above) - its declared type wants a full NextApiRequest,
        // dozens of unrelated properties (query, body, method, ...) that a
        // Socket.IO handshake object doesn't have and getToken never touches.
        // A cast satisfying that full type would be less honest than this one.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req: { headers: socket.request.headers, cookies } as any,
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (!token?.sub) {
        next_(new Error('Unauthorized'));
        return;
      }
      socket.data.userId = token.sub;
      next_();
    } catch {
      next_(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    // A client only receives events for a conversation after the server has
    // verified they're actually one of its two participants — joining a room is
    // not just a client-side declaration.
    socket.on('conversation:join', async (conversationId: string) => {
      if (typeof conversationId !== 'string') return;
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { userAId: true, userBId: true },
        });
        if (!conversation) return;
        if (conversation.userAId !== userId && conversation.userBId !== userId) return;
        socket.join(conversationId);
      } catch (err) {
        console.error('[Socket] conversation:join failed:', err);
      }
    });

    socket.on('conversation:leave', (conversationId: string) => {
      if (typeof conversationId === 'string') socket.leave(conversationId);
    });
  });

  setIO(io);
  startStaleEmbeddingSweep();

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port} (Socket.IO real-time DMs enabled)`);
  });

  // Hosting platforms that redeploy/rescale (Railway, Render, Fly.io, Docker
  // orchestrators) send SIGTERM and expect the process to stop accepting new
  // work and exit promptly — without this, in-flight requests and socket
  // connections would be hard-killed instead of drained.
  const shutdown = (signal: string) => {
    console.log(`> ${signal} received, shutting down gracefully...`);
    io.close();
    httpServer.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Safety net in case something keeps the event loop alive
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
