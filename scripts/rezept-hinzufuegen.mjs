// Fügt ein Rezept aus einer Markdown-Datei (Frontmatter wie früher im Vault) einem Buch hinzu.
// Prüft Tags und Felder wie das Formular, erzeugt HTML und Suchtext und schreibt in D1.
//
//   node scripts/rezept-hinzufuegen.mjs --buch lara --kategorie brot-broetchen --datei naan.md --remote
//
// Frontmatter: titel (Pflicht), tags, portionen, zeit, quelle (Link oder Liste), entwurf: true
// Neue Werte in freien Gruppen (entdeckt/…) werden angelegt. Danach werden Verweise per [[…]] aktualisiert.
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
    buch: { type: 'string' }, kategorie: { type: 'string' }, datei: { type: 'string' },
    lokal: { type: 'boolean' }, remote: { type: 'boolean' },
  },
});
const ort = ortAus(opt);
if (!opt.buch || !opt.kategorie || !opt.datei) abbruch('Bitte --buch, --kategorie und --datei angeben.');

const text = fs.readFileSync(opt.datei, 'utf-8').replace(/\r\n/g, '\n');
const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
if (!m) abbruch('Die Datei braucht ein Frontmatter (--- … ---).');
const daten = YAML.parse(m[1]) ?? {};
const md = text.slice(m[0].length).trim() + '\n';
const titel = String(daten.titel ?? '').trim();
const slug = slugify(titel);
const liste = (w) => (w === undefined || w === null || w === '' ? [] : (Array.isArray(w) ? w : [w]).map(String));
const tags = liste(daten.tags);
const quelle = liste(daten.quelle);
const entwurf = daten.entwurf === true;

// ---------- Buch und Tagsystem laden ----------

const s = q(opt.buch);
const [buch] = abfrage(ort, `SELECT id, slug FROM buch WHERE slug = ${s}`);
if (!buch) abbruch(`Buch „${opt.buch}“ gibt es nicht.`);
const kategorien = abfrage(ort, `SELECT id, slug, name FROM kategorie WHERE buch_id = ${q(buch.id)}`);
const gruppenZeilen = abfrage(ort, `SELECT id, key, name, auswahl, pflicht, frei FROM tag_gruppe WHERE buch_id = ${q(buch.id)}`);
const tagZeilen = abfrage(
  ort,
  `SELECT t.id, t.key, t.name, t.gruppe_id,
          (SELECT json_group_array(k.slug) FROM tag_kategorie tk JOIN kategorie k ON k.id = tk.kategorie_id WHERE tk.tag_id = t.id) AS kategorien
   FROM tag t JOIN tag_gruppe g ON g.id = t.gruppe_id WHERE g.buch_id = ${q(buch.id)}`,
);
const vorhanden = abfrage(ort, `SELECT id, slug, titel, status FROM rezept WHERE buch_id = ${q(buch.id)}`);
const seiten = abfrage(ort, `SELECT slug, titel FROM seite WHERE buch_id = ${q(buch.id)}`);
const [besitzer] = abfrage(ort, `SELECT nutzer_id FROM mitglied WHERE buch_id = ${q(buch.id)} AND rolle = 'besitzer' LIMIT 1`);

const gruppen = gruppenZeilen.map((g) => ({
  ...g,
  pflicht: !!g.pflicht,
  frei: !!g.frei,
  tags: tagZeilen.filter((t) => t.gruppe_id === g.id).map((t) => ({ ...t, kategorien: JSON.parse(t.kategorien) })),
}));

// ---------- Prüfen ----------

const fehler = [];
if (!titel || !slug) fehler.push('titel fehlt im Frontmatter.');
const kategorie = kategorien.find((k) => k.slug === opt.kategorie);
if (!kategorie) fehler.push(`Kategorie „${opt.kategorie}“ gibt es nicht (${kategorien.map((k) => k.slug).join(', ')}).`);
if (vorhanden.some((r) => r.slug === slug)) fehler.push(`Es gibt schon ein Rezept mit der Adresse ${slug}.`);
if (daten.zeit !== undefined && !(Number.isInteger(daten.zeit) && daten.zeit > 0)) fehler.push('zeit muss eine ganze Zahl (Minuten) sein.');
for (const l of quelle) if (!/^https?:\/\/\S+$/.test(l)) fehler.push(`quelle ist kein Link: ${l}`);
if (kategorie) fehler.push(...pruefeTags(tags, kategorie, gruppen, { pflicht: !entwurf }));
if (fehler.length) abbruch(`Nicht gespeichert:\n- ${fehler.join('\n- ')}`);

// ---------- Schreiben ----------

const id = randomUUID();
const anweisungen = [];
const tagIds = [];
const tagNamen = [];
for (const voll of new Set(tags)) {
  const [gKey, key] = voll.split('/');
  const gruppe = gruppen.find((g) => g.key === gKey);
  let tag = gruppe.tags.find((t) => t.key === key);
  if (!tag) {
    // Neuer Wert in einer freien Gruppe; Anzeigename aus dem Slug.
    tag = { id: randomUUID(), key, name: key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') };
    anweisungen.push(`INSERT INTO tag (id, gruppe_id, key, name, reihenfolge) VALUES (${q(tag.id)}, ${q(gruppe.id)}, ${q(key)}, ${q(tag.name)}, (SELECT coalesce(max(reihenfolge), -1) + 1 FROM tag WHERE gruppe_id = ${q(gruppe.id)}));`);
  }
  tagIds.push(tag.id);
  tagNamen.push(tag.name);
}

const ziele = {};
for (const r of vorhanden) ziele[r.titel.toLowerCase()] = r.status === 'entwurf' ? null : `/${buch.slug}/rezept/${r.slug}`;
ziele[titel.toLowerCase()] = entwurf ? null : `/${buch.slug}/rezept/${slug}`;
for (const p of seiten) ziele[p.titel.toLowerCase()] = `/${buch.slug}/wissen/${p.slug}`;
const html = await rezepttextRenderer(ziele)(md);

anweisungen.push(
  `INSERT INTO rezept (id, buch_id, kategorie_id, slug, titel, portionen, zeit, quelle, inhalt_md, inhalt_html, suchtext, status, erstellt_von) VALUES (` +
    [id, buch.id, kategorie.id, slug, titel, daten.portionen ? String(daten.portionen) : null, daten.zeit ?? null, JSON.stringify(quelle),
      md, html, suchtext({ titel, tagNamen, md }), entwurf ? 'entwurf' : 'fertig', besitzer?.nutzer_id ?? null].map(q).join(', ') +
    `);`,
);
for (const tagId of tagIds) anweisungen.push(`INSERT INTO rezept_tag (rezept_id, tag_id) VALUES (${q(id)}, ${q(tagId)});`);

ausfuehren(ort, anweisungen, `rezept-${slug}`);
console.log(`Gespeichert: /${buch.slug}/rezept/${slug}${entwurf ? ' (Entwurf)' : ''}`);

// Andere Rezepte, die schon per [[Titel]] auf dieses verweisen, bekommen jetzt einen Link.
execFileSync('node', ['scripts/neu-rendern.mjs', ort === '--remote' ? '--remote' : '--lokal'], { stdio: 'inherit' });

function abbruch(meldung) {
  console.error(meldung);
  process.exit(1);
}
