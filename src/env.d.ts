// Typen für `import { env } from 'cloudflare:workers'`, nur mit dem, was die Seite benutzt.
// Bewusst nicht über `wrangler types`: Dessen Laufzeit-Typen ersetzen DOM-Typen wie Element
// und stören damit die Skripte, die im Browser laufen.
declare module 'cloudflare:workers' {
  interface D1Result<T = Record<string, unknown>> {
    results: T[];
    success: boolean;
    meta?: { changes?: number };
  }
  interface D1PreparedStatement {
    bind(...werte: unknown[]): D1PreparedStatement;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<D1Result>;
  }
  interface D1Database {
    prepare(sql: string): D1PreparedStatement;
    // Die Abfragen eines Batches liefern unterschiedliche Zeilen, deshalb ohne festen Typ.
    batch<T = any>(anweisungen: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  }

  interface R2ObjectBody {
    body: ReadableStream;
    httpEtag: string;
    httpMetadata?: { contentType?: string };
  }
  interface R2Bucket {
    get(key: string): Promise<R2ObjectBody | null>;
    put(key: string, wert: ArrayBuffer | ReadableStream, optionen?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
    delete(keys: string | string[]): Promise<void>;
  }

  /** Bindings aus wrangler.jsonc und Secrets (lokal aus .dev.vars). */
  export const env: {
    DB: D1Database;
    BILDER: R2Bucket;
    /** Team-Name von Cloudflare Access: <team>.cloudflareaccess.com */
    ACCESS_TEAM?: string;
    /** „Application Audience (AUD) Tag“ der Access-App */
    ACCESS_AUD?: string;
    /** Eigene Domain der Seite; Anfragen an …workers.dev werden dorthin umgeleitet. */
    DOMAIN?: string;
    /** Nur lokal (.dev.vars): als wer man auf localhost angemeldet ist. */
    LOKALE_ANMELDUNG?: string;
  };
}

declare namespace App {
  interface Locals {
    /** Angemeldete und eingeladene Person, auf öffentlichen Seiten null für Besucher ohne Anmeldung. */
    nutzer: import('./lib/nutzer').Nutzer | null;
    /** E-Mail aus Cloudflare Access (nur auf geschützten Pfaden), auch wenn die Person nicht eingeladen ist. */
    email: string | null;
  }
}
