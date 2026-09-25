// Das Tagsystem aus Struktur.md im Vault. Änderungen dort auch hier nachziehen.

export const GRUPPEN = {
  art: {
    label: 'Art',
    werte: {
      kuchen: 'Kuchen', kekse: 'Kekse', dessert: 'Dessert', fruehstueck: 'Frühstück',
      brot: 'Brot', broetchen: 'Brötchen',
      gericht: 'Gericht', suppe: 'Suppe', salat: 'Salat', beilage: 'Beilage', 'sosse-dip': 'Soße & Dip',
    },
  },
  ernaehrung: {
    label: 'Ernährung',
    werte: { vegan: 'Vegan', vegetarisch: 'Vegetarisch', fisch: 'Fisch', fleisch: 'Fleisch' },
  },
  mahlzeit: {
    label: 'Mahlzeit',
    werte: { fruehstueck: 'Frühstück', hauptgericht: 'Hauptgericht', beilage: 'Beilage', snack: 'Snack', dessert: 'Dessert' },
  },
  kueche: {
    label: 'Küche',
    werte: { italienisch: 'Italienisch', asiatisch: 'Asiatisch', indisch: 'Indisch', mexikanisch: 'Mexikanisch', orientalisch: 'Orientalisch' },
  },
  aufwand: {
    label: 'Aufwand',
    werte: { schnell: 'Schnell' },
  },
} as const;

export const EIGENSTAENDIG = {
  sauerteig: 'Sauerteig',
  hefe: 'Hefe',
  fermentiert: 'Fermentiert',
  grundrezept: 'Grundrezept',
  todo: 'Unvollständig',
} as const;

export const ART_JE_ORDNER: Record<string, string[]> = {
  'Süßes': ['kuchen', 'kekse', 'dessert', 'fruehstueck'],
  'Brot & Brötchen': ['brot', 'broetchen'],
  'Herzhaftes': ['gericht', 'suppe', 'salat', 'beilage', 'sosse-dip'],
  'Getränke': [],
};

// Anzeigenamen für entdeckt/. Unbekannte Werte werden aus dem Slug abgeleitet.
const ENTDECKT: Record<string, string> = {
  neuseeland: 'Neuseeland', kanada: 'Kanada',
  mama: 'Mama', oma: 'Oma', vero: 'Vero', susanne: 'Susanne', bea: 'Bea', elke: 'Elke',
  hannah: 'Hannah', axel: 'Axel', elli: 'Elli',
  ibb: 'ibb', 'zinser-muehle': 'Zinser Mühle', 'lutz-geissler': 'Lutz Geißler',
  'wg-der-medien': 'WG der Medien', 'mimi-kraus': 'Mimi Kraus', 'abenteuer-leben': 'Abenteuer Leben',
  lenaeats: 'LenaEats', 'bianca-zapatka': 'Bianca Zapatka', 'veggie-einhorn': 'Veggie Einhorn',
  'emmi-kocht-einfach': 'Emmi kocht einfach', chefkoch: 'Chefkoch', 'einfach-backen': 'Einfach Backen',
  'rainbow-plant-life': 'Rainbow Plant Life', 'slowly-veggie': 'Slowly Veggie', foodnphoto: 'Food & Photo',
  'law-of-baking': 'Law of Baking', 'kitchen-stories': 'Kitchen Stories', 'feines-gemuese': 'Feines Gemüse',
  dierezepte: 'dierezepte.com', 'eat-this': 'Eat this!', 'backen-macht-gluecklich': 'Backen macht glücklich',
  'frau-huegels-kueche': 'Frau Hügels Küche', 'claras-crumbs': "Clara's Crumbs", instagram: 'Instagram',
};

export type Gruppe = keyof typeof GRUPPEN;

export function tagErlaubt(tag: string): boolean {
  if (tag in EIGENSTAENDIG) return true;
  const [gruppe, wert, ...rest] = tag.split('/');
  if (rest.length || !wert) return false;
  if (gruppe === 'entdeckt') return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(wert);
  return gruppe in GRUPPEN && wert in GRUPPEN[gruppe as Gruppe].werte;
}

export function tagLabel(tag: string): string {
  if (tag in EIGENSTAENDIG) return EIGENSTAENDIG[tag as keyof typeof EIGENSTAENDIG];
  const [gruppe, wert] = tag.split('/');
  if (gruppe === 'entdeckt') {
    return ENTDECKT[wert] ?? wert.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  }
  return (GRUPPEN[gruppe as Gruppe]?.werte as Record<string, string>)?.[wert] ?? wert;
}
