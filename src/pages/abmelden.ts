// Beendet die Sitzung der Seite und danach die Anmeldung bei Cloudflare Access (online).
import type { APIRoute } from 'astro';
import { ABMELDEN_URL, LOKAL } from '../lib/anmeldung';
import { beendeSitzung } from '../lib/sitzung';

export const GET: APIRoute = async ({ cookies, url, redirect }) => {
  await beendeSitzung(cookies);
  return redirect(LOKAL.has(url.hostname) ? '/' : ABMELDEN_URL, 303);
};
