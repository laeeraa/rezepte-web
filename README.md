# Lieblingsrezepte

Rezeptbücher für Freunde, gebaut mit [Astro](https://astro.build) als Cloudflare Worker.
Jedes Buch hat eigene Kategorien und Tags. Alle Rezepte liegen in einer Cloudflare-D1-Datenbank,
jede Seite wird pro Anfrage aus ihr gerendert.

Adressen: `/` (alle Bücher), `/lara`, `/lara/suesses`, `/lara/rezepte`, `/lara/rezept/pad-thai`, `/lara/wissen/…`.
Alte Adressen ohne Buch (`/rezept/pad-thai`, `/suesses`, …) leiten auf `/lara/…` weiter (`src/middleware.ts`).

## Lokal starten

Node 22 (über [fnm](https://github.com/Schniz/fnm)), dann:

```sh
npm install                                         # einmalig
npm run db:migrate:lokal                            # Schema in die lokale D1 (.wrangler/)
BESITZER_EMAIL=du@example.org npm run import:vault  # Vault → .import/lara.sql
npm run db:import:lokal                             # SQL einspielen (ersetzt das Buch)

npm run dev      # Entwicklungsserver auf http://localhost:4321
npm run build    # Worker nach dist/
npm run preview  # gebauten Worker lokal ansehen
npm run check    # Typen prüfen
```

Lokal gibt es kein Cloudflare Access. Als wer man angemeldet ist, steht in `.dev.vars` (nicht im Repo).
Die Adresse muss in der Tabelle `nutzer` stehen, also dieselbe wie `BESITZER_EMAIL` beim Import:

```sh
LOKALE_ANMELDUNG="du@example.org"
```

Das gilt nur für Anfragen an `localhost`. Zum Ausprobieren als jemand anderes schickt man den Header
`X-Lokale-Anmeldung: andere@example.org` mit (z. B. mit `curl -H`).

In die lokale Datenbank schauen:

```sh
npx wrangler d1 execute rezepte --local --command "SELECT titel FROM rezept LIMIT 5"
```

Nach Änderungen an der Umwandlung (`rezepttext.mjs`, `mengen.mjs`, `vollkorn.mjs`, `remark-obsidian.mjs`)
oder umbenannten Tags alle Texte neu umwandeln:

```sh
npm run neu-rendern -- --lokal    # bzw. --remote für die echte Datenbank
```

## Anmeldung und Rechte

- **Anmelden** macht Cloudflare Access mit einem Code per E-Mail (`src/lib/anmeldung.ts` prüft das Token).
- **Auf die Seite** darf nur, wer in der Tabelle `nutzer` steht. Dort landet man über einen Einladungslink,
  den jede angemeldete Person unter `/konto` erzeugen kann (einmal gültig, zwei Wochen lang).
  Wer angemeldet, aber nicht eingeladen ist, sieht `/kein-zugang`.
- **Lesen** dürfen alle Eingeladenen alle Bücher. **Bearbeiten** nur Mitglieder des Buchs (Tabelle `mitglied`).
- **Eigenes Buch:** unter `/konto/buch-anlegen`, mit Kategorien und Tags aus `src/lib/startkonfiguration.mjs`.

## Veröffentlichen

Jeder Push auf `main` baut die Seite per GitHub Action (`.github/workflows/deploy.yml`), spielt neue
Migrationen in die echte Datenbank ein und veröffentlicht den Worker (`wrangler.jsonc`).

### Einmalig: Umstellung vom Vault auf die Datenbank

1. Datenbank anlegen: `npx wrangler d1 create rezepte --location weur` und die ausgegebene `database_id` in `wrangler.jsonc` eintragen.
2. R2 im Cloudflare-Dashboard aktivieren und den Speicher für Fotos anlegen: `npx wrangler r2 bucket create rezepte-bilder`.
3. Der API-Token im GitHub-Secret `CLOUDFLARE_API_TOKEN` braucht zusätzlich **D1: Edit** und **Workers R2 Storage: Edit**.
4. Schema und Rezepte einspielen:
   ```sh
   npx wrangler d1 migrations apply rezepte --remote
   BESITZER_EMAIL=<deine Login-Adresse> npm run import:vault
   npx wrangler d1 execute rezepte --remote --file .import/lara.sql
   ```
5. Cloudflare Access für den Worker einschalten (Workers → lieblingsrezepte → Einstellungen → Domains & Routes →
   bei `workers.dev` „Cloudflare Access“ aktivieren). Die Richtlinie der Access-App so einstellen, dass sich
   **jede E-Mail-Adresse** mit Einmal-Code anmelden darf; wer rein darf, entscheidet die Seite selbst.
   Team-Name und „Application Audience (AUD) Tag“ der App in `wrangler.jsonc` unter `vars` eintragen.
6. Auf `main` mergen. Der Workflow im Vault (`website.yml`) und das Secret `PASSWORT` werden danach nicht mehr gebraucht.

## Datenbank

Das Schema steht in `migrations/` (eine Datei je Änderung, nie eine eingespielte Datei ändern).

| Tabelle | Inhalt |
|---|---|
| `buch`, `nutzer`, `mitglied` | Rezeptbücher, Personen und wer in welchem Buch schreiben darf |
| `einladung` | Einladungslinks: von wem, für wen, gültig bis, angenommen von |
| `kategorie` | Ersetzt die Ordner: Name, Farbe aus der Palette, Vollkorn-Tausch an/aus |
| `tag_gruppe`, `tag`, `tag_kategorie` | Tagsystem je Buch: Pflicht, Einzel- oder Mehrfachauswahl, Filterlogik, Anzeige |
| `rezept`, `rezept_tag` | Rezepte mit Markdown (`inhalt_md`) und daraus erzeugtem HTML (`inhalt_html`) |
| `seite` | Wissensseiten zum Nachschlagen |

Ein Tag heißt `<gruppe>/<tag>`, z. B. `ernaehrung/vegan` oder `merkmal/sauerteig`.
Neue Bücher starten mit `src/lib/startkonfiguration.mjs`.

## Was beim Speichern eines Rezepts passiert

Rezepte werden im Formular unter `/<buch>/neu` und `/<buch>/rezept/<slug>/bearbeiten` geschrieben.
Das HTML wird beim Speichern erzeugt, nicht bei jedem Aufruf (`src/lib/rezepttext.mjs`):

- **Wikilinks** `[[Rezept]]` und `[[Rezept#Abschnitt]]` werden zu Links innerhalb des Buchs.
- **Bilder im Text** (`![[…]]`, Markdown-Bilder) werden nicht angezeigt.
- **Rohes HTML** im Text wird nicht übernommen, Links nur mit `http(s)`, `mailto`, relativ oder als Anker.
- **Verweise:** Ändern sich Titel oder Entwurf-Status, werden Rezepte neu gerendert, die per `[[…]]` darauf zeigen.
- **Fotos** werden im Browser auf 1600 px und 600 px (Karten) verkleinert, ohne EXIF-Daten wie den Aufnahmeort.
  Ohne JavaScript geht das Original hoch (höchstens 8 MB, nur JPEG, PNG, WebP).
- **Entwürfe** sind nur über ihre Adresse und unter `/<buch>/entwuerfe` zu finden, nicht in Listen und Suche.
- **Mengen umrechnen:** Unter `## Zutaten` (Listen und Tabellen) werden Zahlen markiert, auf die eine Einheit
  oder Zutat folgt (`500 g`, `1–2 EL`, `Saft von 1/2 Zitrone`). Mehltypen (`Weizenmehl 550`, `Type 630`),
  `°C`, `%`, `cm` und `Ø` bleiben stehen. Auf der Rezeptseite rechnet man sie bei „Menge“ mit − und + um:
  bei einer Stückzahl im Feld `portionen` in Stück-Schritten, sonst in Faktoren. Die Zubereitung wird nicht umgerechnet.
- **Vollkorn tauschen** (in Kategorien mit `vollkorn_tausch`): Neben Weizen-, Roggen- und Dinkelmehl steht ein Knopf „Vollkorn“.
  Pro getauschtem Mehl kommen 7,5 % seiner Menge als Wasser dazu, in derselben `###`-Gruppe (z. B. Vorteig),
  sonst zum ersten Wasser im Teig, ohne Wasser zur Milch. Der Sauerteig sinkt anteilig, bei ganz Vollkorn auf die Hälfte
  (Regel aus „Koch- & Brühstücke“). Gruppen wie `### Kochstück` oder `### Brühstück` bleiben unverändert.
  Die Werte stehen in `src/lib/vollkorn.mjs`.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/lib/db.ts` | Lesezugriffe auf D1: Bücher, Tagsystem, Rezepte, Wissen |
| `src/lib/bilder.ts` | Fotos in R2 (`BILDER`): prüfen, ablegen, löschen; ausgeliefert über `src/pages/bild/` |
| `src/lib/rezept-speichern.ts` | Rezepte anlegen, ändern, löschen; prüft die Eingabe, hält Wikilinks anderer Rezepte aktuell |
| `src/components/RezeptFormular.astro` | Formular mit Tags je Kategorie und Vorschau |
| `src/lib/anzeige.ts` | Seitenname, Zeit- und Linkformat |
| `src/lib/tagregeln.mjs` | Prüft die Tags eines Rezepts gegen das Tagsystem seines Buchs |
| `src/lib/rezepttext.mjs` | Markdown → HTML mit `src/remark-obsidian.mjs` |
| `src/lib/mengen.mjs` | Mengenangaben erkennen |
| `src/lib/vollkorn.mjs` | Mehl, Wasser und Sauerteig erkennen, Werte für den Vollkorn-Tausch |
| `src/lib/suchtext.mjs` | Suchtext aus Titel, Tags und Zutaten |
| `src/middleware.ts` | Anmeldung und Einladung prüfen, alte Adressen weiterleiten |
| `src/lib/anmeldung.ts` | Token von Cloudflare Access prüfen, lokale Anmeldung |
| `src/lib/nutzer.ts` | Personen, ihre Bücher, Rechte, Einladungen |
| `src/lib/buch-anlegen.ts` | Neues Buch aus der Startkonfiguration, erlaubte Adressen |
| `src/components/RezeptListe.astro` | Liste mit Suche und kombinierbaren Filtern |
| `src/pages/` | Alle Bücher, und je Buch: Start, Kategorien, alle Rezepte, Rezeptseite, Wissen, `neu`, `…/bearbeiten`, `entwuerfe` |
| `src/env.d.ts` | Typen für `env` aus `cloudflare:workers` |
| `scripts/import-vault.mjs` | Liest den Obsidian-Vault einmalig ein und erzeugt SQL für ein Buch |
| `scripts/neu-rendern.mjs` | Wandelt alle Texte neu um (HTML und Suchtext) |
