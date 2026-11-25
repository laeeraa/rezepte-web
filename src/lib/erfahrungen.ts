// Verlauf „Erfahrungen“ unter Rezepten (gekocht und Kommentare), „Was gibt's Neues“ und Hinweise.
// Einträge sehen nur angemeldete Personen; das prüfen die Seiten, bevor sie hier etwas laden.
import { env } from 'cloudflare:workers';
import type { Nutzer } from './nutzer';

export type Art = 'gekocht' | 'kommentar';

export interface Eintrag {
  id: string;
  art: Art;
  /** JJJJ-MM-TT */
  datum: string;
  text: string | null;
  nutzerId: string;
  name: string;
}

/** Gekocht-Statistik eines Rezepts für eine Person: letztes Datum und Anzahl. */
export interface Gekocht {
  letztes: string;
  anzahl: number;
}

export interface Neuigkeit {
  art: 'hinzugefuegt' | Art;
  /** Zeitpunkt (SQL-Datum UTC), zum Sortieren und für „vor 3 Tagen“. */
  zeit: string;
  person: string;
  buch: { slug: string; name: string };
  rezepte: { slug: string; titel: string }[];
  text: string | null;
}

/** Ein ungelesener Eintrag zu einem Rezept in einem eigenen Buch. */
export interface Hinweis extends Eintrag {
  zeit: string;
  buch: string;
  rezept: { slug: string; titel: string };
  neu: boolean;
}

const db = () => env.DB;
export const MAX_TEXT = 2000;
/** So lange gilt ein Rezept als neu. */
export const NEU_TAGE = 14;
/** Ab so vielen Tagen gilt ein Rezept als „länger nicht gekocht“. */
export const LANGE_TAGE = 90;

export async function ladeEintraege(rezeptId: string): Promise<Eintrag[]> {
  const { results } = await db()
    .prepare(
      `SELECT e.id, e.art, e.datum, e.text, e.nutzer_id, n.name FROM eintrag e JOIN nutzer n ON n.id = e.nutzer_id
       WHERE e.rezept_id = ? ORDER BY e.datum DESC, e.erstellt DESC`,
    )
    .bind(rezeptId)
    .all<{ id: string; art: Art; datum: string; text: string | null; nutzer_id: string; name: string }>();
  return results.map((e) => ({ id: e.id, art: e.art, datum: e.datum, text: e.text, nutzerId: e.nutzer_id, name: e.name }));
}

