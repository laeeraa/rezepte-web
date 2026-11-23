// Rendert Rezept- und Wissenstexte zu HTML. Läuft beim Speichern im Worker und beim Import in Node,
// das Ergebnis landet in der Datenbank (rezept.inhalt_html).
//
// Gleiche Schritte wie Astros Markdown (GFM, typografische Anführungszeichen, Überschriften-IDs),
// aber schlank nachgebaut, damit Shiki und MDX nicht im Worker landen. Zwei Unterschiede mit Absicht,
// weil Freunde gegenseitig ihre Bücher lesen:
// - Rohes HTML im Markdown wird nicht übernommen.
// - Links nur mit http(s), mailto, relativen Adressen oder Ankern.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkSmartypants from 'remark-smartypants';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import Slugger from 'github-slugger';
import { visit } from 'unist-util-visit';
import remarkObsidian from '../remark-obsidian.mjs';

/**
 * @param {Record<string, string | null>} ziele  Wikilink-Ziele: Name in Kleinbuchstaben → URL (null = kein Link)
 * @returns {(md: string) => Promise<string>}
 */
export function rezepttextRenderer(ziele) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkSmartypants)
    .use(remarkObsidian, { ziele })
    .use(remarkRehype)
    .use(rehypeSichereLinks)
    .use(rehypeUeberschriftenIds)
    .use(rehypeStringify);
  return async (md) => String(await processor.process(md));
}

const SICHER = /^(https?:|mailto:|\/|#|\.)/i;

function rehypeSichereLinks() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      const href = node.properties?.href;
      if (typeof href === 'string' && !SICHER.test(href.trim())) delete node.properties.href;
    });
  };
}

// IDs für Überschriften wie bei Astro (rehypeHeadingIds), damit Anker wie #dinkelkochstueck gleich bleiben.
function rehypeUeberschriftenIds() {
  return (tree) => {
    const slugger = new Slugger();
    visit(tree, 'element', (node) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      let text = '';
      visit(node, 'text', (kind) => {
        text += kind.value.replace(/\{/g, '${');
      });
      node.properties ??= {};
      if (typeof node.properties.id !== 'string') node.properties.id = slugger.slug(text);
    });
  };
}
