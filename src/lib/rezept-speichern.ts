// Rezepte anlegen, ändern und löschen.
// Prüft die Eingabe, erzeugt HTML und Suchtext und schreibt alles in einem Batch (= einer Transaktion).
// Ändern sich Titel oder Status, werden Rezepte und Wissensseiten neu gerendert, die per [[…]] darauf verweisen.
import { env } from 'cloudflare:workers';
import { ladeWikilinkZiele, type BuchKontext, type RezeptRoh, type TagGruppe } from './db';
import { pruefeTags } from './tagregeln.mjs';
import { rezepttextRenderer } from './rezepttext.mjs';
import { suchtext } from './suchtext.mjs';
import { slugify } from './slug.mjs';
import { kopiereBild, loescheBild, neuerBildKey, pruefeBild, speichereBild, type BildEingabe } from './bilder';

/** Was im Formular steht, als Text, damit es bei Fehlern unverändert wieder angezeigt werden kann. */
export interface RezeptEingabe {
  titel: string;
  kategorie: string;
  tags: string[];
  /** Neue Tags für freie Gruppen: Gruppen-Key → Namen mit Komma getrennt. */
  neueTags: Record<string, string>;
  portionen: string;
  zeit: string;
  /** Ein Link pro Zeile. */
  quelle: string;
  md: string;
  entwurf: boolean;
}

export const VORLAGE = `## Zutaten
-

## Zubereitung
1.

## Notizen
-
`;

export const leereEingabe = (): RezeptEingabe => ({
  titel: '', kategorie: '', tags: [], neueTags: {}, portionen: '', zeit: '', quelle: '', md: VORLAGE, entwurf: false,
});

export const eingabeAus = (r: RezeptRoh): RezeptEingabe => ({
  titel: r.titel,
  kategorie: r.kategorie,
  tags: r.tags,
  neueTags: {},
  portionen: r.portionen ?? '',
  zeit: r.zeit ? String(r.zeit) : '',
  quelle: r.quelle.join('\n'),
  md: r.md,
  entwurf: r.entwurf,
});

export function eingabeAusFormular(form: FormData): RezeptEingabe {
  const text = (name: string) => String(form.get(name) ?? '').trim();
  const tags: string[] = [];
  const neueTags: Record<string, string> = {};
  for (const [name, wert] of form) {
    // Checkboxen heißen „tag“, Auswahl-Gruppen mit genau einem Tag „tag:<gruppe>“ (Radio-Buttons).
    if ((name === 'tag' || name.startsWith('tag:')) && wert) tags.push(String(wert));
    if (name.startsWith('neu:')) neueTags[name.slice(4)] = String(wert);
  }
  return {
    titel: text('titel').replace(/\s+/g, ' '),
    kategorie: text('kategorie'),
    tags,
    neueTags,
    portionen: text('portionen'),
    zeit: text('zeit'),
    quelle: text('quelle'),
    md: String(form.get('inhalt') ?? '').replace(/\r\n/g, '\n'),
    entwurf: form.get('entwurf') === 'ja',
  };
}

export type Ergebnis = { ok: true; slug: string } | { ok: false; fehler: string[] };

type Anweisung = ReturnType<typeof env.DB.prepare>;
const db = () => env.DB;

