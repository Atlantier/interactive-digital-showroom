export const ACCENT_THEMES = [
  {
    id: 'emerald',
    label: '翡翠绿',
    subtitle: 'EMERALD SIGNAL',
    description: '冷静、清晰，适合长时间观察与操作。',
    color: '#10b981',
    rgb: '16 185 129',
  },
  {
    id: 'violet',
    label: '赛博紫',
    subtitle: 'CYBER VIOLET',
    description: '更高能量的夜间界面与空间计算氛围。',
    color: '#8b5cf6',
    rgb: '139 92 246',
  },
  {
    id: 'titanium',
    label: '钛金橙',
    subtitle: 'TITANIUM AMBER',
    description: '偏暖的工业金属质感与精密仪器气质。',
    color: '#e6a15a',
    rgb: '230 161 90',
  },
] as const

export type AccentTheme = (typeof ACCENT_THEMES)[number]['id']

export const GRAVITY_MODES = [
  {
    id: 'zero',
    label: '零重力',
    subtitle: 'ZERO G',
    description: '关闭垂直重力，让工牌在风场中自由漂浮。',
    gravity: 0,
  },
  {
    id: 'moon',
    label: '月球重力',
    subtitle: 'LUNAR G',
    description: '约地球重力的六分之一，适合观察慢速摆动。',
    gravity: 1_260,
  },
  {
    id: 'hyper',
    label: '超重模式',
    subtitle: 'HYPER G',
    description: '相较默认重力约 2.2 倍，强化绷紧与碰撞反馈。',
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
