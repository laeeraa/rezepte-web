// Wandelt alle Rezepte und Wissensseiten neu in HTML um und berechnet den Suchtext neu.
// Nötig, wenn sich die Umwandlung geändert hat (src/lib/rezepttext.mjs, mengen.mjs, vollkorn.mjs,
// remark-obsidian.mjs) oder Tags umbenannt wurden. Das Markdown bleibt unverändert.
//
//   npm run neu-rendern -- --lokal     lokale Datenbank (.wrangler/)
//   npm run neu-rendern -- --remote    echte Datenbank bei Cloudflare
//
// Liest über `wrangler d1 execute`, rendert hier in Node (ohne Rechenzeit-Limit des Workers)
// und schreibt die Änderungen als SQL-Datei, die danach eingespielt wird.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { rezepttextRenderer } from '../src/lib/rezepttext.mjs';
import { suchtext } from '../src/lib/suchtext.mjs';

const { values: opt } = parseArgs({ options: { lokal: { type: 'boolean' }, remote: { type: 'boolean' } } });
if (opt.lokal === opt.remote) {
  console.error('Bitte --lokal oder --remote angeben.');
  process.exit(1);
}
const ort = opt.remote ? '--remote' : '--local';

function abfrage(sql) {
  const ausgabe = execFileSync('npx', ['wrangler', 'd1', 'execute', 'rezepte', ort, '--json', '--command', sql], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(ausgabe)[0].results;
}

const buecher = abfrage(`SELECT id, slug, name FROM buch`);
const rezepte = abfrage(
  `SELECT r.id, r.buch_id, r.slug, r.titel, r.status, r.inhalt_md, r.inhalt_html, r.suchtext,
          (SELECT group_concat(t.name, char(31)) FROM rezept_tag rt JOIN tag t ON t.id = rt.tag_id WHERE rt.rezept_id = r.id) AS tag_namen
   FROM rezept r`,
);
const seiten = abfrage(`SELECT id, buch_id, slug, titel, inhalt_md, inhalt_html FROM seite`);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = [];
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

const datei = '.import/neu-rendern.sql';
fs.mkdirSync('.import', { recursive: true });
fs.writeFileSync(datei, sql.join('\n') + '\n');
execFileSync('npx', ['wrangler', 'd1', 'execute', 'rezepte', ort, '--file', datei], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`Eingespielt (${ort === '--remote' ? 'Cloudflare' : 'lokal'}).`);