/** Neues Rezept (ohne `bisher`) oder Änderung eines vorhandenen. */
export async function speichereRezept(
  k: BuchKontext,
  e: RezeptEingabe,
  bisher?: RezeptRoh,
  bild: BildEingabe = { entfernen: false },
  /** Wer speichert; bei neuen Rezepten als erstellt_von vermerkt. */
  nutzerId?: string,
  /** Beim Kopieren aus einem anderen Buch: Original und dessen Foto (wird kopiert, wenn kein neues hochgeladen wurde). */
  kopie?: { vonId: string; bildKey: string | null },
): Promise<Ergebnis> {
  const fehler: string[] = [];
  const slug = slugify(e.titel);
  if (!e.titel) fehler.push('Der Titel fehlt.');
  else if (!slug) fehler.push('Der Titel braucht mindestens einen Buchstaben oder eine Zahl.');

  const kategorie = k.kategorien.find((x) => x.slug === e.kategorie);
  if (!kategorie) fehler.push('Bitte eine Kategorie wählen.');

  const zeit = e.zeit ? Number(e.zeit) : null;
  if (zeit !== null && !(Number.isInteger(zeit) && zeit > 0)) fehler.push('Die Zeit bitte in ganzen Minuten angeben.');

  const quelle = e.quelle.split('\n').map((q) => q.trim()).filter(Boolean);
  for (const q of quelle) if (!/^https?:\/\/\S+$/.test(q)) fehler.push(`Die Quelle „${q}“ ist kein Link. Namen von Personen oder Büchern gehören zu „Entdeckt bei/in“.`);

  if (!e.md.trim()) fehler.push('Der Rezepttext fehlt.');
  fehler.push(...(await pruefeBild(bild)));

  // Neue Tags in freien Gruppen (z. B. Entdeckt bei/in). Gibt es den Tag schon, wird er einfach gewählt.
  const tags = new Set(e.tags);
  const neu: { id: string; gruppe: TagGruppe; key: string; name: string }[] = [];
  for (const [gruppenKey, liste] of Object.entries(e.neueTags)) {
    const gruppe = k.gruppen.find((g) => g.key === gruppenKey && g.frei);
    if (!gruppe) continue;
    for (const name of liste.split(',').map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
      const key = slugify(name);
      if (!key) continue;
      const voll = `${gruppe.key}/${key}`;
      if (!gruppe.tags.some((t) => t.key === key) && !neu.some((n) => n.gruppe === gruppe && n.key === key)) {
        neu.push({ id: crypto.randomUUID(), gruppe, key, name });
      }
      tags.add(voll);
    }
  }
  if (kategorie) fehler.push(...pruefeTags([...tags], kategorie, k.gruppen, { pflicht: !e.entwurf }));

  if (slug) {
    const gleicherSlug = await db()
      .prepare(`SELECT id, titel FROM rezept WHERE buch_id = ? AND slug = ?`)
      .bind(k.buch.id, slug)
      .first<{ id: string; titel: string }>();
    if (gleicherSlug && gleicherSlug.id !== bisher?.id) fehler.push(`Es gibt schon ein Rezept „${gleicherSlug.titel}“. Bitte einen anderen Titel wählen.`);
  }

  if (fehler.length || !kategorie) {
    if (bild.gross) fehler.push('Das Bild bitte noch einmal auswählen, es wurde nicht gespeichert.');
    return { ok: false, fehler };
  }

  // Wikilink-Ziele so, wie sie nach dem Speichern sind.
  const id = bisher?.id ?? crypto.randomUUID();
  const ziele = await ladeWikilinkZiele(k);
  if (bisher) ziele.delete(bisher.titel.toLowerCase());
  if (!ziele.has(e.titel.toLowerCase()) || ziele.get(e.titel.toLowerCase())!.id === id) {
    ziele.set(e.titel.toLowerCase(), { id, url: e.entwurf ? null : `/${k.buch.slug}/rezept/${slug}` });
  }
  const render = rezepttextRenderer(Object.fromEntries([...ziele].map(([name, z]) => [name, z.url])));

  const tagIds = new Map<string, string>([
    ...[...k.tagNachId.values()].map((t) => [t.voll, t.id] as [string, string]),
    ...neu.map((n) => [`${n.gruppe.key}/${n.key}`, n.id] as [string, string]),
  ]);
  const tagNamen = [...tags].map((voll) => {
    const vorhanden = [...k.tagNachId.values()].find((t) => t.voll === voll);
    return vorhanden?.name ?? neu.find((n) => `${n.gruppe.key}/${n.key}` === voll)!.name;
  });

  // Das neue Bild wird direkt vor dem Schreiben abgelegt (unten), der Schlüssel steht aber schon fest.
  const bildKopieren = !bild.gross && !bild.entfernen && kopie?.bildKey ? kopie.bildKey : null;
  const neuesBild = bild.gross || bildKopieren ? neuerBildKey(k.buch.id) : null;
  const behalten = bisher?.bildKey && !bild.entfernen ? bisher.bildKey : null;

  const werte = {
    kategorie_id: kategorie.id,
    slug,
    titel: e.titel,
    portionen: e.portionen || null,
    zeit,
    quelle: JSON.stringify(quelle),
    inhalt_md: e.md,
    inhalt_html: await render(e.md),
    suchtext: suchtext({ titel: e.titel, tagNamen, md: e.md }),
    status: e.entwurf ? 'entwurf' : 'fertig',
    bild_key: neuesBild ?? behalten,
  };

  const anweisungen: Anweisung[] = neu.map((n) =>
    db()
      .prepare(
        `INSERT INTO tag (id, gruppe_id, key, name, reihenfolge)
         VALUES (?1, ?2, ?3, ?4, (SELECT coalesce(max(reihenfolge), -1) + 1 FROM tag WHERE gruppe_id = ?2))`,
      )
      .bind(n.id, n.gruppe.id, n.key, n.name),
  );
  const spalten = Object.keys(werte);
  if (bisher) {
    anweisungen.push(
      db()
        .prepare(
          `UPDATE rezept SET ${spalten.map((s) => `${s} = ?`).join(', ')}, geaendert = datetime('now'),
             veroeffentlicht = coalesce(veroeffentlicht, CASE WHEN ? = 'fertig' THEN datetime('now') END)
           WHERE id = ? AND buch_id = ?`,
        )
        .bind(...Object.values(werte), werte.status, id, k.buch.id),
    );
  } else {
    anweisungen.push(
      db()
        .prepare(
          `INSERT INTO rezept (id, buch_id, erstellt_von, kopiert_von, veroeffentlicht, ${spalten.join(', ')})
           VALUES (?, ?, ?, ?, CASE WHEN ? = 'fertig' THEN datetime('now') END, ${spalten.map(() => '?').join(', ')})`,
        )
        .bind(id, k.buch.id, nutzerId ?? null, kopie?.vonId ?? null, werte.status, ...Object.values(werte)),
    );
  }
  anweisungen.push(db().prepare(`DELETE FROM rezept_tag WHERE rezept_id = ?`).bind(id));
  for (const voll of tags) {
    anweisungen.push(db().prepare(`INSERT INTO rezept_tag (rezept_id, tag_id) VALUES (?, ?)`).bind(id, tagIds.get(voll)));
  }

  // Verweise anderer Texte aktualisieren, wenn sich Titel oder Sichtbarkeit geändert haben.
  const geaendert = !bisher || bisher.titel !== e.titel || bisher.entwurf !== e.entwurf;
  if (geaendert) anweisungen.push(...(await verweiseNeuRendern(k, [e.titel, bisher?.titel], id, render)));
  anweisungen.push(ungenutzteFreieTagsLoeschen(k));

  // Klappt das Schreiben in die Datenbank nicht, wird das neue Bild wieder entfernt.
  // Das alte Bild wird erst nach erfolgreichem Schreiben gelöscht.
  try {
    if (neuesBild && bildKopieren) await kopiereBild(bildKopieren, neuesBild);
    else if (neuesBild) await speichereBild(neuesBild, { ...bild, gross: bild.gross! });
    await db().batch(anweisungen);
  } catch (fehler) {
    if (neuesBild) await loescheBild(neuesBild);
    throw fehler;
  }
  const altesBild = bisher?.bildKey;
  if (altesBild && altesBild !== werte.bild_key) await loescheBild(altesBild);
  return { ok: true, slug };
}

