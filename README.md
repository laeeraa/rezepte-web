# Lara's Lieblingsrezepte

Statische Webseite für die Rezeptsammlung aus dem Obsidian-Vault, gebaut mit [Astro](https://astro.build).
Die Rezepte selbst liegen **nicht** hier, sondern im Vault. Die Seite liest sie beim Bauen ein.

## Starten

```sh
npm install      # einmalig
npm run dev      # Entwicklungsserver auf http://localhost:4321
npm run build    # fertige Seite nach dist/
npm run preview  # dist/ lokal ansehen
npm run preview:worker  # wie online, mit Anmeldeseite, auf http://localhost:8787
```

Der Vault wird standardmäßig unter `../../Nextcloud/Notes/Rezepte` erwartet.
Ein anderer Pfad geht über die Umgebungsvariable `VAULT_DIR`.

Astro speichert gerenderte Rezepte in `node_modules/.astro`. Nach Änderungen am Remark-Plugin
diesen Ordner löschen, sonst zeigt der Build noch das alte Ergebnis.

## Veröffentlichen

Jeder Push hierher oder in den Vault baut die Seite per GitHub Action (`.github/workflows/deploy.yml`)
und veröffentlicht sie als Cloudflare Worker (`wrangler.jsonc`).

Die Seite ist mit einem gemeinsamen Passwort geschützt (`worker/index.js`). Es liegt als Secret
`PASSWORT` beim Worker in Cloudflare, nicht im Repo. `dev` und `preview` fragen kein Passwort ab.
Für `preview:worker` braucht es eine Datei `.dev.vars` (nicht im Repo) mit einem Test-Passwort:

```sh
PASSWORT="test"
```

## Was die Seite aus dem Vault macht

- **Ordner** `Süßes`, `Brot & Brötchen`, `Herzhaftes`, `Getränke` werden zu Bereichen, `Wissen` zu Nachschlageseiten.
- **Tags** werden beim Bauen gegen das Tagsystem aus `Struktur.md` geprüft (`src/lib/tags.ts`).
  Ein unbekannter Tag oder ein falscher `art/`-Tag bricht den Build mit einer Meldung ab.
- **Rezepte mit `todo`** werden nicht veröffentlicht.
- **Bilder:** Veröffentlicht wird nur das Bild aus dem Feld `bild`. Im Text eingebettete Bilder
  (`![[…]]`, z. B. Fotos von Buchseiten) werden entfernt.
- **Wikilinks** `[[Rezept]]` und `[[Rezept#Abschnitt]]` werden zu normalen Links.
- **Mengen umrechnen:** Unter `## Zutaten` (Listen und Tabellen) werden Zahlen markiert, auf die eine Einheit
  oder Zutat folgt (`500 g`, `1–2 EL`, `Saft von 1/2 Zitrone`). Mehltypen (`Weizenmehl 550`, `Type 630`),
  `°C`, `%`, `cm` und `Ø` bleiben stehen. Auf der Rezeptseite rechnet man sie bei „Menge“ mit − und + um:
  bei einer Stückzahl im Feld `portionen` in Stück-Schritten, sonst in Faktoren. Die Zubereitung wird nicht umgerechnet.
- **Vollkorn tauschen** (nur Brot & Brötchen): Neben Weizen-, Roggen- und Dinkelmehl steht ein Knopf „Vollkorn“.
  Pro getauschtem Mehl kommen 7,5 % seiner Menge als Wasser dazu, in derselben `###`-Gruppe (z. B. Vorteig),
  sonst zum ersten Wasser im Teig, ohne Wasser zur Milch. Der Sauerteig sinkt anteilig, bei ganz Vollkorn auf die Hälfte
  (Regel aus „Koch- & Brühstücke“). Gruppen wie `### Kochstück` oder `### Brühstück` bleiben unverändert.
  Die Werte stehen in `src/lib/vollkorn.mjs`.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/vault.mjs` | Vault-Pfad, Bereiche, Slugs, Wikilink-Ziele |
| `src/content.config.ts` | Liest Rezepte und Wissen, prüft das Frontmatter |
| `src/lib/tags.ts` | Tagsystem und Anzeigenamen |
| `src/lib/rezepte.ts` | Rezepte laden, `art/` je Ordner prüfen, Suchtext |
| `src/remark-obsidian.mjs` | Obsidian-Syntax (Einbettungen, Wikilinks), Mengen markieren |
| `src/lib/mengen.mjs` | Mengenangaben erkennen |
| `src/lib/vollkorn.mjs` | Mehl, Wasser und Sauerteig erkennen, Werte für den Vollkorn-Tausch |
| `src/components/RezeptListe.astro` | Liste mit Suche und kombinierbaren Filtern |
| `src/pages/` | Start, Bereiche, alle Rezepte, Rezeptseite, Wissen |
| `worker/index.js` | Anmeldeseite vor der veröffentlichten Seite |

## Neuer Tag

1. In `Struktur.md` im Vault eintragen.
2. In `src/lib/tags.ts` ergänzen (bei `entdeckt/` optional nur den Anzeigenamen).
