// Wer ist angemeldet? Die Anmeldung selbst macht Cloudflare Access (Code per E-Mail) vor dem Worker.
// Access schickt bei jeder Anfrage ein signiertes Token mit (Header Cf-Access-Jwt-Assertion),
// hier wird es geprüft und die E-Mail-Adresse daraus gelesen. Ob die Person auch eingeladen ist,
// entscheidet danach die Middleware anhand der Tabelle nutzer.
//
// Lokal gibt es kein Access. Dort gilt die Adresse aus LOKALE_ANMELDUNG (.dev.vars), aber nur für
// Anfragen an localhost. Zum Testen anderer Personen kann der Header X-Lokale-Anmeldung sie ersetzen.
import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const LOKAL = new Set(['localhost', '127.0.0.1', '[::1]']);

// Schlüssel von Access, über Anfragen hinweg im Worker zwischengespeichert.
let schluessel: { team: string; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined;

export async function angemeldeteEmail(request: Request, url: URL): Promise<string | null> {
  if (LOKAL.has(url.hostname) && env.LOKALE_ANMELDUNG) {
    return (request.headers.get('X-Lokale-Anmeldung') || env.LOKALE_ANMELDUNG).trim().toLowerCase();
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;

  const aussteller = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
  if (schluessel?.team !== env.ACCESS_TEAM) {
    schluessel = { team: env.ACCESS_TEAM, jwks: createRemoteJWKSet(new URL(`${aussteller}/cdn-cgi/access/certs`)) };
  }
  try {
    const { payload } = await jwtVerify(token, schluessel.jwks, { issuer: aussteller, audience: env.ACCESS_AUD });
    return typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Abmelden bei Cloudflare Access. */
export const ABMELDEN_URL = '/cdn-cgi/access/logout';
