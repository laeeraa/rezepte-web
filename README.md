# Lara's Lieblingsrezepte

Statische Webseite für die Rezeptsammlung aus dem Obsidian-Vault, gebaut mit [Astro](https://astro.build).
Die Rezepte selbst liegen **nicht** hier, sondern im Vault. Die Seite liest sie beim Bauen ein.

## Starten

```sh
npm install      # einmalig
npm run dev      # Entwicklungsserver auf http://localhost:4321
npm run build    # fertige Seite nach dist/
npm run preview  # dist/ lokal ansehen
```

Der Vault wird standardmäßig unter `../../Nextcloud/Notes/Rezepte` erwartet.
Ein anderer Pfad geht über die Umgebungsvariable `VAULT_DIR`.

## Was die Seite aus dem Vault macht

- **Ordner** `Süßes`, `Brot & Brötchen`, `Herzhaftes`, `Getränke` werden zu Bereichen, `Wissen` zu Nachschlageseiten.
- **Tags** werden beim Bauen gegen das Tagsystem aus `Struktur.md` geprüft (`src/lib/tags.ts`).
  Ein unbekannter Tag oder ein falscher `art/`-Tag bricht den Build mit einer Meldung ab.
- **Rezepte mit `todo`** werden nicht veröffentlicht.
- **Bilder:** Veröffentlicht wird nur das Bild aus dem Feld `bild`. Im Text eingebettete Bilder
  (`![[…]]`, z. B. Fotos von Buchseiten) werden entfernt.
- **Wikilinks** `[[Rezept]]` und `[[Rezept#Abschnitt]]` werden zu normalen Links.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/vault.mjs` | Vault-Pfad, Bereiche, Slugs, Wikilink-Ziele |
| `src/content.config.ts` | Liest Rezepte und Wissen, prüft das Frontmatter |
| `src/lib/tags.ts` | Tagsystem und Anzeigenamen |
| `src/lib/rezepte.ts` | Rezepte laden, `art/` je Ordner prüfen, Suchtext |
| `src/remark-obsidian.mjs` | Obsidian-Syntax (Einbettungen, Wikilinks) |
| `src/components/RezeptListe.astro` | Liste mit Suche und kombinierbaren Filtern |
| `src/pages/` | Start, Bereiche, alle Rezepte, Rezeptseite, Wissen |

## Neuer Tag

1. In `Struktur.md` im Vault eintragen.
2. In `src/lib/tags.ts` ergänzen (bei `entdeckt/` optional nur den Anzeigenamen).
