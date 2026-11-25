// Farbthemen für Bücher. Die Farben stehen in src/styles/global.css (.thema-<key>), hell und dunkel,
// jeweils auf Lesbarkeit geprüft (Kontrast mindestens 4,5:1).
export const THEMEN = [
  { key: 'standard', name: 'Terrakotta' },
  { key: 'lila', name: 'Lila' },
  { key: 'rosa', name: 'Rosa' },
  { key: 'gruen', name: 'Grün' },
  { key: 'petrol', name: 'Petrol' },
  { key: 'blau', name: 'Blau' },
  { key: 'orange', name: 'Orange' },
] as const;

export const istThema = (key: string) => THEMEN.some((t) => t.key === key);
