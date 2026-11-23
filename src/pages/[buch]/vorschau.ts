// Vorschau im Rezeptformular: rendert den geschickten Markdown-Text genauso wie beim Speichern.
import type { APIRoute } from 'astro';
import { ladeBuch, ladeWikilinkZiele } from '../../lib/db';
import { rezepttextRenderer } from '../../lib/rezepttext.mjs';
import { darfBearbeiten } from '../../lib/nutzer';

export const POST: APIRoute = async ({ params, request, locals }) => {
  const kontext = await ladeBuch(params.buch!);
  if (!kontext) return new Response(null, { status: 404 });
  if (!darfBearbeiten(locals.nutzer, kontext.buch.id)) return new Response(null, { status: 403 });
  const ziele = await ladeWikilinkZiele(kontext);
  const render = rezepttextRenderer(Object.fromEntries([...ziele].map(([name, z]) => [name, z.url])));
  const html = await render((await request.text()).replace(/\r\n/g, '\n'));
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
};
