// Inhalt einer Rezeptseite für den Assistenten: die maschinenlesbaren Rezeptdaten (schema.org „Recipe“,
// die viele Rezeptseiten mitliefern) und der Text der Seite ohne Menüs, Skripte und Werbung.
// Ohne Abhängigkeiten, damit es sich auch außerhalb des Workers testen lässt.

const MAX_TEXT = 40_000;

/** Sucht in JSON-LD (auch in @graph und Listen) nach einem Objekt vom Typ Recipe. */
function findeRezept(daten: unknown): Record<string, unknown> | null {
  if (Array.isArray(daten)) {
    for (const eintrag of daten) {
      const treffer = findeRezept(eintrag);
      if (treffer) return treffer;
    }
    return null;
  }
  if (!daten || typeof daten !== 'object') return null;
  const objekt = daten as Record<string, unknown>;
  const typ = objekt['@type'];
  if (typ === 'Recipe' || (Array.isArray(typ) && typ.includes('Recipe'))) return objekt;
  return findeRezept(objekt['@graph'] ?? null);
}

/** Nur die Felder, die für das Rezept zählen. */
function auszug(rezept: Record<string, unknown>) {
  const felder = ['name', 'description', 'recipeYield', 'prepTime', 'cookTime', 'totalTime', 'recipeIngredient', 'recipeInstructions', 'recipeCategory', 'recipeCuisine', 'keywords', 'author'];
  return Object.fromEntries(felder.filter((f) => rezept[f] !== undefined).map((f) => [f, rezept[f]]));
}

const ENTITAETEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', ndash: '–', mdash: '—' };
const entschluesseln = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (ganz, code: string) => {
    if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    return ENTITAETEN[code] ?? ganz;
  });

export function seitenInhalt(html: string): { rezeptDaten: string | null; text: string } {
  let rezeptDaten: string | null = null;
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const rezept = findeRezept(JSON.parse(m[1].trim()));
      if (rezept) {
        rezeptDaten = JSON.stringify(auszug(rezept));
        break;
      }
    } catch {
      // Kaputtes JSON-LD einfach überspringen.
    }
  }
  const text = entschluesseln(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|aside)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|li|h[1-6]|div|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, MAX_TEXT);
  return { rezeptDaten, text };
}
