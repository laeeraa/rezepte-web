// Prüft die Tags eines Rezepts gegen das Tagsystem seines Buchs.
// Wird vom Import benutzt und später vom Formular beim Speichern.
//
// gruppen: [{ key, name, auswahl: 'eins'|'mehrere', pflicht, frei, tags: [{ key, name, kategorien: [slug] }] }]
// Ein leeres oder fehlendes `kategorien` heißt: Der Tag passt zu allen Kategorien.

export const FREIER_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const passt = (tag, kategorie) => !tag.kategorien?.length || tag.kategorien.includes(kategorie.slug);

/**
 * @param {string[]} tags  z. B. ['art/kuchen', 'ernaehrung/vegan']
 * @param {{ slug: string, name: string }} kategorie
 * @param {any[]} gruppen
 * @param {{ pflicht?: boolean }} [optionen]  pflicht: false prüft Pflichtgruppen nicht (für Entwürfe)
 * @returns {string[]} Fehlermeldungen, leer wenn alles passt
 */
export function pruefeTags(tags, kategorie, gruppen, { pflicht = true } = {}) {
  const fehler = [];
  const jeGruppe = new Map();

  for (const tag of new Set(tags)) {
    const [gruppenKey, key, ...rest] = tag.split('/');
    const gruppe = gruppen.find((g) => g.key === gruppenKey);
    if (!gruppe || !key || rest.length) {
      fehler.push(`Unbekannter Tag „${tag}“.`);
      continue;
    }
    const def = gruppe.tags.find((t) => t.key === key);
    if (!def && !(gruppe.frei && FREIER_KEY.test(key))) {
      fehler.push(`„${key}“ gibt es in „${gruppe.name}“ nicht.`);
      continue;
    }
    if (def && !passt(def, kategorie)) {
      fehler.push(`„${gruppe.name}: ${def.name}“ passt nicht zur Kategorie „${kategorie.name}“.`);
    }
    jeGruppe.set(gruppe.key, (jeGruppe.get(gruppe.key) ?? 0) + 1);
  }

  for (const gruppe of gruppen) {
    const anzahl = jeGruppe.get(gruppe.key) ?? 0;
    const moeglich = gruppe.frei || gruppe.tags.some((t) => passt(t, kategorie));
    if (pflicht && gruppe.pflicht && moeglich && anzahl === 0) {
      fehler.push(`Ein Tag aus „${gruppe.name}“ fehlt.`);
    }
    if (gruppe.auswahl === 'eins' && anzahl > 1) {
      fehler.push(`Aus „${gruppe.name}“ ist nur ein Tag erlaubt.`);
    }
  }
  return fehler;
}
