-- Farbthema eines Buchs: Kopfbereich in Pastell, Links und Knöpfe im passenden kräftigen Ton.
-- Name aus src/lib/themen.ts, Farben in src/styles/global.css (.thema-<name>).
ALTER TABLE buch ADD COLUMN farbe TEXT NOT NULL DEFAULT 'standard';
