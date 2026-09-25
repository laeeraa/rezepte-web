// @ts-check
import { defineConfig } from 'astro/config';
import remarkObsidian from './src/remark-obsidian.mjs';
import { VAULT_DIR, wikilinkZiele } from './src/vault.mjs';

export default defineConfig({
  markdown: {
    remarkPlugins: [[remarkObsidian, { ziele: wikilinkZiele() }]],
  },
  vite: {
    server: { fs: { allow: ['.', VAULT_DIR] } },
  },
});
