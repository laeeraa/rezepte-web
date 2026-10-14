// Mehl gegen Vollkorn tauschen: Zutatenzeilen erkennen, die dabei eine Rolle spielen.
// Die Rezeptseite rechnet daraus mehr Wasser und weniger Sauerteig (Regel aus „Koch- & Brühstücke“).

/** Mehr Wasser je Gramm getauschtem Mehl. */
export const WASSER_JE_MEHL = 0.075;
/** Sauerteig sinkt um diesen Anteil, wenn alles Mehl getauscht ist (anteilig bei weniger). */
export const SAUERTEIG_WENIGER = 0.5;

// Gruppen, deren Verhältnisse fest sind. Ihr Mehl und Wasser bleiben beim Tausch unverändert.
export const FESTE_GRUPPE = /koch|brüh|quell/i;

const GRAMM = String.raw`^(?:ca\. )?\d[\d,–-]*\s?(?:g|ml)\s+`;
const ROLLEN = [
  ['sauerteig', new RegExp(GRAMM + String.raw`(?:\S*sauerteig|anstellgut)`, 'i')],
  ['wasser', new RegExp(GRAMM + String.raw`(?:[a-zäöüß]+ )?wasser\b`, 'i')],
  ['milch', new RegExp(GRAMM + String.raw`(?:[a-zäöüß]+ )?\S*milch\b`, 'i')],
  ['vollkornmehl', new RegExp(GRAMM + String.raw`[^,(]*vollkornmehl`, 'i')],
  ['mehl', new RegExp(GRAMM + String.raw`(?:backstarkes )?(?:weizen|roggen|dinkel)mehl`, 'i')],
];

/** Rolle einer Zutatenzeile: 'mehl' (tauschbar), 'vollkornmehl', 'wasser', 'milch', 'sauerteig' oder undefined. */
export function zutatRolle(text) {
  text = text.trim();
  if (/kochstück/i.test(text)) return undefined;
  return ROLLEN.find(([, muster]) => muster.test(text))?.[0];
}

// Mehlname samt Typangabe: „Roggenmehl 1150“, „Weizenmehl Type 405 oder 550“, „backstarkes Weizenmehl (Type 550)“.
export const MEHLNAME = /(?:backstarkes )?(Weizen|Roggen|Dinkel)mehl(?: \(?(?:Type )?\d{3,4}(?: oder \d{3,4})?\)?)?/;
export const vollkornName = (sorte) => `${sorte}vollkornmehl`;
