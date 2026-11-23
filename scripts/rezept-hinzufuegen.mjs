// Fügt Rezepte aus Markdown-Dateien (Frontmatter wie früher im Vault) einem Buch hinzu.
// Prüft Tags und Felder wie das Formular, erzeugt HTML und Suchtext und schreibt alles in einem Durchgang.
// Erst wenn alle Dateien in Ordnung sind, wird geschrieben.
//
//   node scripts/rezept-hinzufuegen.mjs --buch juli --remote --datei a.md --datei b.md …
//
// Frontmatter:
//   titel (Pflicht), kategorie (Slug, z. B. suesses; sonst --kategorie), tags, portionen, zeit, quelle (Link oder Liste),
//   entwurf: true, kopiert_von: <buch>/<rezept-slug>
// Tags wie `ernaehrung/vegan`. Neue Werte in freien Gruppen dürfen als Anzeigename stehen: `entdeckt/Tim Mälzer`.
// Danach werden Verweise per [[…]] in allen Rezepten aktualisiert.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { abfrage, ausfuehren, ortAus, q } from './d1.mjs';
import { pruefeTags } from '../src/lib/tagregeln.mjs';
import { rezepttextRenderer } from '../src/lib/rezepttext.mjs';
import { suchtext } from '../src/lib/suchtext.mjs';
import { slugify } from '../src/lib/slug.mjs';

const { values: opt } = parseArgs({
  options: {
    buch: { type: 'string' }, kategorie: { type: 'string' }, datei: { type: 'string', multiple: true },
    lokal: { type: 'boolean' }, remote: { type: 'boolean' },
  },
});
const ort = ortAus(opt);
if (!opt.buch || !opt.datei?.length) abbruch('Bitte --buch und mindestens eine --datei angeben.');

// ---------- Buch und Tagsystem laden ----------

const [buch] = abfrage(ort, `SELECT id, slug FROM buch WHERE slug = ${q(opt.buch)}`);
if (!buch) abbruch(`Buch „${opt.buch}“ gibt es nicht.`);
const b = q(buch.id);
const kategorien = abfrage(ort, `SELECT id, slug, name FROM kategorie WHERE buch_id = ${b}`);
const gruppen = abfrage(ort, `SELECT id, key, name, auswahl, pflicht, frei FROM tag_gruppe WHERE buch_id = ${b}`).map((g) => ({ ...g, pflicht: !!g.pflicht, frei: !!g.frei, tags: [] }));
for (const t of abfrage(
  ort,
  `SELECT t.id, t.key, t.name, t.gruppe_id,
          (SELECT json_group_array(k.slug) FROM tag_kategorie tk JOIN kategorie k ON k.id = tk.kategorie_id WHERE tk.tag_id = t.id) AS kategorien
   FROM tag t JOIN tag_gruppe g ON g.id = t.gruppe_id WHERE g.buch_id = ${b}`,
)) gruppen.find((g) => g.id === t.gruppe_id).tags.push({ ...t, kategorien: JSON.parse(t.kategorien) });
const vorhanden = abfrage(ort, `SELECT id, slug, titel, status FROM rezept WHERE buch_id = ${b}`);
const seiten = abfrage(ort, `SELECT slug, titel FROM seite WHERE buch_id = ${b}`);
const [besitzer] = abfrage(ort, `SELECT nutzer_id FROM mitglied WHERE buch_id = ${b} AND rolle = 'besitzer' LIMIT 1`);

// ---------- Dateien lesen und prüfen ----------

const liste = (w) => (w === undefined || w === null || w === '' ? [] : (Array.isArray(w) ? w : [w]).map(String));
const fehler = [];
const neueTags = new Map(); // "gruppe/key" → { id, gruppe, key, name }
const rezepte = [];

