import { defineMiddleware } from 'astro:middleware';
import { angemeldeteEmail } from './lib/anmeldung';
import { ladeNutzer, ladeNutzerZurSitzung } from './lib/nutzer';
import { sitzungsHash, starteSitzung } from './lib/sitzung';

// Pfade hinter Cloudflare Access. Alles andere (Lesen) ist öffentlich.
// Dieselben Pfade müssen in der Access-App eingetragen sein (README, „Cloudflare Access einrichten“).
const GESCHUETZT = /^\/(anmelden|konto|einladung|bearbeiten)(\/|$)/;
// Geschützte Pfade, die auch Angemeldete ohne Konto sehen dürfen.
const OHNE_KONTO = /^\/(anmelden|einladung\/[^/]+)\/?$/;

// Vor der Datenbank gab es nur ein Buch ohne Präfix (/rezept/pad-thai, /suesses, /rezepte?f=sauerteig).
// Solche Adressen leiten auf dieses Buch weiter, damit Lesezeichen weiter funktionieren.
const ALTES_BUCH = 'lara';
const ALTE_ADRESSE = /^\/(rezept\/[^/]+|rezepte|wissen(\/[^/]+)?|suesses|brot-broetchen|herzhaftes|getraenke)\/?$/;

export const onRequest = defineMiddleware(async ({ request, url, locals, cookies, redirect }, next) => {
  locals.email = null;
  locals.nutzer = null;
  const sitzung = await sitzungsHash(cookies);
  const ausSitzung = sitzung ? await ladeNutzerZurSitzung(sitzung) : null;

  if (GESCHUETZT.test(url.pathname)) {
    const email = await angemeldeteEmail(request, url);
    if (!email) {
      // Online lässt Cloudflare Access hier niemanden ohne Anmeldung durch. Lokal fehlt dann LOKALE_ANMELDUNG.
      return new Response('Nicht angemeldet.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    locals.email = email;
    locals.nutzer = await ladeNutzer(email);
    if (!locals.nutzer && !OHNE_KONTO.test(url.pathname)) return redirect('/anmelden', 302);
    // Damit auch die öffentlichen Seiten die Person erkennen.
    if (locals.nutzer && ausSitzung?.id !== locals.nutzer.id) await starteSitzung(cookies, locals.nutzer.id);
    return next();
  }

  locals.nutzer = ausSitzung;
  if (sitzung && !ausSitzung) cookies.delete('sitzung', { path: '/' });

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
