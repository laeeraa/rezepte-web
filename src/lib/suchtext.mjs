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
  return [titel, ...tagNamen, zutatenText(md)].join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
