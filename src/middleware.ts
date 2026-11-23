import { defineMiddleware } from 'astro:middleware';
import { angemeldeteEmail } from './lib/anmeldung';
import { ladeNutzer } from './lib/nutzer';

// Seiten, die auch Angemeldete ohne Einladung sehen dürfen.
const OHNE_EINLADUNG = /^\/(einladung\/[^/]+|kein-zugang)\/?$/;

// Vor der Datenbank gab es nur ein Buch ohne Präfix (/rezept/pad-thai, /suesses, /rezepte?f=sauerteig).
// Solche Adressen leiten auf dieses Buch weiter, damit Lesezeichen weiter funktionieren.
const ALTES_BUCH = 'lara';
const ALTE_ADRESSE = /^\/(rezept\/[^/]+|rezepte|wissen(\/[^/]+)?|suesses|brot-broetchen|herzhaftes|getraenke)\/?$/;

export const onRequest = defineMiddleware(async ({ request, url, locals, redirect }, next) => {
  const email = await angemeldeteEmail(request, url);
  if (!email) {
    // Online lässt Cloudflare Access niemanden ohne Anmeldung durch. Lokal fehlt dann LOKALE_ANMELDUNG in .dev.vars.
    return new Response('Nicht angemeldet.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  locals.email = email;
  locals.nutzer = await ladeNutzer(email);
  if (!locals.nutzer && !OHNE_EINLADUNG.test(url.pathname)) return redirect('/kein-zugang', 302);

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
