// Mengenangaben erkennen, damit die Rezeptseite sie umrechnen kann.
// Eine Zahl zählt als Menge, wenn direkt eine Einheit oder Zutat folgt („500 g“, „2 Äpfel“,
// „Saft von 1/2 Limette“). Mehltypen („Weizenmehl 550“, „Type 630“), °C, %, cm und Ø bleiben stehen.
const GLYPHEN = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3 };
const ZAHL = String.raw`\d+ \d+\/\d+|\d+\/\d+|\d+(?:,\d+)?[½¼¾⅓⅔]?|[½¼¾⅓⅔]`;
const MENGE = new RegExp(
  String.raw`(?<![\w,/]|Type |Ø ?)(${ZAHL})(?:\s?[–-]\s?(${ZAHL}))?(?=\s?([A-Za-zÄÖÜäöüß]+)|\s*$)`,
  'g',
);
const KEINE_EINHEIT = new Set(['oder', 'und', 'cm', 'mm', 'x']);
const METRISCH = new Set(['g', 'kg', 'ml', 'l', 'cl', 'dl']);

function wert(zahl) {
  const glyphe = GLYPHEN[zahl.at(-1)] ?? 0;
  if (glyphe) zahl = zahl.slice(0, -1);
  const [ganz, bruch] = zahl.includes(' ') ? zahl.split(' ') : zahl.includes('/') ? ['0', zahl] : [zahl, ''];
  const [z, n] = bruch ? bruch.split('/').map(Number) : [0, 1];
  return Number(ganz.replace(',', '.') || 0) + z / n + glyphe;
}

/**
 * Zerlegt einen Text in Stücke: normaler Text oder Menge mit Zahlenwert.
 * `ende`: auch eine Zahl ohne folgendes Wort ist eine Menge (Tabellenzellen wie „| Eier | 3 |“).
 */
export function mengenTeile(text, { ende = false } = {}) {
  const teile = [];
  let rest = 0;
  for (const m of text.matchAll(MENGE)) {
    const [ganz, von, bis, einheit] = m;
    if (einheit === undefined ? !ende : KEINE_EINHEIT.has(einheit)) continue;
    if (m.index > rest) teile.push({ text: text.slice(rest, m.index) });
    teile.push({
      text: ganz,
      wert: wert(von),
      bis: bis === undefined ? undefined : wert(bis),
      metrisch: METRISCH.has(einheit),
    });
    rest = m.index + ganz.length;
  }
  if (rest < text.length) teile.push({ text: text.slice(rest) });
  return teile;
}

/** HTML-Attribute für eine Menge, ausgewertet vom Skript auf der Rezeptseite. */
export const mengenAttribute = ({ wert, bis, metrisch }) => ({
  'data-wert': wert,
  'data-bis': bis,
  'data-metrisch': metrisch ? '' : undefined,
});
