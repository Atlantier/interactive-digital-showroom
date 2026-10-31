export const VFX_PRESETS = [
  {
    id: 'emerald-cyber',
    label: '翡翠赛博',
    subtitle: 'EMERALD CYBER',
    description: '翡翠绿、离子青与冷白高光',
    primary: '#10b981',
    secondary: '#72e6ff',
    tertiary: '#a7f3d0',
    primaryRgb: '16 185 129',
    secondaryRgb: '114 230 255',
    tertiaryRgb: '167 243 208',
  },
  {
    id: 'supernova-gold',
    label: '黑金超新星',
    subtitle: 'SUPERNOVA GOLD',
    description: '熔金、琥珀与超新星暖白',
    primary: '#f2b35e',
    secondary: '#ff7a1a',
    tertiary: '#fff1c2',
    primaryRgb: '242 179 94',
    secondaryRgb: '255 122 26',
    tertiaryRgb: '255 241 194',
  },
  {
    id: 'quantum-violet',
    label: '量子幻影紫',
    subtitle: 'QUANTUM VIOLET',
    description: '量子紫、电光青与幻影粉',
    primary: '#a78bfa',
    secondary: '#67e8f9',
    tertiary: '#f0abfc',
    primaryRgb: '167 139 250',
    secondaryRgb: '103 232 249',
    tertiaryRgb: '240 171 252',
  },
] as const

export type VfxPreset = (typeof VFX_PRESETS)[number]['id']
export type VfxPresetConfig = (typeof VFX_PRESETS)[number]

export function getVfxPreset(preset: VfxPreset): VfxPresetConfig {
  return (
    VFX_PRESETS.find((candidate) => candidate.id === preset) ??
    VFX_PRESETS[0]
  )
}
