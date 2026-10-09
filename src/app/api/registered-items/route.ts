import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { photoUrlSchema, contactModeSchema, emailFieldSchema } from '@/lib/validation';

import { logger } from '@/lib/logger';

const registeredItemCreateSchema = z
  .object({
    nickname: z.string().trim().min(1, 'Item nickname is required.').max(80, 'Nickname is too long.'),
    category: z.string().trim().max(50, 'Category is too long.').optional().nullable(),
    photoUrl: photoUrlSchema.optional().nullable(),
    contactMode: contactModeSchema,
    email: emailFieldSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.contactMode === 'SHOW_EMAIL' && !data.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Email address is required for email contact mode.' });
    }
  });

// POST /api/registered-items - Register a new item proactively
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const parseResult = registeredItemCreateSchema.safeParse(body);
    if (!parseResult.success) {
      logger.error('Zod validation error', { details: parseResult.error.flatten().fieldErrors });
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'INVALID_INPUT',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { nickname, category, photoUrl, contactMode: cm, email } = parseResult.data;

    // SHOW_PHONE is no longer a usable contact mode for new items — the phone
    // data model backing it was removed. The enum value itself is kept only
    // for backward-compat with existing rows (see doc 13); reject it here.
    if (cm === 'SHOW_PHONE') {
      return NextResponse.json(
        {
          error: 'Phone contact mode is no longer supported.',
          code: 'CONTACT_MODE_UNSUPPORTED',
        },
        { status: 400 }
      );
    }

    // The contact info shown to a stranger who scans this item's QR code must
    // actually belong to the signed-in user — reusing a freely-typed value here
    // (previously format-validated only) would let someone route scans to an
    // email they don't own. Require it to match the user's verified account email.
    if (cm === 'SHOW_EMAIL') {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true },
      });

      if (!user?.email || user.email !== email) {
        return NextResponse.json(
          {
            error: 'Email address must match your own account email.',
            code: 'EMAIL_NOT_VERIFIED',
          },
          { status: 400 }
        );
      }
    }

    // Server-side generate publicToken using unguessable uuid or random cuid counterpart
    const publicToken = uuidv4();

    const newItem = await prisma.registeredItem.create({
      data: {
        nickname,
        category: category || null,
        photoUrl: photoUrl || null,
        contactMode: cm,
        publicToken,
        userId: session.user.id,
        email: cm === 'SHOW_EMAIL' ? (email as string) : null,
      },
    });

    return NextResponse.json({ data: newItem }, { status: 201 });
  } catch (error) {
    logger.error('Error creating registered item', { error });
    return NextResponse.json(
      { error: 'Failed to create registered item.' },
      { status: 500 }
    );
  }
}
