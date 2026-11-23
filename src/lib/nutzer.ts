// Personen, ihre Bücher und Einladungen.
// Angemeldet sind alle, die Cloudflare Access durchlassen. Auf die Seite dürfen nur Personen in `nutzer`,
// und dort landet man nur über eine Einladung (oder den Import des ersten Buchs).
import { env } from 'cloudflare:workers';

export interface Nutzer {
  id: string;
  email: string;
  name: string;
  /** Bücher, in denen die Person schreiben darf. */
  buecher: { id: string; slug: string; name: string; rolle: 'besitzer' | 'schreiben' }[];
}

export interface Einladung {
  token: string;
  fuer: string | null;
  erstellt: string;
  gueltigBis: string;
  angenommenVon: string | null;
  angenommenAm: string | null;
}

/** Einladungen gelten zwei Wochen. */
const GUELTIG_TAGE = 14;
const db = () => env.DB;

export async function ladeNutzer(email: string): Promise<Nutzer | null> {
  const [personen, buecher] = await db().batch([
    db().prepare(`SELECT id, email, name FROM nutzer WHERE email = ?1`).bind(email),
    db()
      .prepare(
        `SELECT b.id, b.slug, b.name, m.rolle FROM mitglied m
         JOIN buch b ON b.id = m.buch_id JOIN nutzer n ON n.id = m.nutzer_id
         WHERE n.email = ?1 ORDER BY m.rolle, b.name`,
      )
      .bind(email),
  ]);
  const person = personen.results[0] as { id: string; email: string; name: string } | undefined;
  return person ? { ...person, buecher: buecher.results as Nutzer['buecher'] } : null;
}

export const darfBearbeiten = (nutzer: Nutzer | null, buchId: string) => !!nutzer?.buecher.some((b) => b.id === buchId);

// ---------- Einladungen ----------

function zufallsToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function erstelleEinladung(von: Nutzer, fuer: string): Promise<string> {
  const token = zufallsToken();
  await db()
    .prepare(`INSERT INTO einladung (token, erstellt_von, fuer, gueltig_bis) VALUES (?, ?, ?, datetime('now', ?))`)
    .bind(token, von.id, fuer.trim().slice(0, 80) || null, `+${GUELTIG_TAGE} days`)
    .run();
  return token;
}

/** Eigene Einladungen: offene und angenommene der letzten Zeit, neueste zuerst. */
export async function ladeEinladungen(von: Nutzer): Promise<Einladung[]> {
  const { results } = await db()
    .prepare(
      `SELECT e.token, e.fuer, e.erstellt, e.gueltig_bis, n.name AS angenommen_von, e.angenommen_am
       FROM einladung e LEFT JOIN nutzer n ON n.id = e.angenommen_von
       WHERE e.erstellt_von = ? AND (e.angenommen_am IS NOT NULL OR e.gueltig_bis > datetime('now'))
       ORDER BY e.erstellt DESC LIMIT 50`,
    )
    .bind(von.id)
    .all<{ token: string; fuer: string | null; erstellt: string; gueltig_bis: string; angenommen_von: string | null; angenommen_am: string | null }>();
  return results.map((e) => ({
    token: e.token,
    fuer: e.fuer,
    erstellt: e.erstellt,
    gueltigBis: e.gueltig_bis,
    angenommenVon: e.angenommen_von,
    angenommenAm: e.angenommen_am,
  }));
}

export async function zieheEinladungZurueck(von: Nutzer, token: string): Promise<void> {
  await db().prepare(`DELETE FROM einladung WHERE token = ? AND erstellt_von = ? AND angenommen_am IS NULL`).bind(token, von.id).run();
}

/** Offene, gültige Einladung mit dem Namen der einladenden Person, oder null. */
export async function ladeOffeneEinladung(token: string): Promise<{ token: string; von: string } | null> {
  return db()
    .prepare(
      `SELECT e.token, n.name AS von FROM einladung e JOIN nutzer n ON n.id = e.erstellt_von
       WHERE e.token = ? AND e.angenommen_am IS NULL AND e.gueltig_bis > datetime('now')`,
    )
    .bind(token)
    .first<{ token: string; von: string }>();
}

/**
 * Legt die Person an und verbraucht die Einladung, beides in einer Transaktion.
 * Gibt false zurück, wenn die Einladung inzwischen nicht mehr gilt.
 */
export async function nimmEinladungAn(token: string, email: string, name: string): Promise<boolean> {
  const id = crypto.randomUUID();
  const gueltig = `token = ?4 AND angenommen_am IS NULL AND gueltig_bis > datetime('now')`;
  const [angelegt] = await db().batch([
    // Die Person zuerst (die Einladung verweist auf sie), aber nur bei gültiger Einladung.
    db()
      .prepare(`INSERT INTO nutzer (id, email, name) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM einladung WHERE ${gueltig})`)
      .bind(id, email, name, token),
    db()
      .prepare(`UPDATE einladung SET angenommen_von = ?1, angenommen_am = datetime('now') WHERE ${gueltig}`)
      .bind(id, null, null, token),
  ]);
  return (angelegt.meta?.changes ?? 0) > 0;
}

export async function aendereName(nutzer: Nutzer, name: string): Promise<void> {
  await db().prepare(`UPDATE nutzer SET name = ? WHERE id = ?`).bind(name, nutzer.id).run();
}
