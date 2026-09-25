import { getCollection, type CollectionEntry } from 'astro:content';
import { BEREICHE } from '../vault.mjs';
import { ART_JE_ORDNER, GRUPPEN, tagLabel } from './tags';

export type Bereich = (typeof BEREICHE)[number];

export interface Rezept {
  id: string;
  titel: string;
  bereich: Bereich;
  tags: string[];
  art: string[];
  entry: CollectionEntry<'rezepte'>;
  suchtext: string;
}

// Zutaten-Abschnitt als Klartext, damit die Suche z. B. "Tofu" oder "Linsen" findet.
function zutaten(body = ''): string {
  const m = body.match(/##\s*Zutaten[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return (m?.[1] ?? '')
    .replace(/!?\[\[[^\]]*\]\]/g, ' ')
    .replace(/[|*_#>\-\[\]()]/g, ' ')
    .replace(/\s+/g, ' ');
}

function zuRezept(entry: CollectionEntry<'rezepte'>): Rezept {
  const teile = (entry.filePath ?? '').replace(/\\/g, '/').split('/');
  const ordner = teile.at(-2)!;
  const titel = teile.at(-1)!.replace(/\.md$/, '');
  const bereich = BEREICHE.find((b) => b.ordner === ordner);
  if (!bereich) throw new Error(`${entry.filePath}: unbekannter Ordner "${ordner}"`);

  const tags = entry.data.tags;
  const art = tags.filter((t) => t.startsWith('art/')).map((t) => t.slice(4));
  const erlaubt = ART_JE_ORDNER[ordner];
  if (erlaubt.length && !art.length) throw new Error(`${entry.filePath}: mindestens ein art/-Tag nötig`);
  for (const a of art) {
    if (!erlaubt.includes(a)) throw new Error(`${entry.filePath}: art/${a} passt nicht zum Ordner "${ordner}" (erlaubt: ${erlaubt.join(', ')})`);
  }

  const suchtext = [titel, ...tags.map(tagLabel), zutaten(entry.body)].join(' ').toLowerCase();
  return { id: entry.id, titel, bereich, tags, art, entry, suchtext };
}

let cache: Rezept[] | undefined;

/** Alle veröffentlichten Rezepte (ohne todo), alphabetisch sortiert. */
export async function getRezepte(): Promise<Rezept[]> {
  cache ??= (await getCollection('rezepte'))
    .map(zuRezept)
    .filter((r) => !r.tags.includes('todo'))
    .sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  return cache;
}

export function artLabel(wert: string): string {
  return (GRUPPEN.art.werte as Record<string, string>)[wert] ?? wert;
}

export function formatZeit(minuten: number): string {
  if (minuten < 60) return `${minuten} min`;
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
