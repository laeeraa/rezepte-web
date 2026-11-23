// Legt ein Rezeptbuch für eine Person an, die noch kein Konto haben muss.
// Die Person bekommt ein Konto mit ihrer E-Mail-Adresse und wird Besitzerin des Buchs. Meldet sie sich später
// über „Anmelden“ mit dieser Adresse an, kann sie sofort schreiben; eine Einladung braucht sie dann nicht.
//
//   node scripts/buch-anlegen.mjs --email juli@example.org --person Juli --name "Julis Rezepte" --slug juli --remote
//
// Kategorien und Tags kommen aus src/lib/startkonfiguration.mjs (wie beim Anlegen über die Seite).
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { abfrage, ausfuehren, ortAus, q } from './d1.mjs';
import { adressFehler } from '../src/lib/adressen.mjs';
import { KATEGORIEN, SCHNELLZUGRIFF, TAG_GRUPPEN } from '../src/lib/startkonfiguration.mjs';

const { values: opt } = parseArgs({
  options: {
    email: { type: 'string' }, person: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' },
    lokal: { type: 'boolean' }, remote: { type: 'boolean' },
  },
});
const ort = ortAus(opt);
const email = (opt.email ?? '').trim().toLowerCase();
const person = (opt.person ?? '').trim();
const name = (opt.name ?? '').trim();
const slug = (opt.slug ?? '').trim();

const fehler = [];
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fehler.push('--email fehlt oder ist keine E-Mail-Adresse.');
if (!person) fehler.push('--person (Name der Person) fehlt.');
if (!name) fehler.push('--name (Name des Buchs) fehlt.');
const adresse = adressFehler(slug);
if (adresse) fehler.push(adresse);
else if (abfrage(ort, `SELECT 1 FROM buch WHERE slug = ${q(slug)}`).length) fehler.push(`Die Adresse „${slug}“ ist schon vergeben.`);
if (fehler.length) {
  console.error(`Nicht angelegt:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}

const [vorhanden] = abfrage(ort, `SELECT id, name FROM nutzer WHERE email = ${q(email)}`);
const nutzerId = vorhanden?.id ?? randomUUID();
const buchId = randomUUID();
const kategorieIds = new Map(KATEGORIEN.map((k) => [k.slug, randomUUID()]));

const sql = [];
if (!vorhanden) sql.push(`INSERT INTO nutzer (id, email, name) VALUES (${q(nutzerId)}, ${q(email)}, ${q(person)});`);
sql.push(`INSERT INTO buch (id, slug, name, schnellzugriff) VALUES (${q(buchId)}, ${q(slug)}, ${q(name)}, ${q(JSON.stringify(SCHNELLZUGRIFF))});`);
sql.push(`INSERT INTO mitglied (buch_id, nutzer_id, rolle) VALUES (${q(buchId)}, ${q(nutzerId)}, 'besitzer');`);
KATEGORIEN.forEach((k, i) => {
  sql.push(`INSERT INTO kategorie (id, buch_id, slug, name, farbe, reihenfolge, vollkorn_tausch) VALUES (${[kategorieIds.get(k.slug), buchId, k.slug, k.name, k.farbe, i, !!k.vollkornTausch].map(q).join(', ')});`);
});
TAG_GRUPPEN.forEach((g, i) => {
  const gruppeId = randomUUID();
  sql.push(
    `INSERT INTO tag_gruppe (id, buch_id, key, name, reihenfolge, auswahl, pflicht, frei, darstellung, filter, auf_karte) VALUES (` +
      [gruppeId, buchId, g.key, g.name, i, g.auswahl ?? 'mehrere', !!g.pflicht, !!g.frei, g.darstellung ?? 'merkmal', g.filter ?? 'oder', !!g.aufKarte].map(q).join(', ') +
      `);`,
  );
  g.tags.forEach((t, j) => {
    const tagId = randomUUID();
    sql.push(`INSERT INTO tag (id, gruppe_id, key, name, reihenfolge) VALUES (${[tagId, gruppeId, t.key, t.name, j].map(q).join(', ')});`);
    for (const k of t.kategorien ?? []) sql.push(`INSERT INTO tag_kategorie (tag_id, kategorie_id) VALUES (${q(tagId)}, ${q(kategorieIds.get(k))});`);
  });
});

ausfuehren(ort, sql, `buch-${slug}`);
console.log(`Angelegt: /${slug} („${name}“), Besitzerin ${vorhanden ? `${vorhanden.name} (schon vorhanden)` : person} <${email}>`);
