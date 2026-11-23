// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Alle Seiten werden pro Anfrage im Cloudflare Worker gerendert und lesen aus D1.
// Rezepttexte liegen dort schon als HTML (src/lib/rezepttext.mjs), Astro rendert kein Markdown mehr.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // Kein Cloudflare-Images-Binding, Bilder kommen später aus R2. Der Adapter prüft im Code
    // auf `false` (dist/wrangler.js), seine Typen erlauben aber nur Text.
    imagesBindingName: /** @type {any} */ (false),
  }),
  // Astro-Sessions würden einen KV-Speicher anlegen. Der Login läuft später über Cloudflare Access.
  session: false,
});
