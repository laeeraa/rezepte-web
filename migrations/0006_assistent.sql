-- Aufrufe des Rezept-Assistenten (Claude): für das Tageslimit je Person und um die Kosten zu sehen.
CREATE TABLE assistent_aufruf (
  id             TEXT PRIMARY KEY,
  nutzer_id      TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  art            TEXT NOT NULL CHECK (art IN ('erkennen', 'nachbessern')),
  erfolgreich    INTEGER NOT NULL DEFAULT 1 CHECK (erfolgreich IN (0, 1)),
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  erstellt       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX assistent_aufruf_nutzer ON assistent_aufruf (nutzer_id, art, erstellt);
