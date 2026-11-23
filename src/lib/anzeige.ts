import type { Tag, TagGruppe } from './db';

/** Name der ganzen Seite, über allen Büchern. */
export const SEITENNAME = 'Lieblingsrezepte';

export function formatZeit(minuten: number): string {
  if (minuten < 60) return `${minuten} min`;
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Kurzform eines Quell-Links: „https://www.chefkoch.de/…“ → „chefkoch.de“. */
export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\./, '');
  } catch {
    return url;
  }
}

export const mitDarstellung = (tags: Tag[], darstellung: TagGruppe['darstellung']) =>
  tags.filter((t) => t.gruppe.darstellung === darstellung);

/** Anker eines Abschnitts auf der Kategorieseite, z. B. #art-brot. */
export const abschnittId = (tag: Tag) => `${tag.gruppe.key}-${tag.key}`;
