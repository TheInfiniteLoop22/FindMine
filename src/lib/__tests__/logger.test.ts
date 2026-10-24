import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes info messages to console.log as a single JSON line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('hello world', { userId: 'u1' });
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed).toMatchObject({ level: 'info', message: 'hello world', meta: { userId: 'u1' } });
    expect(typeof parsed.time).toBe('string');
    expect(new Date(parsed.time).toString()).not.toBe('Invalid Date');
  });

  it('writes warnings to console.warn and errors to console.error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.warn('careful');
    logger.error('broken');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('serializes an Error in meta to {name, message, stack} instead of dropping it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    logger.error('something failed', { error: err, postId: 'p1' });

    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.meta.error).toMatchObject({ name: 'Error', message: 'boom' });
    expect(typeof parsed.meta.error.stack).toBe('string');
    expect(parsed.meta.postId).toBe('p1');
  });

  it('omits the meta field entirely when none is passed', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('no meta here');
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect('meta' in parsed).toBe(false);
  });
});
