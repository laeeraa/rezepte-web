// Liest den Obsidian-Vault einmalig ein und schreibt eine SQL-Datei, die daraus ein Rezeptbuch macht.
// Ein vorhandenes Buch mit demselben Slug wird dabei vollständig ersetzt.
//
//   BESITZER_EMAIL=… npm run import:vault      → schreibt .import/lara.sql
//   npm run db:import:lokal                    → spielt sie in die lokale D1 ein
//
// Optionen: --vault <pfad> (Standard ../rezepte-vault), --buch <slug> (lara),
//           --name <Buchname>, --nutzer <Name>, --aus <datei>
//
// Was dabei passiert:
// - Ordner werden zu Kategorien, das Tagsystem kommt aus src/lib/startkonfiguration.mjs.
// - Eigenständige Tags (sauerteig, hefe, …) werden zu merkmal/…, todo wird zum Status „entwurf“.
// - Absätze mit eingebetteten Bildern (![[…]], z. B. Fotos von Buchseiten) werden aus dem Text entfernt.
//   Die Webseite hat sie nie gezeigt, und die Bilder ziehen nicht mit um. Die Ausgabe listet sie auf.
// - Erstellt/geändert kommen aus der Git-Historie des Vaults.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { KATEGORIEN, TAG_GRUPPEN, SCHNELLZUGRIFF } from '../src/lib/startkonfiguration.mjs';
import { pruefeTags } from '../src/lib/tagregeln.mjs';
import { suchtext } from '../src/lib/suchtext.mjs';
import { rezepttextRenderer } from '../src/lib/rezepttext.mjs';
import { slugify } from '../src/lib/slug.mjs';

const { values: opt } = parseArgs({
  options: {
    vault: { type: 'string', default: process.env.VAULT_DIR ?? '../rezepte-vault' },
    buch: { type: 'string', default: 'lara' },
    name: { type: 'string', default: 'Laras Lieblingsrezepte' },
    nutzer: { type: 'string', default: 'Lara' },
    aus: { type: 'string' },
  },
});
const email = process.env.BESITZER_EMAIL;
if (!email) abbruch('BESITZER_EMAIL fehlt (die Adresse, mit der du dich später anmeldest).');
const VAULT = path.resolve(opt.vault);
if (!fs.existsSync(VAULT)) abbruch(`Vault nicht gefunden: ${VAULT}`);
const ziel = path.resolve(opt.aus ?? `.import/${opt.buch}.sql`);

const ORDNER = {
  'Süßes': 'suesses',
  'Brot & Brötchen': 'brot-broetchen',
  'Herzhaftes': 'herzhaftes',
  'Getränke': 'getraenke',
};

// Anzeigenamen für entdeckt/ aus src/lib/tags.ts. Unbekannte werden aus dem Slug abgeleitet.
const ENTDECKT = {
  neuseeland: 'Neuseeland', kanada: 'Kanada',
  mama: 'Mama', oma: 'Oma', vero: 'Vero', susanne: 'Susanne', bea: 'Bea', elke: 'Elke',
  hannah: 'Hannah', axel: 'Axel', elli: 'Elli', juli: 'Juli', norbert: 'Norbert',
  ibb: 'ibb', 'zinser-muehle': 'Zinser Mühle', 'lutz-geissler': 'Lutz Geißler',
  'wg-der-medien': 'WG der Medien', 'mimi-kraus': 'Mimi Kraus', 'abenteuer-leben': 'Abenteuer Leben',
  lenaeats: 'LenaEats', 'bianca-zapatka': 'Bianca Zapatka', 'veggie-einhorn': 'Veggie Einhorn',
  'emmi-kocht-einfach': 'Emmi kocht einfach', chefkoch: 'Chefkoch', 'einfach-backen': 'Einfach Backen',
  'rainbow-plant-life': 'Rainbow Plant Life', 'slowly-veggie': 'Slowly Veggie', foodnphoto: 'Food & Photo',
  'law-of-baking': 'Law of Baking', 'kitchen-stories': 'Kitchen Stories', 'feines-gemuese': 'Feines Gemüse',
  dierezepte: 'dierezepte.com', 'eat-this': 'Eat this!', 'backen-macht-gluecklich': 'Backen macht glücklich',
  'frau-huegels-kueche': 'Frau Hügels Küche', 'claras-crumbs': "Clara's Crumbs", instagram: 'Instagram',
  'sallys-blog': "Sally's Blog", 'nico-stanitzok': 'Nico Stanitzok', kruemelig: 'Krümelig',
};
const entdecktName = (key) => ENTDECKT[key] ?? key.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const warnungen = [];
const fehler = [];

