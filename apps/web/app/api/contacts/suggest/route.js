import { createHandler, json } from '@/lib/api/handler';
import { suggestAddresses } from '@/lib/contacts/repository';
import { str } from '@/lib/api/validate';

/** GET /api/contacts/suggest?q=jo — recipient autocomplete. */
export const GET = createHandler(async ({ session, url }) => {
  const q = str(url.searchParams.get('q'), { max: 100 });
  if (q.trim().length < 1) return json({ suggestions: [] });
  return json({ suggestions: suggestAddresses(session.email, q, 8) });
});
