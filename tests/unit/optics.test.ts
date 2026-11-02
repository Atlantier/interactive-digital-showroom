import { describe, expect, it } from 'vitest'
import {
  SPECTRUM_RANGE,
  wavelengthGradientCss,
  wavelengthToCss,
  wavelengthToRgb,
} from '../../src/utils/optics'

describe('optics', () => {
  it('maps visible wavelengths into RGB channel bounds', () => {
    for (let wavelength = 380; wavelength <= 750; wavelength += 10) {
      const rgb = wavelengthToRgb(wavelength)
      expect(rgb.r).toBeGreaterThanOrEqual(0)
      expect(rgb.r).toBeLessThanOrEqual(255)
      expect(rgb.g).toBeGreaterThanOrEqual(0)
      expect(rgb.g).toBeLessThanOrEqual(255)
      expect(rgb.b).toBeGreaterThanOrEqual(0)
      expect(rgb.b).toBeLessThanOrEqual(255)
    }
  })

  it('emits stable CSS for visible and out-of-range wavelengths', () => {
    expect(wavelengthToCss(532)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    expect(wavelengthToCss(532, 0.5)).toMatch(
      /^rgba\(\d+, \d+, \d+, 0\.5\)$/,
    )
    expect(wavelengthToRgb(-100)).toEqual(
      wavelengthToRgb(SPECTRUM_RANGE.min),
    )
    expect(wavelengthToRgb(2_000)).toEqual(
      wavelengthToRgb(SPECTRUM_RANGE.max),
    )
  })

  it('creates a non-empty spectral gradient', () => {
    const gradient = wavelengthGradientCss(10)
    expect(gradient).toMatch(/^linear-gradient\(90deg, rgb/)
    expect(gradient).toContain('100.00%')
  })
})
