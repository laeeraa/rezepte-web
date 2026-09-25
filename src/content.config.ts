import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { BEREICHE, VAULT_URL, slugify } from './vault.mjs';
import { tagErlaubt } from './lib/tags';

const dateiname = (entry: string) => entry.split('/').pop()!.replace(/\.md$/, '');

const tag = z.string().superRefine((t, ctx) => {
  if (!tagErlaubt(t)) ctx.addIssue({ code: 'custom', message: `Unbekannter Tag "${t}". Erlaubt sind nur Tags aus Struktur.md.` });
});

const rezepte = defineCollection({
  loader: glob({
    pattern: BEREICHE.map((b) => `${b.ordner}/*.md`),
    base: VAULT_URL,
    generateId: ({ entry }) => slugify(dateiname(entry)),
  }),
  schema: ({ image }) =>
    z
      .object({
        tags: z.array(tag).default([]),
        portionen: z.union([z.string(), z.number()]).transform(String).optional(),
        zeit: z.number().positive().optional(),
        quelle: z
          .union([z.url(), z.array(z.url())])
          .optional()
          .transform((q) => (q === undefined ? [] : Array.isArray(q) ? q : [q])),
        // Dateiname in Attachments/, wird als Bild des Rezepts optimiert eingebunden.
        bild: z.preprocess((b) => (typeof b === 'string' && b ? `../Attachments/${b}` : undefined), image().optional()),
      })
      .superRefine((data, ctx) => {
        const ernaehrung = data.tags.filter((t) => t.startsWith('ernaehrung/'));
        if (ernaehrung.length !== 1) {
          ctx.addIssue({ code: 'custom', message: `Genau ein ernaehrung/-Tag nötig, gefunden: ${ernaehrung.join(', ') || 'keiner'}` });
        }
      }),
});

const wissen = defineCollection({
  loader: glob({
    pattern: 'Wissen/*.md',
    base: VAULT_URL,
    generateId: ({ entry }) => slugify(dateiname(entry)),
  }),
  schema: z.object({}).loose(),
});

export const collections = { rezepte, wissen };
