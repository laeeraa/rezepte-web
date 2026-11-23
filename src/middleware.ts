import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { anmeldung } from './lib/anmeldung.js';

// Vor der Datenbank gab es nur ein Buch ohne Präfix (/rezept/pad-thai, /suesses, /rezepte?f=sauerteig).
// Solche Adressen leiten auf dieses Buch weiter, damit Lesezeichen weiter funktionieren.
const ALTES_BUCH = 'lara';
const ALTE_ADRESSE = /^\/(rezept\/[^/]+|rezepte|wissen(\/[^/]+)?|suesses|brot-broetchen|herzhaftes|getraenke)\/?$/;

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  // `astro dev` fragt kein Passwort ab, `astro preview` und die echte Seite schon.
  if (!import.meta.env.DEV) {
    const antwort = await anmeldung(request, env.PASSWORT);
    if (antwort) return antwort;
  }

  if (ALTE_ADRESSE.test(url.pathname)) {
    const ziel = new URL(`/${ALTES_BUCH}${url.pathname}`, url);
    // Eigenständige Tags heißen jetzt merkmal/… (f=sauerteig → f=merkmal/sauerteig).
    const filter = url.searchParams.get('f');
    if (filter) url.searchParams.set('f', filter.split(',').map((t) => (t.includes('/') ? t : `merkmal/${t}`)).join(','));
    ziel.search = url.search;
    return Response.redirect(ziel, 301);
  }

  return next();
});
