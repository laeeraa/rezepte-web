// Lesezugriffe auf die Datenbank (D1).
// Jede Seite eines Buchs lädt zuerst das Buch mit Kategorien und Tagsystem (ladeBuch)
// und danach die Rezepte oder Seiten, die sie braucht.
import { env } from 'cloudflare:workers';

export interface Buch {
  id: string;
  slug: string;
  name: string;
  /** Chips auf der Startseite des Buchs, `ziel` relativ zum Buch. */
  schnellzugriff: { text: string; ziel: string }[];
}

export interface Kategorie {
  id: string;
  slug: string;
  name: string;
  /** Name aus der Farbpalette in global.css (Klasse f-<farbe>). */
  farbe: string;
  vollkornTausch: boolean;
}

export interface Tag {
  id: string;
  key: string;
  name: string;
  /** „<gruppe>/<tag>“, so steht der Tag in Filtern und Adressen. */
  voll: string;
  gruppe: TagGruppe;
  /** Slugs der Kategorien, zu denen der Tag passt. Leer = zu allen. */
  kategorien: string[];
  /** Position im ganzen Tagsystem, zum Sortieren. */
  rang: number;
}

export interface TagGruppe {
  id: string;
  key: string;
  name: string;
  auswahl: 'eins' | 'mehrere';
  pflicht: boolean;
  frei: boolean;
  darstellung: 'gliederung' | 'merkmal' | 'herkunft';
  filter: 'oder' | 'und';
  aufKarte: boolean;
  tags: Tag[];
}

/** Ein Buch mit allem, was jede seiner Seiten braucht. */
export interface BuchKontext {
  buch: Buch;
  kategorien: Kategorie[];
  gruppen: TagGruppe[];
  tagNachId: Map<string, Tag>;
}

export interface RezeptKurz {
  id: string;
  slug: string;
  titel: string;
  kategorie: Kategorie;
  /** Tags in der Reihenfolge des Tagsystems. */
  tags: Tag[];
  portionen: string | null;
  zeit: number | null;
  bildKey: string | null;
  suchtext: string;
}

export interface Rezept extends RezeptKurz {
  quelle: string[];
  inhaltHtml: string;
  entwurf: boolean;
}

/** Ein Rezept so, wie es im Formular steht. */
export interface RezeptRoh {
  id: string;
  slug: string;
  titel: string;
  kategorie: string;
  /** „gruppe/tag“ */
  tags: string[];
  portionen: string | null;
  zeit: number | null;
  quelle: string[];
  md: string;
  entwurf: boolean;
  bildKey: string | null;
}

export interface Seite {
  slug: string;
  titel: string;
}

export interface SeiteVoll extends Seite {
  inhaltHtml: string;
}

const db = () => env.DB;

