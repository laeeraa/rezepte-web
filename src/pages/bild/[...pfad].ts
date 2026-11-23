// Liefert Fotos aus R2 aus (siehe src/lib/bilder.ts). Wie alle Seiten nur nach der Anmeldung.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params }) => {
  const pfad = params.pfad ?? '';
  // Fehlt die kleine Fassung (Upload ohne JavaScript), gibt es die große.
  const bild = (await env.BILDER.get(pfad)) ?? (pfad.endsWith('-klein') ? await env.BILDER.get(pfad.slice(0, -6)) : null);
  if (!bild) return new Response(null, { status: 404 });
  return new Response(bild.body, {
    headers: {
      'Content-Type': bild.httpMetadata?.contentType ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      // Jeder Upload bekommt einen neuen Schlüssel, ein Bild ändert sich also nie.
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: bild.httpEtag,
    },
  });
};