// ---------- Vault lesen ----------

function lies(datei) {
  const text = fs.readFileSync(datei, 'utf-8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  return { daten: (m && YAML.parse(m[1])) || {}, body: m ? text.slice(m[0].length) : text };
}

function gitDaten(datei) {
  const git = (...args) => {
    try {
      return execFileSync('git', ['-C', VAULT, 'log', ...args, '--', path.relative(VAULT, datei)], { encoding: 'utf-8' }).trim();
    } catch {
      return '';
    }
  };
  const alle = git('--follow', '--format=%cI').split('\n').filter(Boolean);
  const sqlZeit = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) : null);
  return { erstellt: sqlZeit(alle.at(-1)), geaendert: sqlZeit(alle[0]) };
}

// Entfernt eingebettete Bilder wie die Webseite: Ein Absatz mit ![[…]] fällt ganz weg,
// in Listen und Tabellen nur die Zeile. Eine einzelne Zeile wie „Foto:“ direkt davor fällt mit weg.
function ohneEinbettungen(md, name) {
  if (!md.includes('![[')) return md;
  const zeilen = md.split('\n');

  // Blöcke als Listen von Zeilennummern. Leerzeilen trennen sie, Überschriften sind immer ein eigener Block.
  const bloecke = [];
  let aktuell = [];
  const abschliessen = () => { if (aktuell.length) bloecke.push(aktuell); aktuell = []; };
  zeilen.forEach((z, i) => {
    if (!z.trim()) return abschliessen();
    if (/^#{1,6}\s/.test(z)) { abschliessen(); bloecke.push([i]); return; }
    aktuell.push(i);
  });
  abschliessen();

  const raus = new Set();
  const istLabel = (block) => block.length === 1 && /^[^#\n]{1,40}:\s*$/.test(zeilen[block[0]]);
  bloecke.forEach((block, b) => {
    const mitBild = block.filter((i) => zeilen[i].includes('![['));
    if (!mitBild.length) return;
    const istAbsatz = !block.some((i) => /^\s*([-*+]|\d+\.|\|)/.test(zeilen[i]));
    if (!istAbsatz) return mitBild.forEach((i) => raus.add(i));
    block.forEach((i) => raus.add(i));
    if (b > 0 && istLabel(bloecke[b - 1])) raus.add(bloecke[b - 1][0]);
  });

  const neu = zeilen.filter((_, i) => !raus.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  warnungen.push(`${name}: eingebettete Bilder aus dem Text entfernt`);
  return neu;
}

function alsListe(wert) {
  if (wert === undefined || wert === null || wert === '') return [];
  return (Array.isArray(wert) ? wert : [wert]).map(String).map((s) => s.trim()).filter(Boolean);
}

const rezepte = [];
for (const [ordner, kategorie] of Object.entries(ORDNER)) {
  const dir = path.join(VAULT, ordner);
  for (const datei of fs.readdirSync(dir).filter((d) => d.endsWith('.md')).sort()) {
    const voll = path.join(dir, datei);
    const titel = datei.slice(0, -3);
    const { daten, body } = lies(voll);
    const alteTags = alsListe(daten.tags);
    const tags = alteTags.filter((t) => t !== 'todo').map((t) => (t.includes('/') ? t : `merkmal/${t}`));
    const quelle = alsListe(daten.quelle);
    for (const q of quelle) if (!/^https?:\/\//.test(q)) warnungen.push(`${titel}: Quelle ist kein Link: ${q}`);
    if (daten.bild) warnungen.push(`${titel}: Bild „${daten.bild}“ wird noch nicht übernommen`);
    rezepte.push({
      id: randomUUID(),
      titel,
      slug: slugify(titel),
      kategorie,
      tags,
      status: alteTags.includes('todo') ? 'entwurf' : 'fertig',
      portionen: daten.portionen === undefined || daten.portionen === null || daten.portionen === '' ? null : String(daten.portionen),
      zeit: typeof daten.zeit === 'number' && daten.zeit > 0 ? Math.round(daten.zeit) : null,
      quelle,
      md: ohneEinbettungen(body, titel),
      ...gitDaten(voll),
    });
  }
}

const seiten = fs
  .readdirSync(path.join(VAULT, 'Wissen'))
  .filter((d) => d.endsWith('.md'))
  .sort((a, b) => a.localeCompare(b, 'de'))
  .map((datei, i) => {
    const voll = path.join(VAULT, 'Wissen', datei);
    const titel = datei.slice(0, -3);
    return { id: randomUUID(), titel, slug: slugify(titel), md: ohneEinbettungen(lies(voll).body, `Wissen/${titel}`), reihenfolge: i, ...gitDaten(voll) };
  });

for (const liste of [rezepte, seiten]) {
  const gesehen = new Map();
  for (const r of liste) {
    if (gesehen.has(r.slug)) fehler.push(`„${r.titel}“ und „${gesehen.get(r.slug)}“ haben dieselbe Adresse ${r.slug}`);
    gesehen.set(r.slug, r.titel);
  }
}

// ---------- Tagsystem ----------

const kategorien = KATEGORIEN.map((k, i) => ({ ...k, id: randomUUID(), reihenfolge: i }));
const gruppen = TAG_GRUPPEN.map((g, i) => ({ ...g, id: randomUUID(), reihenfolge: i, tags: g.tags.map((t) => ({ ...t })) }));

// Freie Tags (entdeckt/…) aus den Rezepten übernehmen, alphabetisch nach Anzeigename.
for (const gruppe of gruppen.filter((g) => g.frei)) {
  const neu = new Set(rezepte.flatMap((r) => r.tags).filter((t) => t.startsWith(`${gruppe.key}/`)).map((t) => t.split('/')[1]));
  for (const key of neu) if (!gruppe.tags.some((t) => t.key === key)) gruppe.tags.push({ key, name: entdecktName(key) });
  gruppe.tags.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
for (const gruppe of gruppen) gruppe.tags.forEach((t, i) => Object.assign(t, { id: randomUUID(), reihenfolge: i }));

const tagNachName = new Map(gruppen.flatMap((g) => g.tags.map((t) => [`${g.key}/${t.key}`, t])));

for (const r of rezepte) {
  const kategorie = kategorien.find((k) => k.slug === r.kategorie);
  for (const f of pruefeTags(r.tags, kategorie, gruppen)) fehler.push(`${r.titel}: ${f}`);
}

if (fehler.length) {
  console.error(`Import abgebrochen, ${fehler.length} Problem(e):\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}

// ---------- Rendern ----------

const ziele = {};
for (const r of rezepte) ziele[r.titel.toLowerCase()] = r.status === 'entwurf' ? null : `/${opt.buch}/rezept/${r.slug}`;
for (const s of seiten) ziele[s.titel.toLowerCase()] = `/${opt.buch}/wissen/${s.slug}`;
const render = rezepttextRenderer(ziele);

for (const eintrag of [...rezepte, ...seiten]) eintrag.html = await render(eintrag.md);
for (const r of rezepte) r.suchtext = suchtext({ titel: r.titel, tagNamen: r.tags.map((t) => tagNachName.get(t).name), md: r.md });

// ---------- SQL schreiben ----------

const q = (v) =>
  v === null || v === undefined ? 'NULL'
  : typeof v === 'boolean' ? (v ? '1' : '0')
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;
// Felder mit undefined fallen weg, damit die Spalte ihren Standardwert bekommt.
const insert = (tabelle, zeile) => {
  const felder = Object.entries(zeile).filter(([, v]) => v !== undefined);
  return `INSERT INTO ${tabelle} (${felder.map(([k]) => k).join(', ')}) VALUES (${felder.map(([, v]) => q(v)).join(', ')});`;
};

const buchId = randomUUID();
const sql = [
  `-- Erzeugt von scripts/import-vault.mjs am ${new Date().toISOString()} aus ${VAULT}`,
  `-- Ersetzt das Buch „${opt.buch}“ vollständig.`,
  `DELETE FROM buch WHERE slug = ${q(opt.buch)};`,
  `INSERT INTO nutzer (id, email, name) VALUES (${q(randomUUID())}, ${q(email)}, ${q(opt.nutzer)}) ON CONFLICT (email) DO UPDATE SET name = excluded.name;`,
  insert('buch', { id: buchId, slug: opt.buch, name: opt.name, schnellzugriff: JSON.stringify(schnellzugriff()) }),
  `INSERT INTO mitglied (buch_id, nutzer_id, rolle) SELECT ${q(buchId)}, id, 'besitzer' FROM nutzer WHERE email = ${q(email)};`,
];
for (const k of kategorien) {
  sql.push(insert('kategorie', { id: k.id, buch_id: buchId, slug: k.slug, name: k.name, farbe: k.farbe, reihenfolge: k.reihenfolge, vollkorn_tausch: !!k.vollkornTausch }));
}
for (const g of gruppen) {
  sql.push(insert('tag_gruppe', {
    id: g.id, buch_id: buchId, key: g.key, name: g.name, reihenfolge: g.reihenfolge,
    auswahl: g.auswahl ?? 'mehrere', pflicht: !!g.pflicht, frei: !!g.frei, darstellung: g.darstellung ?? 'merkmal',
    filter: g.filter ?? 'oder', auf_karte: !!g.aufKarte,
  }));
  for (const t of g.tags) {
    sql.push(insert('tag', { id: t.id, gruppe_id: g.id, key: t.key, name: t.name, reihenfolge: t.reihenfolge }));
    for (const slug of t.kategorien ?? []) {
      sql.push(insert('tag_kategorie', { tag_id: t.id, kategorie_id: kategorien.find((k) => k.slug === slug).id }));
    }
  }
}
for (const r of rezepte) {
  sql.push(insert('rezept', {
    id: r.id, buch_id: buchId, kategorie_id: kategorien.find((k) => k.slug === r.kategorie).id,
    slug: r.slug, titel: r.titel, portionen: r.portionen, zeit: r.zeit, quelle: JSON.stringify(r.quelle),
    inhalt_md: r.md, inhalt_html: r.html, suchtext: r.suchtext, status: r.status,
    erstellt: r.erstellt ?? undefined, geaendert: r.geaendert ?? undefined,
  }));
  for (const t of r.tags) sql.push(insert('rezept_tag', { rezept_id: r.id, tag_id: tagNachName.get(t).id }));
}
for (const s of seiten) {
  sql.push(insert('seite', { id: s.id, buch_id: buchId, slug: s.slug, titel: s.titel, inhalt_md: s.md, inhalt_html: s.html, reihenfolge: s.reihenfolge, geaendert: s.geaendert ?? undefined }));
}

// D1 erlaubt höchstens 100 KB pro Anweisung.
for (const zeile of sql) if (Buffer.byteLength(zeile) > 100_000) abbruch(`Anweisung zu groß (${Buffer.byteLength(zeile)} Bytes): ${zeile.slice(0, 80)}…`);

fs.mkdirSync(path.dirname(ziel), { recursive: true });
fs.writeFileSync(ziel, sql.join('\n') + '\n');

const anzahl = (status) => rezepte.filter((r) => r.status === status).length;
console.log(`Buch „${opt.name}“ (/${opt.buch}): ${anzahl('fertig')} Rezepte, ${anzahl('entwurf')} Entwürfe, ${seiten.length} Wissensseiten,`);
console.log(`${kategorien.length} Kategorien, ${gruppen.length} Tag-Gruppen, ${tagNachName.size} Tags.`);
if (warnungen.length) console.log(`\nHinweise:\n- ${warnungen.join('\n- ')}`);
console.log(`\nGeschrieben: ${path.relative(process.cwd(), ziel)}`);

// Für Laras Buch der Schnellzugriff der bisherigen Startseite, sonst der Standard.
function schnellzugriff() {
  return opt.buch !== 'lara'
    ? SCHNELLZUGRIFF
    : [
        { text: 'Alle Rezepte', ziel: 'rezepte' },
        { text: 'Sauerteig', ziel: 'rezepte?f=merkmal/sauerteig' },
        { text: 'Brot', ziel: 'brot-broetchen#art-brot' },
        { text: 'Brötchen', ziel: 'brot-broetchen#art-broetchen' },
        { text: 'Vegan', ziel: 'rezepte?f=ernaehrung/vegan' },
        { text: 'Grundrezepte', ziel: 'rezepte?f=merkmal/grundrezept' },
        { text: 'Schnell', ziel: 'rezepte?f=aufwand/schnell' },
      ];
}

function abbruch(text) {
  console.error(text);
  process.exit(1);
}
