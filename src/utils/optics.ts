export interface RgbColor {
  r: number
  g: number
  b: number
}

const SPECTRAL_START_NM = 380
const SPECTRAL_END_NM = 750

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function wavelengthToRgb(wavelengthNm: number): RgbColor {
  const wavelength = clamp(
    wavelengthNm,
    SPECTRAL_START_NM,
    SPECTRAL_END_NM,
  )
  let red = 0
  let green = 0
  let blue = 0

  if (wavelength < 440) {
    red = -(wavelength - 440) / 60
    blue = 1
  } else if (wavelength < 490) {
    green = (wavelength - 440) / 50
    blue = 1
  } else if (wavelength < 510) {
    green = 1
    blue = -(wavelength - 510) / 20
  } else if (wavelength < 580) {
    red = (wavelength - 510) / 70
    green = 1
  } else if (wavelength < 645) {
    red = 1
    green = -(wavelength - 645) / 65
  } else {
    red = 1
  }

  let edgeFactor = 1
  if (wavelength < 420) {
    edgeFactor = 0.28 + (0.72 * (wavelength - 380)) / 40
  } else if (wavelength > 700) {
    edgeFactor = 0.28 + (0.72 * (750 - wavelength)) / 50
  }
  const gamma = 0.82

  return {
    r: Math.round(255 * (red * edgeFactor) ** gamma),
    g: Math.round(255 * (green * edgeFactor) ** gamma),
    b: Math.round(255 * (blue * edgeFactor) ** gamma),
  }
}

export function wavelengthToCss(
  wavelengthNm: number,
  alpha = 1,
) {
  const { r, g, b } = wavelengthToRgb(wavelengthNm)
  return alpha >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function wavelengthGradientCss(step = 10) {
  const stops: string[] = []
  for (
    let wavelength = SPECTRAL_START_NM;
    wavelength <= SPECTRAL_END_NM;
    wavelength += step
  ) {
    const position =
      ((wavelength - SPECTRAL_START_NM) /
        (SPECTRAL_END_NM - SPECTRAL_START_NM)) *
      100
    stops.push(`${wavelengthToCss(wavelength)} ${position.toFixed(2)}%`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export const SPECTRUM_RANGE = {
  min: SPECTRAL_START_NM,
  max: SPECTRAL_END_NM,
} as const
