-- Einladungen: Nur wer eingeladen wurde, kommt nach der Anmeldung (Cloudflare Access) auf die Seite.
-- Jede angemeldete Person kann Einladungslinks erzeugen. Ein Link gilt einmal und läuft ab.
CREATE TABLE einladung (
  token           TEXT PRIMARY KEY,                -- zufällig, steht im Link /einladung/<token>
  erstellt_von    TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  fuer            TEXT,                            -- Notiz, für wen der Link ist („Juli“)
  erstellt        TEXT NOT NULL DEFAULT (datetime('now')),
  gueltig_bis     TEXT NOT NULL,
  angenommen_von  TEXT REFERENCES nutzer(id) ON DELETE SET NULL,
  angenommen_am   TEXT
);
CREATE INDEX einladung_erstellt_von ON einladung (erstellt_von);
