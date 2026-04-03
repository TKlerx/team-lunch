import { describe, expect, it, vi } from 'vitest';
import { sendServiceError } from '../../src/server/routes/routeUtils.js';

function createReplyStub() {
  const send = vi.fn();
  const status = vi.fn(() => ({ send }));
  const warn = vi.fn();
  const error = vi.fn();

  return {
    reply: {
      status,
      log: { warn, error },
    },
    status,
    send,
    warn,
    error,
  };
}

describe('sendServiceError', () => {
  it('logs client errors as warnings and returns status/message', () => {
    const { reply, status, send, warn, error } = createReplyStub();
    const err = Object.assign(new Error('Bad request'), { statusCode: 400 });

    sendServiceError(reply as never, err);

    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith({ error: 'Bad request' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('logs server errors and includes violations payload', () => {
    const { reply, status, send, warn, error } = createReplyStub();
    const err = Object.assign(new Error('Import failed'), {
      statusCode: 500,
      violations: [{ path: '$.items[0]', message: 'Missing name' }],
    });

    sendServiceError(reply as never, err);

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith({
      error: 'Import failed',
      violations: [{ path: '$.items[0]', message: 'Missing name' }],
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});

