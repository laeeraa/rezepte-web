-- Grundschema: Rezeptbücher mit eigenen Kategorien und Tags.
-- Jedes Buch hat seine eigene Konfiguration, damit Freunde ihr Tagsystem selbst einrichten können.
-- IDs sind Texte (UUIDs), damit Import-Skripte und später das Kopieren zwischen Büchern
-- keine fortlaufenden Nummern abstimmen müssen.

CREATE TABLE nutzer (
  id        TEXT PRIMARY KEY,
  email     TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- kommt später vom Login (Cloudflare Access)
  name      TEXT NOT NULL,
  erstellt  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE buch (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,            -- Adresse: /<slug>/…
  name            TEXT NOT NULL,                   -- z. B. „Laras Lieblingsrezepte“
  -- Chips unter dem Suchfeld der Startseite, als JSON: [{"text": "Vegan", "ziel": "rezepte?f=ernaehrung/vegan"}]
  -- „ziel“ ist relativ zum Buch.
  schnellzugriff  TEXT NOT NULL DEFAULT '[]',
  erstellt        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE mitglied (
  buch_id    TEXT NOT NULL REFERENCES buch(id) ON DELETE CASCADE,
  nutzer_id  TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  rolle      TEXT NOT NULL CHECK (rolle IN ('besitzer', 'schreiben')),
  PRIMARY KEY (buch_id, nutzer_id)
);

-- Ersetzt die Ordner im Vault.
CREATE TABLE kategorie (
  id               TEXT PRIMARY KEY,
  buch_id          TEXT NOT NULL REFERENCES buch(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  -- Name einer Farbe aus der festen Palette in global.css (rosa, lila, gruen, petrol, …),
  -- damit jede Farbe im hellen und dunklen Modus lesbar bleibt.
  farbe            TEXT NOT NULL DEFAULT 'grau',
  reihenfolge      INTEGER NOT NULL DEFAULT 0,
  vollkorn_tausch  INTEGER NOT NULL DEFAULT 0 CHECK (vollkorn_tausch IN (0, 1)),
  UNIQUE (buch_id, slug)
);

-- Ersetzt das Tagsystem aus Struktur.md und src/lib/tags.ts. Ein Tag heißt „<gruppe>/<tag>“.
CREATE TABLE tag_gruppe (
  id           TEXT PRIMARY KEY,
  buch_id      TEXT NOT NULL REFERENCES buch(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,                     -- art, ernaehrung, entdeckt, …
  name         TEXT NOT NULL,                     -- Anzeigename der Gruppe
  reihenfolge  INTEGER NOT NULL DEFAULT 0,
  -- 'eins': genau ein bzw. höchstens ein Tag je Rezept (z. B. Ernährung), 'mehrere': beliebig viele
  auswahl      TEXT NOT NULL DEFAULT 'mehrere' CHECK (auswahl IN ('eins', 'mehrere')),
  -- Mindestens ein Tag nötig, sofern es für die Kategorie des Rezepts überhaupt Tags in der Gruppe gibt.
  pflicht      INTEGER NOT NULL DEFAULT 0 CHECK (pflicht IN (0, 1)),
  -- Neue Tags dürfen direkt beim Rezept angelegt werden (z. B. Entdeckt bei/in).
  frei         INTEGER NOT NULL DEFAULT 0 CHECK (frei IN (0, 1)),
  -- Wie die Seite die Gruppe zeigt: 'gliederung' = Abschnitte und Brotkrumen (Art),
  -- 'herkunft' = Zeile „Entdeckt bei/in“, 'merkmal' = Chips.
  darstellung  TEXT NOT NULL DEFAULT 'merkmal' CHECK (darstellung IN ('gliederung', 'merkmal', 'herkunft')),
  -- Mehrere gewählte Filter aus der Gruppe: 'oder' = eines davon (Küche: italienisch oder indisch),
  -- 'und' = alle (Merkmale: Sauerteig und Vortag).
  filter       TEXT NOT NULL DEFAULT 'oder' CHECK (filter IN ('oder', 'und')),
  -- Tags der Gruppe stehen auf der Rezeptkarte unter dem Titel (z. B. „Vegan · Sauerteig“).
  auf_karte    INTEGER NOT NULL DEFAULT 0 CHECK (auf_karte IN (0, 1)),
  UNIQUE (buch_id, key)
);

CREATE TABLE tag (
  id           TEXT PRIMARY KEY,
  gruppe_id    TEXT NOT NULL REFERENCES tag_gruppe(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,                     -- kuchen, vegan, lutz-geissler, …
  name         TEXT NOT NULL,                     -- Kuchen, Vegan, Lutz Geißler, …
  reihenfolge  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (gruppe_id, key)
);

-- Ein Tag ohne Einträge hier passt zu allen Kategorien.
-- Mit Einträgen nur zu diesen (art/kuchen nur zu Süßes).
CREATE TABLE tag_kategorie (
  tag_id        TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  kategorie_id  TEXT NOT NULL REFERENCES kategorie(id) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, kategorie_id)
);

CREATE TABLE rezept (
  id            TEXT PRIMARY KEY,
  buch_id       TEXT NOT NULL REFERENCES buch(id) ON DELETE CASCADE,
  -- Ohne ON DELETE: Eine Kategorie mit Rezepten lässt sich nicht löschen.
  kategorie_id  TEXT NOT NULL REFERENCES kategorie(id),
  slug          TEXT NOT NULL,
  titel         TEXT NOT NULL,
  portionen     TEXT,                               -- Freitext: „4 Personen“, „1 Kastenform“
  zeit          INTEGER CHECK (zeit > 0),           -- Gesamtzeit in Minuten
  quelle        TEXT NOT NULL DEFAULT '[]',         -- JSON-Liste von Links
  bild_key      TEXT,                               -- Schlüssel in R2
  inhalt_md     TEXT NOT NULL,                      -- das, was man bearbeitet
  -- Beim Speichern erzeugt (Mengen und Vollkorn markiert, Wikilinks aufgelöst),
  -- damit der Worker nicht bei jedem Aufruf Markdown rendern muss.
  inhalt_html   TEXT NOT NULL,
  suchtext      TEXT NOT NULL,                      -- Titel, Tag-Namen und Zutaten, klein geschrieben
  status        TEXT NOT NULL DEFAULT 'fertig' CHECK (status IN ('entwurf', 'fertig')),
  kopiert_von   TEXT REFERENCES rezept(id) ON DELETE SET NULL,
  erstellt_von  TEXT REFERENCES nutzer(id) ON DELETE SET NULL,
  erstellt      TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (buch_id, slug)
);
CREATE INDEX rezept_buch_status ON rezept (buch_id, status);
CREATE INDEX rezept_kopiert_von ON rezept (kopiert_von);

CREATE TABLE rezept_tag (
  rezept_id  TEXT NOT NULL REFERENCES rezept(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (rezept_id, tag_id)
);
CREATE INDEX rezept_tag_tag ON rezept_tag (tag_id);

-- Nachschlageseiten („Wissen“), ohne Tags und Pflichtfelder.
CREATE TABLE seite (
  id           TEXT PRIMARY KEY,
  buch_id      TEXT NOT NULL REFERENCES buch(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  titel        TEXT NOT NULL,
  inhalt_md    TEXT NOT NULL,
  inhalt_html  TEXT NOT NULL,
  reihenfolge  INTEGER NOT NULL DEFAULT 0,
  geaendert    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (buch_id, slug)
);