for (const datei of opt.datei) {
  const text = fs.readFileSync(datei, 'utf-8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) { fehler.push(`${datei}: Frontmatter (--- … ---) fehlt.`); continue; }
  const daten = YAML.parse(m[1]) ?? {};
  const titel = String(daten.titel ?? '').trim();
  const name = titel || datei;
  const r = {
    titel, slug: slugify(titel), md: text.slice(m[0].length).trim() + '\n', entwurf: daten.entwurf === true,
    portionen: daten.portionen ? String(daten.portionen) : null, zeit: daten.zeit ?? null, quelle: liste(daten.quelle),
    kategorie: kategorien.find((k) => k.slug === (daten.kategorie ?? opt.kategorie)), tags: [], kopiertVon: null,
  };
  if (!titel || !r.slug) fehler.push(`${name}: titel fehlt.`);
  if (!r.kategorie) fehler.push(`${name}: Kategorie „${daten.kategorie ?? opt.kategorie}“ gibt es nicht (${kategorien.map((k) => k.slug).join(', ')}).`);
  if (vorhanden.some((v) => v.slug === r.slug) || rezepte.some((v) => v.slug === r.slug)) fehler.push(`${name}: Adresse ${r.slug} ist schon vergeben.`);
  if (r.zeit !== null && !(Number.isInteger(r.zeit) && r.zeit > 0)) fehler.push(`${name}: zeit muss eine ganze Zahl (Minuten) sein.`);
  for (const l of r.quelle) if (!/^https?:\/\/\S+$/.test(l)) fehler.push(`${name}: quelle ist kein Link: ${l}`);
  if (daten.kopiert_von) {
    const [vonBuch, vonSlug] = String(daten.kopiert_von).split('/');
    const [von] = abfrage(ort, `SELECT r.id FROM rezept r JOIN buch x ON x.id = r.buch_id WHERE x.slug = ${q(vonBuch)} AND r.slug = ${q(vonSlug)}`);
    if (von) r.kopiertVon = von.id;
    else fehler.push(`${name}: kopiert_von ${daten.kopiert_von} gibt es nicht.`);
  }

  // Neue Werte in freien Gruppen dürfen als Anzeigename angegeben werden.
  for (const tag of liste(daten.tags)) {
    const [gKey, ...rest] = tag.split('/');
    const wert = rest.join('/');
    const gruppe = gruppen.find((g) => g.key === gKey);
    if (gruppe?.frei && !gruppe.tags.some((t) => t.key === wert)) {
      const key = slugify(wert);
      const bekannt = gruppe.tags.find((t) => t.key === key);
      if (!bekannt && !neueTags.has(`${gKey}/${key}`)) {
        const name = wert === key ? key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : wert;
        neueTags.set(`${gKey}/${key}`, { id: randomUUID(), gruppe, key, name });
      }
      r.tags.push(`${gKey}/${key}`);
    } else r.tags.push(tag);
  }
  if (r.kategorie) fehler.push(...pruefeTags(r.tags, r.kategorie, gruppen, { pflicht: !r.entwurf }).map((f) => `${name}: ${f}`));
  rezepte.push(r);
}
if (fehler.length) abbruch(`Nichts gespeichert:\n- ${fehler.join('\n- ')}`);

// ---------- Schreiben ----------

const tagNach = (voll) => {
  const [gKey, key] = voll.split('/');
  return gruppen.find((g) => g.key === gKey).tags.find((t) => t.key === key) ?? neueTags.get(voll);
};
const ziele = {};
for (const r of [...vorhanden, ...rezepte.map((r) => ({ ...r, status: r.entwurf ? 'entwurf' : 'fertig' }))]) {
  ziele[r.titel.toLowerCase()] = r.status === 'entwurf' ? null : `/${buch.slug}/rezept/${r.slug}`;
}
for (const p of seiten) ziele[p.titel.toLowerCase()] = `/${buch.slug}/wissen/${p.slug}`;
const render = rezepttextRenderer(ziele);

const sql = [...neueTags.values()].map(
  (t) => `INSERT INTO tag (id, gruppe_id, key, name, reihenfolge) VALUES (${q(t.id)}, ${q(t.gruppe.id)}, ${q(t.key)}, ${q(t.name)}, (SELECT coalesce(max(reihenfolge), -1) + 1 FROM tag WHERE gruppe_id = ${q(t.gruppe.id)}));`,
);
for (const r of rezepte) {
  const id = randomUUID();
  const tags = [...new Set(r.tags)].map(tagNach);
  sql.push(
    `INSERT INTO rezept (id, buch_id, kategorie_id, slug, titel, portionen, zeit, quelle, inhalt_md, inhalt_html, suchtext, status, kopiert_von, erstellt_von) VALUES (` +
      [id, buch.id, r.kategorie.id, r.slug, r.titel, r.portionen, r.zeit, JSON.stringify(r.quelle), r.md, await render(r.md),
        suchtext({ titel: r.titel, tagNamen: tags.map((t) => t.name), md: r.md }), r.entwurf ? 'entwurf' : 'fertig', r.kopiertVon,
        besitzer?.nutzer_id ?? null].map(q).join(', ') +
      `);`,
  );
  for (const t of tags) sql.push(`INSERT INTO rezept_tag (rezept_id, tag_id) VALUES (${q(id)}, ${q(t.id)});`);
}

ausfuehren(ort, sql, `rezepte-${buch.slug}`);
for (const r of rezepte) console.log(`Gespeichert: /${buch.slug}/rezept/${r.slug}${r.entwurf ? ' (Entwurf)' : ''}`);
if (neueTags.size) console.log(`Neue Tags: ${[...neueTags.values()].map((t) => `${t.gruppe.key}/${t.key} („${t.name}“)`).join(', ')}`);

// Andere Rezepte, die schon per [[Titel]] auf eines der neuen verweisen, bekommen jetzt einen Link.
execFileSync('node', ['scripts/neu-rendern.mjs', ort === '--remote' ? '--remote' : '--lokal'], { stdio: 'inherit' });

function abbruch(meldung) {
  console.error(meldung);
  process.exit(1);
}
