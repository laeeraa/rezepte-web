-- Sitzungen: Wer sich über /anmelden (Cloudflare Access) angemeldet hat, bekommt ein Cookie,
-- damit auch die öffentlichen Seiten sie erkennen (Bearbeiten-Links, später Kommentare).
-- Gespeichert wird nur der SHA-256-Hash des Cookie-Werts.
CREATE TABLE sitzung (
  hash         TEXT PRIMARY KEY,
  nutzer_id    TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  erstellt     TEXT NOT NULL DEFAULT (datetime('now')),
  gueltig_bis  TEXT NOT NULL
);
CREATE INDEX sitzung_nutzer ON sitzung (nutzer_id);
