/**
 * A small structured logger, replacing scattered console.log/error/warn
 * calls with a consistent, greppable/parseable shape (level + timestamp +
 * message + structured meta) - one JSON line per call, the way any log
 * aggregator (Railway/Render/Datadog/etc.) expects to ingest them. Doesn't
 * need to be more elaborate than this for a project this size.
 *
 * Error objects passed in `meta` are serialized to {name, message, stack}
 * rather than silently dropped (JSON.stringify(new Error()) is `{}` by
 * default, since Error's own properties aren't enumerable).
 */

type LogMeta = Record<string, unknown>;

function serializeMeta(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value;
  }
  return out;
}

function write(level: 'info' | 'warn' | 'error', message: string, meta?: LogMeta) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? { meta: serializeMeta(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
};
