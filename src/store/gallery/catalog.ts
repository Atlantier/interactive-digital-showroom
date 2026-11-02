export const GALLERY_EXHIBIT_IDS = [
  'prism-caustics',
  'laser-scan-hologram',
  'particle-morph',
  'plasma-reactor',
  'photonic-mesh',
  'orbital-lens',
  'quantum-lattice',
  'phase-torus',
] as const

export type GalleryExhibitId = (typeof GALLERY_EXHIBIT_IDS)[number]
export type OpticalTourMode = 'gallery' | 'darkroom'
export type PrismShape = 'octahedron' | 'prism' | 'icosahedron'
export type HologramModel =
  | 'gyro-core'
  | 'cyber-skull'
  | 'turbine-rotor'
export type ParticleManifold =
  | 'mobius-ring'
  | 'double-helix'
  | 'trefoil-knot'
  | 'fibonacci-sphere'
  | 'wafer-city'

export const OPTICAL_TOUR_STEP_MS = 6_000
export const OPTICAL_TOUR_CLIMAX_MS = 2_000

export const PARTICLE_MANIFOLD_ORDER: readonly ParticleManifold[] = [
  'mobius-ring',
  'double-helix',
  'trefoil-knot',
  'fibonacci-sphere',
  'wafer-city',
]
export type GalleryControlKey =
  | 'wavelength'
  | 'slitGap'
  | 'coherence'
  | 'exposure'
  | 'ior'
  | 'dispersion'
  | 'incidence'
  | 'beamPower'
  | 'curvature'
  | 'focus'
  | 'gain'
  | 'aberration'
  | 'angle'
  | 'magneticField'
  | 'temperature'
  | 'turbulence'
  | 'arcCount'
  | 'verdet'
  | 'contrast'
  | 'phase'
  | 'coupling'
  | 'focal'
  | 'aperture'
  | 'mass'
  | 'excitation'
  | 'lifetime'
  | 'yield'
  | 'lattice'
  | 'winding'
  | 'twist'
  | 'flow'
  | 'pressure'
  | 'scanRate'
  | 'scanWidth'
  | 'tempo'
  | 'drive'
  | 'spectrumBias'
  | 'waveDensity'
  | 'attention'
  | 'pulseRate'
  | 'depth'
  | 'tensorLoad'
  | 'clock'
  | 'rayBias'
  | 'bvhDepth'

export interface ExhibitControlSpec {
  key: GalleryControlKey
  symbol: string
  min: number
  max: number
  step: number
  unit?: string
}

export interface ExhibitMeta {
  id: GalleryExhibitId
  formula: string
  params: Record<string, number>
  controls: readonly ExhibitControlSpec[]
}

export type GalleryPresetId =
  | 'standard'
  | 'overdrive'
  | 'analysis'

export const GALLERY_PRESETS = [
  {
    id: 'standard',
  },
  {
    id: 'overdrive',
  },
  {
    id: 'analysis',
  },
] as const satisfies readonly {
  id: GalleryPresetId
}[]

