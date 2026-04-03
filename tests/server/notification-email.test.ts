import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEmailClientForTests, sendEmail } from '../../src/server/services/notificationEmail.js';

describe('notificationEmail (Graph)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetEmailClientForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEmailClientForTests();
    vi.unstubAllGlobals();
  });

  it('returns false when Graph mail config is missing', async () => {
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    delete process.env.GRAPH_MAIL_SENDER;
    const result = await sendEmail({
      to: 'alice@example.com',
      subject: 'Hello',
      text: 'World',
    });

    expect(result).toBe(false);
  });

  it('requests a token and sends mail via Graph', async () => {
    process.env.ENTRA_TENANT_ID = 'tenant-id';
    process.env.ENTRA_CLIENT_ID = 'client-id';
    process.env.ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.GRAPH_MAIL_SENDER = 'sender@example.com';
    process.env.GRAPH_MAIL_TEST_RECIPIENT = 'alice@example.com';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token-123', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail({
      to: 'alice@example.com',
      subject: 'Lunch',
      text: 'A new lunch poll has started',
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://graph.microsoft.com/v1.0/users/sender%40example.com/sendMail',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('sends a real Graph mail when GRAPH_MAIL_TEST_RECIPIENT is configured', async () => {
    const recipient = process.env.GRAPH_MAIL_TEST_RECIPIENT?.trim();
    const sender = process.env.GRAPH_MAIL_SENDER?.trim();
    const tenantId = process.env.ENTRA_TENANT_ID?.trim();
    const clientId = process.env.ENTRA_CLIENT_ID?.trim();
    const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim();

    if (!recipient || !sender || !tenantId || !clientId || !clientSecret) {
      return;
    }

    const result = await sendEmail({
      to: recipient,
      subject: '[Team Lunch Test] Graph mail smoke test',
      text: 'This is an opt-in Graph mail smoke test triggered by tests/server/notification-email.test.ts.',
    });

    expect(result).toBe(true);
  }, 60000);
});
