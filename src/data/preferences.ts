export const ACCENT_THEMES = [
  {
    id: 'emerald',
    color: '#10b981',
    rgb: '16 185 129',
  },
  {
    id: 'violet',
    color: '#8b5cf6',
    rgb: '139 92 246',
  },
  {
    id: 'titanium',
    color: '#e6a15a',
    rgb: '230 161 90',
  },
] as const

export type AccentTheme = (typeof ACCENT_THEMES)[number]['id']

export const GRAVITY_MODES = [
  {
    id: 'zero',
    gravity: 0,
  },
  {
    id: 'moon',
    gravity: 1_260,
  },
  {
    id: 'hyper',
    gravity: 2_780,
  },
] as const

export type GravityMode = (typeof GRAVITY_MODES)[number]['id']

export function getAccentTheme(theme: AccentTheme) {
  return (
    ACCENT_THEMES.find((candidate) => candidate.id === theme) ??
    ACCENT_THEMES[0]
  )
}

export function getGravityMode(mode: GravityMode) {
  return (
    GRAVITY_MODES.find((candidate) => candidate.id === mode) ??
    GRAVITY_MODES[1]
  )
}
