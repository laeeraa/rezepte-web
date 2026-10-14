// Remark-Plugin für Obsidian-Syntax:
// - Absätze mit eingebetteten Bildern (![[bild.jpg]]) werden entfernt. Die Webseite
//   veröffentlicht nur das Bild aus dem Feld `bild`, nie Fotos aus dem Text (Buchseiten!).
// - [[Notiz]], [[Notiz#Abschnitt]] und [[Notiz|Text]] werden zu normalen Links.
// - Mengen unter „## Zutaten“ werden markiert, damit die Rezeptseite sie umrechnen kann.
// - Mehl-, Wasser- und Sauerteigzeilen werden markiert, damit man Mehl gegen Vollkorn tauschen kann.
import { visit, SKIP } from 'unist-util-visit';
import { slug } from 'github-slugger';
import { mengenTeile, mengenAttribute } from './lib/mengen.mjs';
import { zutatRolle, FESTE_GRUPPE, MEHLNAME, vollkornName } from './lib/vollkorn.mjs';

const WIKILINK = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export default function remarkObsidian({ ziele }) {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      const hatEinbettung = node.children.some((c) => c.type === 'text' && c.value.includes('![['));
      if (hatEinbettung && parent) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
    });

    visit(tree, 'image', (_node, index, parent) => {
      parent.children.splice(index, 1);
      return [SKIP, index];
    });

    visit(tree, 'text', (node, index, parent) => {
      if (!node.value.includes('[[')) return;
      const teile = [];
      let rest = 0;
      for (const m of node.value.matchAll(WIKILINK)) {
        const [ganz, name, abschnitt, text] = m;
        if (m.index > rest) teile.push({ type: 'text', value: node.value.slice(rest, m.index) });
        const ziel = ziele[name.trim().toLowerCase()];
        const anzeige = text ?? (abschnitt ? `${name} – ${abschnitt}` : name);
        if (ziel) {
          const url = abschnitt ? `${ziel}#${slug(abschnitt)}` : ziel;
          teile.push({ type: 'link', url, children: [{ type: 'text', value: anzeige }] });
        } else {
          teile.push({ type: 'text', value: anzeige });
        }
        rest = m.index + ganz.length;
      }
      if (!teile.length) return;
      if (rest < node.value.length) teile.push({ type: 'text', value: node.value.slice(rest) });
      parent.children.splice(index, 1, ...teile);
      return [SKIP, index + teile.length];
    });

    const zutaten = zutatenAbschnitt(tree);
    zutaten.forEach((node) => mengenMarkieren(node, false));
    rollenMarkieren(zutaten);
  };
}

const istH2 = (node) => node.type === 'heading' && node.depth === 2;
const text = (node) => node.value ?? node.children?.map(text).join('') ?? '';

function zutatenAbschnitt(tree) {
  const start = tree.children.findIndex((n) => istH2(n) && text(n).trim() === 'Zutaten');
  if (start < 0) return [];
  const ende = tree.children.findIndex((n, i) => i > start && istH2(n));
  return tree.children.slice(start + 1, ende < 0 ? undefined : ende);
}

// In Tabellen ist die erste Zeile die Kopfzeile („1 Portion | 4 Portionen“) und bleibt stehen.
// In Zellen zählt auch eine Zahl ohne Einheit („| Eier | 3 |“).
function mengenMarkieren(node, inZelle) {
  if (!node.children) return;
  inZelle ||= node.type === 'tableCell';
  const kinder = node.type === 'table' ? node.children.slice(1) : node.children;
  for (const kind of kinder) mengenMarkieren(kind, inZelle);
  node.children = node.children.flatMap((kind) => {
    if (kind.type !== 'text') return [kind];
    return mengenTeile(kind.value, { ende: inZelle }).map((teil) =>
      teil.wert === undefined
        ? { type: 'text', value: teil.text }
        : {
            type: 'menge',
            data: { hName: 'span', hProperties: { className: ['menge'], ...mengenAttribute(teil) } },
            children: [{ type: 'text', value: teil.text }],
          },
    );
  });
}


// Jede Listenzeile bekommt ihre Rolle (data-zutat) und die Nummer ihrer ###-Gruppe (data-gruppe).
// Der Name von tauschbarem Mehl wird eingefasst, damit die Seite ihn gegen Vollkorn tauschen kann.
function rollenMarkieren(abschnitt) {
  let gruppe = 0;
  let fest = false;
  for (const node of abschnitt) {
    if (node.type === 'heading') {
      gruppe += 1;
      fest = FESTE_GRUPPE.test(text(node));
    }
    if (node.type !== 'list' || fest) continue;
    for (const zeile of node.children) {
      const rolle = zutatRolle(text(zeile));
      if (!rolle) continue;
      zeile.data = { ...zeile.data, hProperties: { dataZutat: rolle, dataGruppe: gruppe } };
      if (rolle === 'mehl') mehlnameEinfassen(zeile);
    }
  }
}

function mehlnameEinfassen(node) {
  if (!node.children || node.type === 'link') return false;
  for (const [i, kind] of node.children.entries()) {
    const m = kind.type === 'text' && kind.value.match(MEHLNAME);
    if (!m) {
      if (mehlnameEinfassen(kind)) return true;
      continue;
    }
    node.children.splice(
      i,
      1,
      { type: 'text', value: kind.value.slice(0, m.index) },
      {
        type: 'mehlname',
        data: { hName: 'span', hProperties: { className: ['mehlname'], dataVollkorn: vollkornName(m[1]) } },
        children: [{ type: 'text', value: m[0] }],
      },
      { type: 'text', value: kind.value.slice(m.index + m[0].length) },
    );
    return true;
  }
  return false;
}
