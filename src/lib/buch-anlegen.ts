// Neues Rezeptbuch mit Kategorien und Tagsystem aus der Startkonfiguration.
import { env } from 'cloudflare:workers';
import type { Nutzer } from './nutzer';
import { KATEGORIEN, SCHNELLZUGRIFF, TAG_GRUPPEN } from './startkonfiguration.mjs';
import { slugify } from './slug.mjs';
import { adressFehler } from './adressen.mjs';

export const vorschlagSlug = (name: string) => slugify(name.split(/\s+/)[0] ?? '');

export async function pruefeBuch(name: string, slug: string): Promise<string[]> {
  const fehler: string[] = [];
  if (!name.trim()) fehler.push('Der Name des Buchs fehlt.');
  const adresse = adressFehler(slug);
  if (adresse) {
    fehler.push(adresse);
  } else if (await env.DB.prepare(`SELECT 1 FROM buch WHERE slug = ?`).bind(slug).first()) {
    fehler.push(`Die Adresse „${slug}“ ist schon vergeben.`);
  }
  return fehler;
}

/** Legt das Buch an, mit der Person als Besitzerin. Vorher mit pruefeBuch prüfen. */
export async function legeBuchAn(besitzer: Nutzer, name: string, slug: string): Promise<void> {
  const db = env.DB;
  const buchId = crypto.randomUUID();
  const kategorieIds = new Map(KATEGORIEN.map((k) => [k.slug, crypto.randomUUID()]));

  const anweisungen = [
    db.prepare(`INSERT INTO buch (id, slug, name, schnellzugriff) VALUES (?, ?, ?, ?)`).bind(buchId, slug, name.trim(), JSON.stringify(SCHNELLZUGRIFF)),
    db.prepare(`INSERT INTO mitglied (buch_id, nutzer_id, rolle) VALUES (?, ?, 'besitzer')`).bind(buchId, besitzer.id),
    ...KATEGORIEN.map((k, i) =>
      db
        .prepare(`INSERT INTO kategorie (id, buch_id, slug, name, farbe, reihenfolge, vollkorn_tausch) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(kategorieIds.get(k.slug), buchId, k.slug, k.name, k.farbe, i, k.vollkornTausch ? 1 : 0),
    ),
  ];
  TAG_GRUPPEN.forEach((g, i) => {
    const gruppeId = crypto.randomUUID();
    anweisungen.push(
      db
        .prepare(
          `INSERT INTO tag_gruppe (id, buch_id, key, name, reihenfolge, auswahl, pflicht, frei, darstellung, filter, auf_karte)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(gruppeId, buchId, g.key, g.name, i, g.auswahl ?? 'mehrere', g.pflicht ? 1 : 0, g.frei ? 1 : 0,
          g.darstellung ?? 'merkmal', g.filter ?? 'oder', g.aufKarte ? 1 : 0),
    );
    g.tags.forEach((t, j) => {
      const tagId = crypto.randomUUID();
      anweisungen.push(db.prepare(`INSERT INTO tag (id, gruppe_id, key, name, reihenfolge) VALUES (?, ?, ?, ?, ?)`).bind(tagId, gruppeId, t.key, t.name, j));
      for (const k of t.kategorien ?? []) {
        anweisungen.push(db.prepare(`INSERT INTO tag_kategorie (tag_id, kategorie_id) VALUES (?, ?)`).bind(tagId, kategorieIds.get(k)));
      }
    });
  });
  await db.batch(anweisungen);
}
