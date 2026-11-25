-- „Neu“-Badge, Verlauf „Erfahrungen“ (gekocht und Kommentare) und Hinweis auf neue Einträge.

-- Wann ein Rezept zum ersten Mal fertig (nicht Entwurf) war. Grundlage für das „Neu“-Badge.
-- Ein Entwurf, der später fertig wird, gilt ab dann als neu.
ALTER TABLE rezept ADD COLUMN veroeffentlicht TEXT;
UPDATE rezept SET veroeffentlicht = erstellt WHERE status = 'fertig';

-- Verlauf unter einem Rezept. Nur für angemeldete Personen sichtbar.
CREATE TABLE eintrag (
  id         TEXT PRIMARY KEY,
  rezept_id  TEXT NOT NULL REFERENCES rezept(id) ON DELETE CASCADE,
  nutzer_id  TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  art        TEXT NOT NULL CHECK (art IN ('gekocht', 'kommentar')),
  -- Bei „gekocht“ der Tag, an dem gekocht wurde (änderbar), sonst der Tag des Kommentars. Format JJJJ-MM-TT.
  datum      TEXT NOT NULL,
  -- Kommentar bzw. optionale Notiz zum Kochen. Reiner Text.
  text       TEXT,
  erstellt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX eintrag_rezept ON eintrag (rezept_id, datum);
CREATE INDEX eintrag_nutzer ON eintrag (nutzer_id, art, datum);
CREATE INDEX eintrag_erstellt ON eintrag (erstellt);

-- Bis wann die Person die Hinweise auf neue Einträge zu ihren Rezepten gesehen hat.
ALTER TABLE nutzer ADD COLUMN hinweise_gelesen_bis TEXT;
