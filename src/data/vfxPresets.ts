export const VFX_PRESETS = [
  {
    id: 'emerald-cyber',
    primary: '#10b981',
    secondary: '#72e6ff',
    tertiary: '#a7f3d0',
    primaryRgb: '16 185 129',
    secondaryRgb: '114 230 255',
    tertiaryRgb: '167 243 208',
  },
  {
    id: 'supernova-gold',
    primary: '#f2b35e',
    secondary: '#ff7a1a',
    tertiary: '#fff1c2',
    primaryRgb: '242 179 94',
    secondaryRgb: '255 122 26',
    tertiaryRgb: '255 241 194',
  },
  {
    id: 'quantum-violet',
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