export async function loescheRezept(k: BuchKontext, bisher: RezeptRoh): Promise<void> {
  const ziele = await ladeWikilinkZiele(k);
  ziele.delete(bisher.titel.toLowerCase());
  const render = rezepttextRenderer(Object.fromEntries([...ziele].map(([name, z]) => [name, z.url])));
  await db().batch([
    db().prepare(`DELETE FROM rezept WHERE id = ? AND buch_id = ?`).bind(bisher.id, k.buch.id),
    ...(await verweiseNeuRendern(k, [bisher.titel], bisher.id, render)),
    ungenutzteFreieTagsLoeschen(k),
  ]);
  if (bisher.bildKey) await loescheBild(bisher.bildKey);
}

/** Freie Tags (z. B. Entdeckt bei/in) entstehen beim Speichern und verschwinden, wenn kein Rezept sie mehr hat. */
function ungenutzteFreieTagsLoeschen(k: BuchKontext): Anweisung {
  return db()
    .prepare(
      `DELETE FROM tag WHERE gruppe_id IN (SELECT id FROM tag_gruppe WHERE buch_id = ? AND frei = 1)
       AND id NOT IN (SELECT tag_id FROM rezept_tag)`,
    )
    .bind(k.buch.id);
}

const WIKILINK = /\[\[([^\]|#]+)/g;

/** Rezepte und Wissensseiten des Buchs, die per [[Titel]] auf einen der Titel verweisen, neu rendern. */
async function verweiseNeuRendern(
  k: BuchKontext,
  titel: (string | undefined)[],
  ausser: string,
  render: (md: string) => Promise<string>,
): Promise<Anweisung[]> {
  const gesucht = new Set(titel.filter((t): t is string => !!t).map((t) => t.toLowerCase()));
  // Grobe Vorauswahl in SQL (lower() kennt nur ASCII), genaue Prüfung danach.
  const bedingung = [...gesucht].map(() => `instr(lower(inhalt_md), lower(?)) > 0`).join(' OR ');
  const muster = [...gesucht].map((t) => `[[${t}`);
  const [rezepte, seiten] = await db().batch([
    db().prepare(`SELECT id, inhalt_md FROM rezept WHERE buch_id = ? AND id != ? AND (${bedingung})`).bind(k.buch.id, ausser, ...muster),
    db().prepare(`SELECT id, inhalt_md FROM seite WHERE buch_id = ? AND (${bedingung})`).bind(k.buch.id, ...muster),
  ]);
  const verweist = (md: string) => [...md.matchAll(WIKILINK)].some((m) => gesucht.has(m[1].trim().toLowerCase()));

  const anweisungen: Anweisung[] = [];
  for (const [tabelle, ergebnis] of [['rezept', rezepte], ['seite', seiten]] as const) {
    for (const z of ergebnis.results as { id: string; inhalt_md: string }[]) {
      if (!verweist(z.inhalt_md)) continue;
      anweisungen.push(db().prepare(`UPDATE ${tabelle} SET inhalt_html = ? WHERE id = ?`).bind(await render(z.inhalt_md), z.id));
    }
  }
  return anweisungen;
}