/** Prüft und speichert einen Eintrag. Gibt eine Fehlermeldung zurück oder null. */
export async function speichereEintrag(nutzer: Nutzer, rezeptId: string, art: Art, datum: string, text: string): Promise<string | null> {
  text = text.trim();
  if (text.length > MAX_TEXT) return `Bitte höchstens ${MAX_TEXT} Zeichen.`;
  if (art === 'kommentar' && !text) return 'Der Kommentar ist leer.';
  if (art === 'kommentar') datum = heute();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum))) return 'Das Datum stimmt nicht.';
  if (datum > heute()) return 'Das Datum liegt in der Zukunft.';
  await db()
    .prepare(`INSERT INTO eintrag (id, rezept_id, nutzer_id, art, datum, text) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), rezeptId, nutzer.id, art, datum, text || null)
    .run();
  return null;
}

/** Löscht einen eigenen Eintrag oder einen Eintrag zu einem Rezept in einem Buch, das der Person gehört. */
export async function loescheEintrag(nutzer: Nutzer, id: string): Promise<void> {
  await db()
    .prepare(
      `DELETE FROM eintrag WHERE id = ?1 AND (nutzer_id = ?2 OR rezept_id IN (
         SELECT r.id FROM rezept r JOIN mitglied m ON m.buch_id = r.buch_id WHERE m.nutzer_id = ?2 AND m.rolle = 'besitzer'))`,
    )
    .bind(id, nutzer.id)
    .run();
}

/** Wann die Person die Rezepte eines Buchs zuletzt gekocht hat, je Rezept-ID. */
export async function ladeMeinGekocht(nutzer: Nutzer, buchId: string): Promise<Map<string, Gekocht>> {
  const { results } = await db()
    .prepare(
      `SELECT e.rezept_id, max(e.datum) AS letztes, count(*) AS anzahl FROM eintrag e JOIN rezept r ON r.id = e.rezept_id
       WHERE e.nutzer_id = ? AND e.art = 'gekocht' AND r.buch_id = ? GROUP BY e.rezept_id`,
    )
    .bind(nutzer.id, buchId)
    .all<{ rezept_id: string; letztes: string; anzahl: number }>();
  return new Map(results.map((z) => [z.rezept_id, { letztes: z.letztes, anzahl: z.anzahl }]));
}

/** Zuletzt gekochte Rezepte eines Buchs (von allen), je Rezept nur der neueste Eintrag. */
export async function ladeZuletztGekocht(buchId: string, anzahl = 6): Promise<{ slug: string; titel: string; datum: string; name: string }[]> {
  const { results } = await db()
    .prepare(
      `SELECT r.slug, r.titel, e.datum, n.name FROM eintrag e
       JOIN rezept r ON r.id = e.rezept_id JOIN nutzer n ON n.id = e.nutzer_id
       WHERE r.buch_id = ?1 AND r.status = 'fertig' AND e.art = 'gekocht'
         AND e.id = (SELECT x.id FROM eintrag x WHERE x.rezept_id = e.rezept_id AND x.art = 'gekocht' ORDER BY x.datum DESC, x.erstellt DESC LIMIT 1)
       ORDER BY e.datum DESC, e.erstellt DESC LIMIT ?2`,
    )
    .bind(buchId, anzahl)
    .all<{ slug: string; titel: string; datum: string; name: string }>();
  return results;
}

/**
 * „Was gibt's Neues“ der letzten 30 Tage über alle Bücher.
 * Neue Rezepte sehen alle, gekocht und Kommentare nur Angemeldete.
 * Rezepte, die dieselbe Person am selben Tag ins selbe Buch gestellt hat, werden zusammengefasst.
 */
export async function ladeNeuigkeiten(angemeldet: boolean, anzahl = 12): Promise<Neuigkeit[]> {
  const anweisungen = [
    db().prepare(
      `SELECT r.slug, r.titel, r.veroeffentlicht AS zeit, b.slug AS buch_slug, b.name AS buch_name,
              coalesce(n.name, (SELECT x.name FROM mitglied m JOIN nutzer x ON x.id = m.nutzer_id
                                WHERE m.buch_id = b.id AND m.rolle = 'besitzer' LIMIT 1)) AS person
       FROM rezept r JOIN buch b ON b.id = r.buch_id LEFT JOIN nutzer n ON n.id = r.erstellt_von
       WHERE r.status = 'fertig' AND r.veroeffentlicht > datetime('now', '-30 days')
       ORDER BY r.veroeffentlicht DESC LIMIT 200`,
    ),
  ];
  if (angemeldet) {
    anweisungen.push(
      db().prepare(
        `SELECT e.art, e.text, e.erstellt AS zeit, n.name AS person, r.slug, r.titel, b.slug AS buch_slug, b.name AS buch_name
         FROM eintrag e JOIN nutzer n ON n.id = e.nutzer_id JOIN rezept r ON r.id = e.rezept_id JOIN buch b ON b.id = r.buch_id
         WHERE r.status = 'fertig' AND e.erstellt > datetime('now', '-30 days')
         ORDER BY e.erstellt DESC LIMIT ?`,
      ).bind(anzahl),
    );
  }
  const [rezepte, eintraege] = await db().batch(anweisungen);

  const gruppen = new Map<string, Neuigkeit>();
  for (const r of rezepte.results as { slug: string; titel: string; zeit: string; buch_slug: string; buch_name: string; person: string }[]) {
    const schluessel = `${r.buch_slug}|${r.person}|${r.zeit.slice(0, 10)}`;
    const gruppe = gruppen.get(schluessel);
    if (gruppe) gruppe.rezepte.push({ slug: r.slug, titel: r.titel });
    else {
      gruppen.set(schluessel, {
        art: 'hinzugefuegt', zeit: r.zeit, person: r.person ?? 'Jemand', buch: { slug: r.buch_slug, name: r.buch_name },
        rezepte: [{ slug: r.slug, titel: r.titel }], text: null,
      });
    }
  }
  const liste: Neuigkeit[] = [...gruppen.values()];
  for (const e of (eintraege?.results ?? []) as { art: Art; text: string | null; zeit: string; person: string; slug: string; titel: string; buch_slug: string; buch_name: string }[]) {
    liste.push({ art: e.art, zeit: e.zeit, person: e.person, buch: { slug: e.buch_slug, name: e.buch_name }, rezepte: [{ slug: e.slug, titel: e.titel }], text: e.text });
  }
  return liste.sort((a, b) => b.zeit.localeCompare(a.zeit)).slice(0, anzahl);
}

// ---------- Hinweise auf neue Einträge zu eigenen Rezepten ----------

const FREMD_IN_MEINEN_BUECHERN = `
  FROM eintrag e JOIN rezept r ON r.id = e.rezept_id JOIN buch b ON b.id = r.buch_id JOIN nutzer n ON n.id = e.nutzer_id
  WHERE e.nutzer_id != ?1 AND r.buch_id IN (SELECT buch_id FROM mitglied WHERE nutzer_id = ?1)`;
const SEIT = `coalesce((SELECT hinweise_gelesen_bis FROM nutzer WHERE id = ?1), (SELECT erstellt FROM nutzer WHERE id = ?1))`;

export async function zaehleHinweise(nutzer: Nutzer): Promise<number> {
  if (!nutzer.buecher.length) return 0;
  const z = await db().prepare(`SELECT count(*) AS n ${FREMD_IN_MEINEN_BUECHERN} AND e.erstellt > ${SEIT}`).bind(nutzer.id).first<{ n: number }>();
  return z?.n ?? 0;
}

/** Die letzten Einträge anderer zu eigenen Rezepten, ungelesene markiert. Danach gelten alle als gelesen. */
export async function ladeHinweiseUndMarkiere(nutzer: Nutzer, anzahl = 20): Promise<Hinweis[]> {
  if (!nutzer.buecher.length) return [];
  const [liste] = await db().batch([
    db()
      .prepare(
        `SELECT e.id, e.art, e.datum, e.text, e.nutzer_id, n.name, e.erstellt AS zeit, b.slug AS buch, r.slug, r.titel,
                e.erstellt > ${SEIT} AS neu
         ${FREMD_IN_MEINEN_BUECHERN} ORDER BY e.erstellt DESC LIMIT ?2`,
      )
      .bind(nutzer.id, anzahl),
    db().prepare(`UPDATE nutzer SET hinweise_gelesen_bis = datetime('now') WHERE id = ?`).bind(nutzer.id),
  ]);
  return (liste.results as { id: string; art: Art; datum: string; text: string | null; nutzer_id: string; name: string; zeit: string; buch: string; slug: string; titel: string; neu: number }[]).map((e) => ({
    id: e.id, art: e.art, datum: e.datum, text: e.text, nutzerId: e.nutzer_id, name: e.name, zeit: e.zeit, buch: e.buch,
    rezept: { slug: e.slug, titel: e.titel }, neu: !!e.neu,
  }));
}

// ---------- Anzeige ----------

const ZONE = 'Europe/Berlin';
const tagFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE }); // ergibt JJJJ-MM-TT
const datumFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: ZONE });
const datumMitJahr = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONE });

/** Heutiges Datum in deutscher Zeit, JJJJ-MM-TT. */
export const heute = () => tagFormat.format(new Date());

/** „heute“, „gestern“, „vor 3 Tagen“ oder „12. Nov.“ (mit Jahr, wenn nicht dieses Jahr). Nimmt JJJJ-MM-TT oder SQL-Zeit (UTC). */
export function wann(wert: string): string {
  const d = new Date(wert.length === 10 ? `${wert}T12:00:00Z` : `${wert.replace(' ', 'T')}Z`);
  const tage = Math.round((Date.parse(heute()) - Date.parse(tagFormat.format(d))) / 86_400_000);
  if (tage <= 0) return 'heute';
  if (tage === 1) return 'gestern';
  if (tage < 7) return `vor ${tage} Tagen`;
  return (tagFormat.format(d).slice(0, 4) === heute().slice(0, 4) ? datumFormat : datumMitJahr).format(d);
}

export const istNeu = (veroeffentlicht: string | null) =>
  !!veroeffentlicht && Date.now() - Date.parse(`${veroeffentlicht.replace(' ', 'T')}Z`) < NEU_TAGE * 86_400_000;

/** Text eines Eintrags in Stücke zerlegen, Links klickbar. Zeilenumbrüche erhält das CSS (white-space: pre-line). */
export function textTeile(text: string): { text: string; link?: string }[] {
  const teile: { text: string; link?: string }[] = [];
  let rest = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g)) {
    if (m.index! > rest) teile.push({ text: text.slice(rest, m.index) });
    teile.push({ text: m[0], link: m[0] });
    rest = m.index! + m[0].length;
  }
  if (rest < text.length) teile.push({ text: text.slice(rest) });
  return teile;
}
