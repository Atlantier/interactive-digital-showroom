import { describe, expect, it } from 'vitest'
import { sanitizeVisualPreferences } from '../../src/store/useAppStore'

describe('visual preference persistence', () => {
  it('keeps valid visual preferences and rejects invalid values', () => {
    expect(
      sanitizeVisualPreferences({
        accentTheme: 'violet',
        vfxPreset: 'quantum-violet',
        gravityMode: 'zero',
      }),
    ).toEqual({
      accentTheme: 'violet',
      vfxPreset: 'quantum-violet',
      gravityMode: 'zero',
    })

    expect(
      sanitizeVisualPreferences({
        accentTheme: 'unknown',
        vfxPreset: 'unknown',
        gravityMode: 'unknown',
      }),
    ).toEqual({
      accentTheme: 'emerald',
      vfxPreset: 'emerald-cyber',
      gravityMode: 'moon',
    })
  })
})
