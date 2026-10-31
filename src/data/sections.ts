export const SHOWROOM_SECTIONS = [
  { id: 'home', label: '起点' },
  { id: 'works', label: '作品' },
  { id: 'architecture', label: '架构' },
  { id: 'sandbox', label: '沙盒' },
  { id: 'kinetics', label: '运动' },
  { id: 'archive', label: '档案' },
  { id: 'contact', label: '联系' },
] as const

export type SectionId = (typeof SHOWROOM_SECTIONS)[number]['id']
