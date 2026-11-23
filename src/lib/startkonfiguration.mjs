// Kategorien und Tagsystem, mit denen ein neues Rezeptbuch startet.
// Entspricht dem bisherigen Tagsystem aus Struktur.md und src/lib/tags.ts.
// Jedes Buch bekommt eine eigene Kopie davon in der Datenbank und kann sie danach frei ändern.
//
// Bei Tags heißt `kategorien` „passt nur zu diesen Kategorien“. Fehlt das Feld, passt der Tag überall.
// Felder der Gruppen und ihre Standardwerte stehen in migrations/0001_start.sql (Tabelle tag_gruppe).

export const KATEGORIEN = [
  { slug: 'suesses', name: 'Süßes', farbe: 'rosa' },
  { slug: 'brot-broetchen', name: 'Brot & Brötchen', farbe: 'lila', vollkornTausch: true },
  { slug: 'herzhaftes', name: 'Herzhaftes', farbe: 'gruen' },
  { slug: 'getraenke', name: 'Getränke', farbe: 'petrol' },
];

const nur = (...kategorien) => ({ kategorien });

export const TAG_GRUPPEN = [
  {
    key: 'art',
    name: 'Art',
    pflicht: true,
    darstellung: 'gliederung',
    tags: [
      { key: 'kuchen', name: 'Kuchen', ...nur('suesses') },
      { key: 'kekse', name: 'Kekse', ...nur('suesses') },
      { key: 'dessert', name: 'Dessert', ...nur('suesses') },
      { key: 'fruehstueck', name: 'Frühstück', ...nur('suesses') },
      { key: 'brot', name: 'Brot', ...nur('brot-broetchen') },
      { key: 'broetchen', name: 'Brötchen', ...nur('brot-broetchen') },
      { key: 'gericht', name: 'Gericht', ...nur('herzhaftes') },
      { key: 'suppe', name: 'Suppe', ...nur('herzhaftes') },
      { key: 'salat', name: 'Salat', ...nur('herzhaftes') },
      { key: 'beilage', name: 'Beilage', ...nur('herzhaftes') },
      { key: 'sosse-dip', name: 'Soße & Dip', ...nur('herzhaftes') },
    ],
  },
  {
    key: 'ernaehrung',
    name: 'Ernährung',
    pflicht: true,
    auswahl: 'eins',
    aufKarte: true,
    tags: [
      { key: 'vegan', name: 'Vegan' },
      { key: 'vegetarisch', name: 'Vegetarisch' },
      { key: 'fisch', name: 'Fisch' },
      { key: 'fleisch', name: 'Fleisch' },
    ],
  },
  {
    key: 'mahlzeit',
    name: 'Mahlzeit',
    tags: [
      { key: 'fruehstueck', name: 'Frühstück' },
      { key: 'hauptgericht', name: 'Hauptgericht' },
      { key: 'beilage', name: 'Beilage' },
      { key: 'snack', name: 'Snack' },
      { key: 'dessert', name: 'Dessert' },
    ],
  },
  {
    key: 'kueche',
    name: 'Küche',
    tags: [
      { key: 'italienisch', name: 'Italienisch' },
      { key: 'asiatisch', name: 'Asiatisch' },
      { key: 'indisch', name: 'Indisch' },
      { key: 'mexikanisch', name: 'Mexikanisch' },
      { key: 'orientalisch', name: 'Orientalisch' },
    ],
  },
  {
    key: 'aufwand',
    name: 'Aufwand',
    filter: 'und',
    aufKarte: true,
    tags: [{ key: 'schnell', name: 'Schnell' }],
  },
  {
    key: 'merkmal',
    name: 'Merkmale',
    filter: 'und',
    aufKarte: true,
    tags: [
      { key: 'sauerteig', name: 'Sauerteig' },
      { key: 'hefe', name: 'Hefe' },
      { key: 'fermentiert', name: 'Fermentiert' },
      { key: 'grundrezept', name: 'Grundrezept' },
      { key: 'vortag', name: 'Vortag' },
    ],
  },
  {
    key: 'entdeckt',
    name: 'Entdeckt bei/in',
    frei: true,
    darstellung: 'herkunft',
    tags: [],
  },
];

export const SCHNELLZUGRIFF = [
  { text: 'Alle Rezepte', ziel: 'rezepte' },
  { text: 'Vegan', ziel: 'rezepte?f=ernaehrung/vegan' },
  { text: 'Schnell', ziel: 'rezepte?f=aufwand/schnell' },
];
