export const REACTOR_OVERDRIVE_TIMING = {
  chargeSeconds: 1.5,
  shockwaveSeconds: 1.45,
  fadeStartSeconds: 3.8,
  fadeEndSeconds: 5,
} as const

export type ReactorOverdrivePhase =
  | 'idle'
  | 'charging'
  | 'shockwave'
  | 'cooldown'

export function resolveReactorOverdrivePhase(
  elapsedSeconds: number,
): ReactorOverdrivePhase {
  const {
    chargeSeconds,
    shockwaveSeconds,
    fadeEndSeconds,
  } = REACTOR_OVERDRIVE_TIMING

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return 'idle'
  }
  if (elapsedSeconds < chargeSeconds) return 'charging'
  if (
    elapsedSeconds <
    chargeSeconds + shockwaveSeconds
  ) {
    return 'shockwave'
  }
  if (elapsedSeconds < fadeEndSeconds) return 'cooldown'
  return 'idle'
}
