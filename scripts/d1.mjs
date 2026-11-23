// Zugriff auf D1 aus Node-Skripten über `wrangler d1 execute` (lokal oder bei Cloudflare).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/** '--local' oder '--remote' aus den Optionen --lokal / --remote. */
export function ortAus(opt) {
  if (!!opt.lokal === !!opt.remote) {
    console.error('Bitte --lokal oder --remote angeben.');
    process.exit(1);
  }
  return opt.remote ? '--remote' : '--local';
}

export function abfrage(ort, sql) {
  const ausgabe = execFileSync('npx', ['wrangler', 'd1', 'execute', 'rezepte', ort, '--json', '--command', sql], {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(ausgabe)[0].results;
}

/** Schreibt die Anweisungen in eine Datei unter .import/ und spielt sie ein. */
export function ausfuehren(ort, anweisungen, name) {
  const datei = `.import/${name}.sql`;
  fs.mkdirSync('.import', { recursive: true });
  fs.writeFileSync(datei, anweisungen.join('\n') + '\n');
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'rezepte', ort, '--file', datei], { stdio: ['ignore', 'ignore', 'inherit'] });
}

/** SQL-Literal. */
export const q = (v) =>
  v === null || v === undefined ? 'NULL'
  : typeof v === 'boolean' ? (v ? '1' : '0')
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;
