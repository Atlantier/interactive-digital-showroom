export const SHOWROOM_SECTIONS = [
  { id: 'home' },
  { id: 'works' },
  { id: 'gallery' },
  { id: 'architecture' },
  { id: 'sandbox' },
  { id: 'kinetics' },
  { id: 'archive' },
  { id: 'contact' },
] as const

export type SectionId = (typeof SHOWROOM_SECTIONS)[number]['id']
