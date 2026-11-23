// Wandelt alle Rezepte und Wissensseiten neu in HTML um und berechnet den Suchtext neu.
// Nötig, wenn sich die Umwandlung geändert hat (src/lib/rezepttext.mjs, mengen.mjs, vollkorn.mjs,
// remark-obsidian.mjs) oder Tags umbenannt wurden. Das Markdown bleibt unverändert.
//
//   npm run neu-rendern -- --lokal     lokale Datenbank (.wrangler/)
//   npm run neu-rendern -- --remote    echte Datenbank bei Cloudflare
//
// Liest über `wrangler d1 execute`, rendert hier in Node (ohne Rechenzeit-Limit des Workers)
// und schreibt die Änderungen als SQL-Datei, die danach eingespielt wird.
import { parseArgs } from 'node:util';
import { abfrage, ausfuehren, ortAus, q } from './d1.mjs';
import { rezepttextRenderer } from '../src/lib/rezepttext.mjs';
import { suchtext } from '../src/lib/suchtext.mjs';

const { values: opt } = parseArgs({ options: { lokal: { type: 'boolean' }, remote: { type: 'boolean' } } });
const ort = ortAus(opt);
const sql = [];

const buecher = abfrage(ort, `SELECT id, slug, name FROM buch`);
const rezepte = abfrage(
  ort,
  `SELECT r.id, r.buch_id, r.slug, r.titel, r.status, r.inhalt_md, r.inhalt_html, r.suchtext,
          (SELECT group_concat(t.name, char(31)) FROM rezept_tag rt JOIN tag t ON t.id = rt.tag_id WHERE rt.rezept_id = r.id) AS tag_namen
   FROM rezept r`,
);
const seiten = abfrage(ort, `SELECT id, buch_id, slug, titel, inhalt_md, inhalt_html FROM seite`);

let geaendert = 0;

for (const buch of buecher) {
  // Wikilink-Ziele wie in src/lib/db.ts (ladeWikilinkZiele): bei gleichem Titel gewinnt die Wissensseite.
  const ziele = {};
  for (const r of rezepte.filter((r) => r.buch_id === buch.id)) {
    ziele[r.titel.toLowerCase()] = r.status === 'entwurf' ? null : `/${buch.slug}/rezept/${r.slug}`;
  }
  for (const s of seiten.filter((s) => s.buch_id === buch.id)) ziele[s.titel.toLowerCase()] = `/${buch.slug}/wissen/${s.slug}`;
  const render = rezepttextRenderer(ziele);

  for (const r of rezepte.filter((r) => r.buch_id === buch.id)) {
    const html = await render(r.inhalt_md);
    const text = suchtext({ titel: r.titel, tagNamen: r.tag_namen ? r.tag_namen.split('\x1f') : [], md: r.inhalt_md });
    if (html === r.inhalt_html && text === r.suchtext) continue;
    sql.push(`UPDATE rezept SET inhalt_html = ${q(html)}, suchtext = ${q(text)} WHERE id = ${q(r.id)};`);
    geaendert++;
  }
  for (const s of seiten.filter((s) => s.buch_id === buch.id)) {
    const html = await render(s.inhalt_md);
    if (html === s.inhalt_html) continue;
    sql.push(`UPDATE seite SET inhalt_html = ${q(html)} WHERE id = ${q(s.id)};`);
    geaendert++;
  }
}

console.log(`${buecher.length} Bücher, ${rezepte.length} Rezepte, ${seiten.length} Wissensseiten gelesen, ${geaendert} geändert.`);
if (!sql.length) process.exit(0);

ausfuehren(ort, sql, 'neu-rendern');
console.log(`Eingespielt (${ort === '--remote' ? 'Cloudflare' : 'lokal'}).`);
