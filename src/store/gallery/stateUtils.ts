import {
  GALLERY_EXHIBITS,
  type ExhibitMeta,
  type GalleryExhibitId,
  type GalleryPresetId,
} from './catalog'

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function createExhibitInstances(): ExhibitMeta[] {
  return GALLERY_EXHIBITS.map((exhibit) => ({
    ...exhibit,
    params: { ...exhibit.params },
  }))
}

export function createInitialPresetState() {
  return Object.fromEntries(
    GALLERY_EXHIBITS.map((exhibit) => [exhibit.id, 'standard']),
  ) as Record<GalleryExhibitId, GalleryPresetId | null>
}

export function createPresetParams(
  exhibit: ExhibitMeta,
  presetId: GalleryPresetId,
) {
  if (presetId === 'standard') {
    const initial = GALLERY_EXHIBITS.find(
      (candidate) => candidate.id === exhibit.id,
    )
    return { ...(initial?.params ?? exhibit.params) }
  }

  const ratio = presetId === 'overdrive' ? 0.9 : 0.28
  return Object.fromEntries(
    exhibit.controls.map((control) => {
      const rawValue =
        control.key === 'wavelength'
          ? presetId === 'overdrive'
            ? 680
            : 450
          : control.min +
            (control.max - control.min) * ratio
      const value =
        control.min +
        Math.round(
          (rawValue - control.min) /
            Math.max(control.step, Number.EPSILON),
        ) *
          control.step
      return [
        control.key,
        clamp(value, control.min, control.max),
      ]
    }),
  )
}
