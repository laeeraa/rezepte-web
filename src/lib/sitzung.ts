// Sitzungs-Cookie der Seite. Cloudflare Access schützt nur /anmelden, /konto, /einladung und /bearbeiten.
// Wer sich dort anmeldet, bekommt dieses Cookie, damit auch die öffentlichen Seiten die Person erkennen.
// In der Datenbank steht nur der SHA-256-Hash des Cookie-Werts; Abmelden löscht die Sitzung sofort.
import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';

const COOKIE = 'sitzung';
const TAGE = 30;

async function hash(wert: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(wert));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function zufallsToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Hash des Cookies dieser Anfrage, oder null ohne Cookie. */
export async function sitzungsHash(cookies: AstroCookies): Promise<string | null> {
  const wert = cookies.get(COOKIE)?.value;
  return wert ? hash(wert) : null;
}

export async function starteSitzung(cookies: AstroCookies, nutzerId: string): Promise<void> {
  const token = zufallsToken();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sitzung WHERE gueltig_bis < datetime('now')`),
    env.DB.prepare(`INSERT INTO sitzung (hash, nutzer_id, gueltig_bis) VALUES (?, ?, datetime('now', ?))`).bind(await hash(token), nutzerId, `+${TAGE} days`),
  ]);
  cookies.set(COOKIE, token, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: TAGE * 24 * 60 * 60 });
}

export async function beendeSitzung(cookies: AstroCookies): Promise<void> {
  const h = await sitzungsHash(cookies);
  if (h) await env.DB.prepare(`DELETE FROM sitzung WHERE hash = ?`).bind(h).run();
  cookies.delete(COOKIE, { path: '/' });
}
