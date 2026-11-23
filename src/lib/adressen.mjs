// Regeln für die Adresse eines Buchs (/<slug>), gemeinsam für die Seite und die Skripte.

// Adressen direkt unter / , die schon Seiten sind oder alte Links weiterleiten (src/middleware.ts).
export const RESERVIERT = new Set([
  'bild', 'konto', 'einladung', 'anmelden', 'abmelden', 'bearbeiten', 'cdn-cgi', '_astro', 'api', 'admin', 'neu', '404',
  'rezept', 'rezepte', 'wissen', 'suesses', 'brot-broetchen', 'herzhaftes', 'getraenke',
]);

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Fehlermeldung, wenn die Adresse nicht erlaubt ist (ohne zu prüfen, ob sie schon vergeben ist), sonst null. */
export function adressFehler(slug) {
  if (!SLUG.test(slug) || slug.length < 2 || slug.length > 30) {
    return 'Die Adresse darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (2 bis 30 Zeichen).';
  }
  if (RESERVIERT.has(slug)) return `Die Adresse „${slug}“ ist schon vergeben.`;
  return null;
}
