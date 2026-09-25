// Gemeinsame Grundlagen für Astro-Config, Content-Config und Seiten.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Pfad zum Obsidian-Vault. Überschreibbar mit der Umgebungsvariable VAULT_DIR
// (z. B. später für den Build auf Cloudflare, wo der Vault als Submodul liegt).
export const VAULT_DIR = path.resolve(process.cwd(), process.env.VAULT_DIR ?? '../../Nextcloud/Notes/Rezepte');
export const VAULT_URL = pathToFileURL(VAULT_DIR + path.sep);

export const BEREICHE = [
  { ordner: 'Süßes', slug: 'suesses' },
  { ordner: 'Brot & Brötchen', slug: 'brot-broetchen' },
  { ordner: 'Herzhaftes', slug: 'herzhaftes' },
  { ordner: 'Getränke', slug: 'getraenke' },
];

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function istTodo(datei) {
  const text = fs.readFileSync(datei, 'utf-8');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return frontmatter ? /^\s*-\s*todo\s*$/m.test(frontmatter[1]) : false;
}

// Ziel-URL für jede Notiz, damit [[Wikilinks]] aufgelöst werden können.
// Rezepte mit todo werden nicht veröffentlicht und bekommen deshalb keinen Link.
export function wikilinkZiele() {
  const ziele = {};
  const eintragen = (ordner, prefix) => {
    const dir = path.join(VAULT_DIR, ordner);
    if (!fs.existsSync(dir)) return;
    for (const datei of fs.readdirSync(dir)) {
      if (!datei.endsWith('.md')) continue;
      const name = datei.slice(0, -3);
      ziele[name.toLowerCase()] = istTodo(path.join(dir, datei)) ? null : `${prefix}/${slugify(name)}`;
    }
  };
  for (const { ordner } of BEREICHE) eintragen(ordner, '/rezept');
  eintragen('Wissen', '/wissen');
  return ziele;
}
