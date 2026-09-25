// Remark-Plugin für Obsidian-Syntax:
// - Absätze mit eingebetteten Bildern (![[bild.jpg]]) werden entfernt. Die Webseite
//   veröffentlicht nur das Bild aus dem Feld `bild`, nie Fotos aus dem Text (Buchseiten!).
// - [[Notiz]], [[Notiz#Abschnitt]] und [[Notiz|Text]] werden zu normalen Links.
import { visit, SKIP } from 'unist-util-visit';
import { slug } from 'github-slugger';

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
  };
}
