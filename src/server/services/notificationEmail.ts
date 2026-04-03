type MailOptions = {
  to: string | string[];
  subject: string;
  text: string;
};

type GraphMailConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedConfig: GraphMailConfig | null | undefined;
let cachedToken: CachedToken | null = null;

function getFetch(): typeof fetch {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable');
  }
  return fetch;
}

function getGraphMailConfig(): GraphMailConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const tenantId = process.env.ENTRA_TENANT_ID?.trim() ?? '';
  const clientId = process.env.ENTRA_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim() ?? '';
  const sender = process.env.GRAPH_MAIL_SENDER?.trim() ?? '';

  if (!tenantId || !clientId || !clientSecret || !sender) {
    cachedConfig = null;
    return cachedConfig;
  }

  cachedConfig = {
    tenantId,
    clientId,
    clientSecret,
    sender,
  };
  return cachedConfig;
}

async function getAccessToken(config: GraphMailConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
    config.tenantId,
  )}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await getFetch()(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Graph token request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('Graph token response did not include an access token');
  }

  const expiresInSeconds =
    typeof payload.expires_in === 'number' && payload.expires_in > 0 ? payload.expires_in : 300;

  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };

  return payload.access_token;
}

function normalizeRecipients(recipients: string | string[]): string[] {
  return (Array.isArray(recipients) ? recipients : [recipients])
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index);
}

function shouldAllowRealSendInCurrentRuntime(recipients: string[]): boolean {
  if (process.env.SERVER_TEST_RUNTIME !== 'true') {
    return true;
  }

  const testRecipient = process.env.GRAPH_MAIL_TEST_RECIPIENT?.trim().toLowerCase() ?? '';
  if (!testRecipient) {
    return false;
  }

  return recipients.length > 0 && recipients.every((recipient) => recipient === testRecipient);
}

async function sendGraphMessage(
  accessToken: string,
  sender: string,
  recipient: string,
  subject: string,
  text: string,
): Promise<void> {
  const response = await getFetch()(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: text,
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipient,
              },
            },
          ],
        },
        saveToSentItems: false,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Graph sendMail request failed (${response.status})`);
  }
}

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendEmail(options: MailOptions): Promise<boolean> {
  const config = getGraphMailConfig();
  if (!config) {
    return false;
  }

  const recipients = normalizeRecipients(options.to).filter((entry) => isLikelyEmail(entry));
  if (recipients.length === 0) {
    return false;
  }
  if (!shouldAllowRealSendInCurrentRuntime(recipients)) {
    return false;
  }

  try {
    const accessToken = await getAccessToken(config);
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        sendGraphMessage(accessToken, config.sender, recipient, options.subject, options.text),
      ),
    );

    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const firstFailure = results.find((result) => result.status === 'rejected');
    if (firstFailure?.status === 'rejected') {
      console.error('[email] graph send failed', firstFailure.reason);
    }

    return successCount > 0;
  } catch (error) {
    console.error('[email] graph send failed', error);
    return false;
  }
}

export function resetEmailClientForTests(): void {
  cachedConfig = undefined;
  cachedToken = null;
}