/** Alle Bücher mit Besitzerin und der Zahl ihrer fertigen Rezepte, alphabetisch. */
export async function ladeBuecher(): Promise<(Buch & { anzahl: number; besitzer: string | null })[]> {
  const { results } = await db()
    .prepare(
      `SELECT b.id, b.slug, b.name, b.schnellzugriff,
              (SELECT count(*) FROM rezept r WHERE r.buch_id = b.id AND r.status = 'fertig') AS anzahl,
              (SELECT group_concat(n.name, ', ') FROM mitglied m JOIN nutzer n ON n.id = m.nutzer_id
               WHERE m.buch_id = b.id AND m.rolle = 'besitzer') AS besitzer
       FROM buch b`,
    )
    .all<BuchZeile & { anzahl: number; besitzer: string | null }>();
  return results
    .map((z) => ({ ...zuBuch(z), anzahl: z.anzahl, besitzer: z.besitzer }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Buch mit Kategorien und Tagsystem, oder null, wenn es das Buch nicht gibt. */
export async function ladeBuch(slug: string): Promise<BuchKontext | null> {
  const buchId = `(SELECT id FROM buch WHERE slug = ?1)`;
  const [buecher, kategorien, gruppen, tags] = await db().batch([
    db().prepare(`SELECT id, slug, name, schnellzugriff FROM buch WHERE slug = ?1`).bind(slug),
    db().prepare(`SELECT * FROM kategorie WHERE buch_id = ${buchId} ORDER BY reihenfolge`).bind(slug),
    db().prepare(`SELECT * FROM tag_gruppe WHERE buch_id = ${buchId} ORDER BY reihenfolge`).bind(slug),
    db()
      .prepare(
        `SELECT t.id, t.key, t.name, t.gruppe_id,
                (SELECT json_group_array(k.slug) FROM tag_kategorie tk JOIN kategorie k ON k.id = tk.kategorie_id
                 WHERE tk.tag_id = t.id) AS kategorien
         FROM tag t JOIN tag_gruppe g ON g.id = t.gruppe_id
         WHERE g.buch_id = ${buchId}
         ORDER BY g.reihenfolge, t.reihenfolge`,
      )
      .bind(slug),
  ]);

  const buch = (buecher.results as BuchZeile[])[0];
  if (!buch) return null;

  const gruppenListe: TagGruppe[] = (gruppen.results as GruppeZeile[]).map((g) => ({
    id: g.id,
    key: g.key,
    name: g.name,
    auswahl: g.auswahl,
    pflicht: !!g.pflicht,
    frei: !!g.frei,
    darstellung: g.darstellung,
    filter: g.filter,
    aufKarte: !!g.auf_karte,
    tags: [],
  }));
  const tagNachId = new Map<string, Tag>();
  (tags.results as TagZeile[]).forEach((t, rang) => {
    const gruppe = gruppenListe.find((g) => g.id === t.gruppe_id)!;
    const tag: Tag = { id: t.id, key: t.key, name: t.name, voll: `${gruppe.key}/${t.key}`, gruppe, kategorien: JSON.parse(t.kategorien), rang };
    gruppe.tags.push(tag);
    tagNachId.set(tag.id, tag);
  });

  return {
    buch: zuBuch(buch),
    kategorien: (kategorien.results as KategorieZeile[]).map((k) => ({
      id: k.id,
      slug: k.slug,
      name: k.name,
      farbe: k.farbe,
      vollkornTausch: !!k.vollkorn_tausch,
    })),
    gruppen: gruppenListe,
    tagNachId,
  };
}

const REZEPT_SPALTEN = `r.id, r.slug, r.titel, r.kategorie_id, r.portionen, r.zeit, r.bild_key, r.suchtext,
  (SELECT group_concat(rt.tag_id) FROM rezept_tag rt WHERE rt.rezept_id = r.id) AS tag_ids`;

/** Alle fertigen Rezepte eines Buchs, alphabetisch. */
export async function ladeRezepte(k: BuchKontext): Promise<RezeptKurz[]> {
  const { results } = await db()
    .prepare(`SELECT ${REZEPT_SPALTEN} FROM rezept r WHERE r.buch_id = ? AND r.status = 'fertig'`)
    .bind(k.buch.id)
    .all<RezeptZeile>();
  return results.map((z) => zuRezeptKurz(k, z)).sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
}

/** Ein Rezept, auch als Entwurf (die Seite zeigt dann einen Hinweis), oder null. */
export async function ladeRezept(k: BuchKontext, slug: string): Promise<Rezept | null> {
  const z = await db()
    .prepare(`SELECT ${REZEPT_SPALTEN}, r.quelle, r.inhalt_html, r.status FROM rezept r WHERE r.buch_id = ? AND r.slug = ?`)
    .bind(k.buch.id, slug)
    .first<RezeptZeile & { quelle: string; inhalt_html: string; status: string }>();
  if (!z) return null;
  return { ...zuRezeptKurz(k, z), quelle: JSON.parse(z.quelle), inhaltHtml: z.inhalt_html, entwurf: z.status === 'entwurf' };
}

export async function ladeRezeptRoh(k: BuchKontext, slug: string): Promise<RezeptRoh | null> {
  const z = await db()
    .prepare(
      `SELECT r.id, r.slug, r.titel, k.slug AS kategorie, r.portionen, r.zeit, r.quelle, r.inhalt_md, r.status, r.bild_key,
              (SELECT group_concat(rt.tag_id) FROM rezept_tag rt WHERE rt.rezept_id = r.id) AS tag_ids
       FROM rezept r JOIN kategorie k ON k.id = r.kategorie_id
       WHERE r.buch_id = ? AND r.slug = ?`,
    )
    .bind(k.buch.id, slug)
    .first<{ id: string; slug: string; titel: string; kategorie: string; portionen: string | null; zeit: number | null;
      quelle: string; inhalt_md: string; status: string; bild_key: string | null; tag_ids: string | null }>();
  if (!z) return null;
  return {
    id: z.id,
    slug: z.slug,
    titel: z.titel,
    kategorie: z.kategorie,
    tags: (z.tag_ids ?? '').split(',').filter(Boolean).map((id) => k.tagNachId.get(id)!.voll),
    portionen: z.portionen,
    zeit: z.zeit,
    quelle: JSON.parse(z.quelle),
    md: z.inhalt_md,
    entwurf: z.status === 'entwurf',
    bildKey: z.bild_key,
  };
}

/** Entwürfe eines Buchs, zuletzt geänderte zuerst. */
export async function ladeEntwuerfe(k: BuchKontext): Promise<{ slug: string; titel: string; geaendert: string }[]> {
  const { results } = await db()
    .prepare(`SELECT slug, titel, geaendert FROM rezept WHERE buch_id = ? AND status = 'entwurf' ORDER BY geaendert DESC`)
    .bind(k.buch.id)
    .all<{ slug: string; titel: string; geaendert: string }>();
  return results;
}

/**
 * Ziele für [[Wikilinks]] in diesem Buch: Titel in Kleinbuchstaben → Adresse.
 * Entwürfe stehen mit null drin, damit Links auf sie als Text erscheinen.
 */
export async function ladeWikilinkZiele(k: BuchKontext): Promise<Map<string, { id: string; url: string | null }>> {
  const [rezepte, seiten] = await db().batch([
    db().prepare(`SELECT id, slug, titel, status FROM rezept WHERE buch_id = ?`).bind(k.buch.id),
    db().prepare(`SELECT id, slug, titel FROM seite WHERE buch_id = ?`).bind(k.buch.id),
  ]);
  // Bei gleichem Titel gewinnt die Wissensseite, wie beim Import.
  const ziele = new Map<string, { id: string; url: string | null }>();
  for (const r of rezepte.results as { id: string; slug: string; titel: string; status: string }[]) {
    ziele.set(r.titel.toLowerCase(), { id: r.id, url: r.status === 'entwurf' ? null : `/${k.buch.slug}/rezept/${r.slug}` });
  }
  for (const s of seiten.results as { id: string; slug: string; titel: string }[]) {
    ziele.set(s.titel.toLowerCase(), { id: s.id, url: `/${k.buch.slug}/wissen/${s.slug}` });
  }
  return ziele;
}

/** Wissensseiten eines Buchs, in ihrer Reihenfolge. */
export async function ladeSeiten(k: BuchKontext): Promise<Seite[]> {
  const { results } = await db()
    .prepare(`SELECT slug, titel FROM seite WHERE buch_id = ? ORDER BY reihenfolge, titel`)
    .bind(k.buch.id)
    .all<Seite>();
  return results;
}

export async function ladeSeite(k: BuchKontext, slug: string): Promise<SeiteVoll | null> {
  const z = await db()
    .prepare(`SELECT slug, titel, inhalt_html FROM seite WHERE buch_id = ? AND slug = ?`)
    .bind(k.buch.id, slug)
    .first<Seite & { inhalt_html: string }>();
  return z && { slug: z.slug, titel: z.titel, inhaltHtml: z.inhalt_html };
}

// ---------- Zeilen aus D1 ----------

interface BuchZeile { id: string; slug: string; name: string; schnellzugriff: string }
interface KategorieZeile { id: string; slug: string; name: string; farbe: string; vollkorn_tausch: number }
interface GruppeZeile {
  id: string; key: string; name: string; auswahl: TagGruppe['auswahl']; pflicht: number; frei: number;
  darstellung: TagGruppe['darstellung']; filter: TagGruppe['filter']; auf_karte: number;
}
interface TagZeile { id: string; key: string; name: string; gruppe_id: string; kategorien: string }
interface RezeptZeile {
  id: string; slug: string; titel: string; kategorie_id: string; portionen: string | null; zeit: number | null;
  bild_key: string | null; suchtext: string; tag_ids: string | null;
}

function zuBuch(z: BuchZeile): Buch {
  return { id: z.id, slug: z.slug, name: z.name, schnellzugriff: JSON.parse(z.schnellzugriff) };
}

function zuRezeptKurz(k: BuchKontext, z: RezeptZeile): RezeptKurz {
  const tags = (z.tag_ids ?? '')
    .split(',')
    .filter(Boolean)
    .map((id) => k.tagNachId.get(id)!)
    .sort((a, b) => a.rang - b.rang);
  return {
    id: z.id,
    slug: z.slug,
    titel: z.titel,
    kategorie: k.kategorien.find((kat) => kat.id === z.kategorie_id)!,
    tags,
    portionen: z.portionen,
    zeit: z.zeit,
    bildKey: z.bild_key,
    suchtext: z.suchtext,
  };
}