export const GALLERY_EXHIBITS: readonly ExhibitMeta[] = [
  {
    id: 'prism-caustics',
    formula:
      'theta_out(lambda) = theta_in + asin(sin(theta_in) / n(lambda))',
    params: {
      ior: 2.4,
      dispersion: 1.6,
      incidence: 18,
      beamPower: 1.2,
    },
    controls: [
      {
        key: 'ior',
        symbol: 'n0',
        min: 1.4,
        max: 2.8,
        step: 0.01,
      },
      {
        key: 'dispersion',
        symbol: 'B',
        min: 0.2,
        max: 2.4,
        step: 0.01,
      },
      {
        key: 'incidence',
        symbol: 'theta',
        min: 10,
        max: 74,
        step: 0.5,
        unit: 'deg',
      },
      {
        key: 'beamPower',
        symbol: 'P',
        min: 0.1,
        max: 1.8,
        step: 0.01,
      },
    ],
  },
  {
    id: 'laser-scan-hologram',
    formula:
      'H(y,s) = reveal(y,s) + wire(y) + fringe(y-s) * 5.0',
    params: {
      scanRate: 0.72,
      scanWidth: 0.18,
      coherence: 0.88,
      gain: 1.24,
    },
    controls: [
      {
        key: 'scanRate',
        symbol: 'v_s',
        min: 0.15,
        max: 1.8,
        step: 0.01,
      },
      {
        key: 'scanWidth',
        symbol: 'delta',
        min: 0.03,
        max: 0.5,
        step: 0.01,
      },
      {
        key: 'coherence',
        symbol: 'gamma',
        min: 0.1,
        max: 1,
        step: 0.01,
      },
      {
        key: 'gain',
        symbol: 'G',
        min: 0.2,
        max: 2,
        step: 0.01,
      },
    ],
  },
  {
    id: 'particle-morph',
    formula:
      'M(u) = mix(A, B, u) + curl(A) * sin(pi * u)',
    params: {
      phase: 1.2,
      coupling: 0.64,
      flow: 0.82,
      gain: 1.24,
    },
    controls: [
      {
        key: 'phase',
        symbol: 'phi',
        min: 0,
        max: 6.28,
        step: 0.01,
        unit: 'rad',
      },
      {
        key: 'coupling',
        symbol: 'kappa',
        min: 0.05,
        max: 1,
        step: 0.01,
      },
      {
        key: 'flow',
        symbol: 'omega',
        min: 0.1,
        max: 1.6,
        step: 0.01,
      },
      {
        key: 'gain',
        symbol: 'G',
        min: 0.2,
        max: 2,
        step: 0.01,
      },
    ],
  },
  {
    id: 'plasma-reactor',
    formula:
      'beta = 2*mu0*p_plasma / B^2; T_core -> Planck(lambda, T)',
    params: {
      magneticField: 1.28,
      temperature: 92,
      turbulence: 0.72,
      arcCount: 10,
    },
    controls: [
      {
        key: 'magneticField',
        symbol: 'B',
        min: 0.4,
        max: 2.4,
        step: 0.01,
        unit: 'T',
      },
      {
        key: 'temperature',
        symbol: 'T',
        min: 18,
        max: 160,
        step: 1,
        unit: 'MK',
      },
      {
        key: 'turbulence',
        symbol: 'tau',
        min: 0.15,
        max: 1.5,
        step: 0.01,
      },
      {
        key: 'arcCount',
        symbol: 'N',
        min: 8,
        max: 12,
        step: 1,
      },
    ],
  },
  {
    id: 'photonic-mesh',
    formula:
      'r = d - 2(d dot n)n; I_out = I_in * product(rho)',
    params: {
      phase: 0.18,
      wavelength: 532,
      gain: 1.05,
    },
    controls: [
      {
        key: 'phase',
        symbol: 'phi',
        min: 0.04,
        max: 0.3,
        step: 0.005,
        unit: 'rad',
      },
      {
        key: 'wavelength',
        symbol: 'lambda',
        min: 420,
        max: 900,
        step: 1,
        unit: 'nm',
      },
      {
        key: 'gain',
        symbol: 'g',
        min: 0.1,
        max: 1.8,
        step: 0.01,
      },
    ],
  },
  {
    id: 'orbital-lens',
    formula:
      'h(i,j) = H0 + drive * FFT(bin) * radialGain(r)',
    params: {
      tempo: 104,
      drive: 1.05,
      spectrumBias: 0.55,
      waveDensity: 1,
    },
    controls: [
      {
        key: 'tempo',
        symbol: 'BPM',
        min: 72,
        max: 148,
        step: 1,
      },
      {
        key: 'drive',
        symbol: 'G',
        min: 0.5,
        max: 1.8,
        step: 0.01,
      },
      {
        key: 'spectrumBias',
        symbol: 'B',
        min: 0.15,
        max: 0.9,
        step: 0.01,
      },
      {
        key: 'waveDensity',
        symbol: 'N',
        min: 0.6,
        max: 1.8,
        step: 0.01,
      },
    ],
  },
  {
    id: 'quantum-lattice',
    formula:
      'Attention(Q,K,V) = softmax(QK^T / sqrt(d_k)) V',
    params: {
      attention: 0.82,
      coupling: 0.68,
      pulseRate: 1.15,
      depth: 0.72,
    },
    controls: [
      {
        key: 'attention',
        symbol: 'A',
        min: 0.2,
        max: 1,
        step: 0.01,
      },
      {
        key: 'coupling',
        symbol: 'C',
        min: 0.1,
        max: 1,
        step: 0.01,
      },
      {
        key: 'pulseRate',
        symbol: 'v',
        min: 0.4,
        max: 2,
        step: 0.01,
      },
      {
        key: 'depth',
        symbol: 'L',
        min: 0.3,
        max: 1.2,
        step: 0.01,
      },
    ],
  },
  {
    id: 'phase-torus',
    formula:
      'D = A x B + C; ray intersects BVH(root) -> leaf',
    params: {
      tensorLoad: 0.82,
      clock: 1.36,
      rayBias: 0.18,
      bvhDepth: 0.72,
    },
    controls: [
      {
        key: 'tensorLoad',
        symbol: 'A',
        min: 0.2,
        max: 1.4,
        step: 0.01,
      },
      {
        key: 'clock',
        symbol: 'f',
        min: 0.4,
        max: 2,
        step: 0.01,
      },
      {
        key: 'rayBias',
        symbol: 'e',
        min: 0.02,
        max: 0.5,
        step: 0.01,
      },
      {
        key: 'bvhDepth',
        symbol: 'L',
        min: 0.25,
        max: 1.25,
        step: 0.01,
      },
    ],
  },
]

