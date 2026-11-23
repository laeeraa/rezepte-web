// Suchtext eines Rezepts: Titel, Tag-Namen und der Zutaten-Abschnitt als Klartext,
// damit die Suche z. B. „Tofu“ oder „Linsen“ findet.

export function zutatenText(md = '') {
  const m = md.match(/##\s*Zutaten[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return (m?.[1] ?? '')
    .replace(/!?\[\[[^\]]*\]\]/g, ' ')
    .replace(/[|*_#>\-\[\]()]/g, ' ')
    .replace(/\s+/g, ' ');
}

/** @param {{ titel: string, tagNamen: string[], md: string }} rezept */
export function suchtext({ titel, tagNamen, md }) {
  // Tag-Namen sortiert, damit derselbe Text herauskommt, egal in welcher Reihenfolge die Tags kommen.
  const tags = [...tagNamen].sort((a, b) => a.localeCompare(b, 'de'));
  return [titel, ...tags, zutatenText(md)].join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
