// Schützt die ganze Seite mit einem gemeinsamen Passwort (Secret PASSWORT).
// Wer nicht angemeldet ist, bekommt eine Anmeldeseite mit Tipp. Nach richtiger Eingabe
// merkt sich ein Cookie die Anmeldung. Groß-/Kleinschreibung und Leerzeichen am Rand zählen nicht.
const COOKIE = 'anmeldung';
const GUELTIG_SEKUNDEN = 180 * 24 * 60 * 60;
const TIPP = "Wie heißt Lara's Sauerteig?";

export default {
  async fetch(request, env) {
    if (!env.PASSWORT) {
      return new Response('Das Passwort ist nicht eingerichtet.', { status: 500 });
    }
    const schluessel = await hash(`lieblingsrezepte:${normalisiere(env.PASSWORT)}`);

    if (gleich(leseCookie(request, COOKIE), schluessel)) {
      return env.ASSETS.fetch(request);
    }

    if (request.method === 'POST') {
      const formular = await request.formData().catch(() => null);
      const eingabe = normalisiere(String(formular?.get('passwort') ?? ''));
      if (gleich(await hash(eingabe), await hash(normalisiere(env.PASSWORT)))) {
        // Zurück auf dieselbe Adresse, jetzt mit Cookie.
        return new Response(null, {
          status: 303,
          headers: {
            Location: new URL(request.url).pathname + new URL(request.url).search,
            'Set-Cookie': `${COOKIE}=${schluessel}; Path=/; Max-Age=${GUELTIG_SEKUNDEN}; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      }
      return anmeldeseite(true);
    }

    return anmeldeseite(false);
  },
};

function normalisiere(text) {
  return text.trim().toLowerCase();
}

async function hash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Vergleich mit gleicher Laufzeit, damit sie nichts über den richtigen Wert verrät.
function gleich(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  const kodierer = new TextEncoder();
  return crypto.subtle.timingSafeEqual(kodierer.encode(a), kodierer.encode(b));
}

function leseCookie(request, name) {
  for (const teil of (request.headers.get('Cookie') ?? '').split(';')) {
    const [schluessel, ...wert] = teil.trim().split('=');
    if (schluessel === name) return wert.join('=');
  }
  return null;
}

function anmeldeseite(falsch) {
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Lieblingsrezepte – Anmelden</title>
<style>
  :root {
    --papier: #faf7f2; --karte: #fff; --text: #2b2622; --leise: #6f665d;
    --linie: #e6ded3; --akzent: #9a4a26; --fehler: #b3261e;
    --serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
    --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --papier: #1c1a18; --karte: #262320; --text: #ece6de; --leise: #a89f95;
      --linie: #3a3530; --akzent: #e08a5f; --fehler: #f2847c;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: var(--papier); color: var(--text); font-family: var(--sans);
  }
  form {
    width: 100%; max-width: 360px; padding: 28px; border-radius: 12px;
    background: var(--karte); border: 1px solid var(--linie);
  }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.6rem; margin: 0 0 20px; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  .tipp { color: var(--leise); font-size: 0.95rem; margin: 0 0 12px; }
  input {
    width: 100%; padding: 10px 12px; font: inherit; color: inherit;
    background: var(--papier); border: 1px solid var(--linie); border-radius: 8px;
  }
  input:focus { outline: 2px solid var(--akzent); outline-offset: 1px; }
  .fehler { color: var(--fehler); font-size: 0.95rem; margin: 10px 0 0; }
  button {
    margin-top: 16px; width: 100%; padding: 10px; font: inherit; font-weight: 600;
    color: #fff; background: var(--akzent); border: 0; border-radius: 8px; cursor: pointer;
  }
</style>
</head>
<body>
<form method="post">
  <h1>Lieblingsrezepte</h1>
  <label for="passwort">Passwort</label>
  <p class="tipp" id="tipp">Tipp: ${TIPP}</p>
  <input id="passwort" name="passwort" type="password" autocomplete="current-password"
    aria-describedby="tipp${falsch ? ' fehler' : ''}" required autofocus>
  ${falsch ? '<p class="fehler" id="fehler" role="alert">Das war leider nicht richtig.</p>' : ''}
  <button type="submit">Anmelden</button>
</form>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
