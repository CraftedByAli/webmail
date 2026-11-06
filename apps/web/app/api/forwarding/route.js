import { createHandler, json, readJson } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { normalizeForwardingInput } from '@/lib/forwarding/service';

/**
 * Forwarding for the active mailbox. Stored on the mail server as a Sieve
 * script, so it works even when nobody is signed in to the webmail.
 *
 * GET → current settings and whether the server's filter service is reachable.
 * PUT { enabled, addresses[], keepCopy, skipSpam } → applies them.
 */
export const GET = createHandler(async ({ session }) => {
  const provider = await getProvider(session);
  return json(await provider.getForwarding());
});

export const PUT = createHandler(
  async ({ session, request }) => {
    const body = await readJson(request, 32 * 1024);
    const input = normalizeForwardingInput(body, { mailbox: session.email });
    const provider = await getProvider(session);
    return json(await provider.setForwarding(input));
  },
  { rateLimit: 'api' }
);
