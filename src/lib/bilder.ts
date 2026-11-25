// Fotos der Rezepte in R2. Je Rezept ein Bild in zwei Größen:
// `<buch-id>/<uuid>` (groß, für die Rezeptseite) und `<buch-id>/<uuid>-klein` (für die Rezeptkarten).
// Das Formular verkleinert die Fotos schon im Browser und entfernt dabei EXIF-Daten wie den Aufnahmeort.
// Ohne JavaScript kommt das Original, dann gibt es nur die große Fassung.
import { env } from 'cloudflare:workers';

export const MAX_MB = 8;

export interface BildEingabe {
  gross?: File;
  klein?: File;
  entfernen: boolean;
}

export function bildAusFormular(form: FormData): BildEingabe {
  const datei = (name: string) => {
    const wert = form.get(name);
    return wert instanceof File && wert.size > 0 ? wert : undefined;
  };
  return { gross: datei('bild'), klein: datei('bild_klein'), entfernen: form.get('bild_entfernen') === 'ja' };
}

/** Bildtyp anhand der ersten Bytes, nicht anhand von Dateiname oder Angabe des Browsers. */
export async function bildTyp(datei: File): Promise<string | null> {
  const b = new Uint8Array(await datei.slice(0, 12).arrayBuffer());
  const ist = (start: number, ...bytes: number[]) => bytes.every((x, i) => b[start + i] === x);
  if (ist(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ist(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (ist(0, 0x52, 0x49, 0x46, 0x46) && ist(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

export async function pruefeBild(bild: BildEingabe): Promise<string[]> {
  const fehler: string[] = [];
  for (const datei of [bild.gross, bild.klein]) {
    if (!datei) continue;
    if (datei.size > MAX_MB * 1024 * 1024) fehler.push(`Das Bild ist zu groß (höchstens ${MAX_MB} MB).`);
    else if (!(await bildTyp(datei))) fehler.push('Das Bild muss ein JPEG, PNG oder WebP sein. Fotos vom iPhone (HEIC) bitte vorher umwandeln.');
  }
  return [...new Set(fehler)];
}

export const neuerBildKey = (buchId: string) => `${buchId}/${crypto.randomUUID()}`;

/** Legt das Bild unter dem Schlüssel ab. Vorher mit pruefeBild prüfen. */
export async function speichereBild(key: string, bild: Required<Pick<BildEingabe, 'gross'>> & BildEingabe): Promise<void> {
  const ablegen = async (k: string, datei: File) =>
    env.BILDER.put(k, await datei.arrayBuffer(), { httpMetadata: { contentType: (await bildTyp(datei))! } });
  await ablegen(key, bild.gross);
  if (bild.klein) await ablegen(`${key}-klein`, bild.klein);
}

/** Kopiert ein vorhandenes Bild (beide Größen) unter einen neuen Schlüssel, z. B. beim Kopieren eines Rezepts. */
export async function kopiereBild(von: string, nach: string): Promise<void> {
  for (const endung of ['', '-klein']) {
    const bild = await env.BILDER.get(von + endung);
    if (bild) await env.BILDER.put(nach + endung, await bild.arrayBuffer(), { httpMetadata: bild.httpMetadata });
  }
}

export async function loescheBild(key: string): Promise<void> {
  await env.BILDER.delete([key, `${key}-klein`]);
}

export const bildUrl = (key: string, klein = false) => `/bild/${key}${klein ? '-klein' : ''}`;
