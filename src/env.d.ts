// Typen für `import { env } from 'cloudflare:workers'`, nur mit dem, was die Seite benutzt.
// Bewusst nicht über `wrangler types`: Dessen Laufzeit-Typen ersetzen DOM-Typen wie Element
// und stören damit die Skripte, die im Browser laufen.
declare module 'cloudflare:workers' {
  interface D1Result<T = Record<string, unknown>> {
    results: T[];
    success: boolean;
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

  /** Bindings aus wrangler.jsonc und Secrets (lokal aus .dev.vars). */
  export const env: {
    DB: D1Database;
    PASSWORT?: string;
  };
}
