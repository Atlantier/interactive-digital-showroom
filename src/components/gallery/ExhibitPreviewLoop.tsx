import type { CSSProperties } from 'react'
import { cn } from '../../lib/cn'
import type { GalleryExhibitId } from '../../store/useGalleryStore'

const TICKS = Array.from({ length: 12 }, (_, index) => index)
const SPECTRUM_RAYS = Array.from({ length: 7 }, (_, index) => index)
const SPECTRUM_COLORS = [
  '#ff655f',
  '#ffad52',
  '#ffe56d',
  '#69ff9d',
  '#5ee9ff',
  '#6e9cff',
  '#c184ff',
] as const
const PARTICLES = Array.from({ length: 16 }, (_, index) => index)
const ARCS = Array.from({ length: 6 }, (_, index) => index)
const AUDIO_BARS = Array.from({ length: 18 }, (_, index) => index)
const GPU_CELLS = Array.from({ length: 16 }, (_, index) => index)
const NEURAL_NODES = [
  [24, 62, 0],
  [24, 42, 1],
  [24, 82, 2],
  [68, 30, 0],
  [68, 56, 1],
  [68, 82, 2],
  [112, 32, 0],
  [112, 56, 1],
  [112, 82, 2],
  [156, 28, 0],
  [156, 50, 1],
  [156, 72, 2],
  [156, 94, 0],
  [196, 42, 1],
  [196, 62, 2],
  [196, 82, 0],
] as const

function PrismPreview() {
  return (
    <div className="preview-prism">
      <span className="preview-prism-axis" />
      <span className="preview-prism-crystal" />
      <span className="preview-prism-orbit" />
      {SPECTRUM_RAYS.map((index) => (
        <span
          key={index}
          className="preview-spectrum-ray"
          style={
            {
              '--i': index,
              '--ray-color': SPECTRUM_COLORS[index],
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

function HologramPreview() {
  return (
    <div className="preview-hologram">
      <span className="preview-hologram-ring preview-hologram-ring-a" />
      <span className="preview-hologram-ring preview-hologram-ring-b" />
      <span className="preview-hologram-ring preview-hologram-ring-c" />
      <span className="preview-hologram-model" />
      <span className="preview-hologram-scan" />
    </div>
  )
}

function ParticlePreview() {
  return (
    <div className="preview-particles">
      <span className="preview-particle-orbit preview-particle-orbit-a" />
      <span className="preview-particle-orbit preview-particle-orbit-b" />
      <span className="preview-particle-core" />
      {PARTICLES.map((index) => (
        <span
          key={index}
          className="preview-particle-dot"
          style={
            {
              '--i': index,
              '--particle-distance': `${38 + (index % 3) * 11}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

function ReactorPreview() {
  return (
    <div className="preview-reactor">
      <span className="preview-reactor-core" />
      <span className="preview-reactor-ring preview-reactor-ring-a" />
      <span className="preview-reactor-ring preview-reactor-ring-b" />
      <span className="preview-reactor-ring preview-reactor-ring-c" />
      {ARCS.map((index) => (
        <span
          key={index}
          className="preview-reactor-arc"
          style={{ '--i': index } as CSSProperties}
        />
      ))}
    </div>
  )
}

function RayMazePreview() {
  return (
    <svg
      className="preview-ray-maze"
      viewBox="0 0 220 132"
      aria-hidden="true"
    >
      <path
        className="preview-ray-guide"
        d="M12 76 L62 76 L92 42 L128 42 L154 76 L204 76"
      />
      <path
        className="preview-ray-guide preview-ray-guide-alt"
        d="M92 42 L112 86 L154 76"
      />
      <path
        className="preview-ray-pulse"
        d="M12 76 L62 76 L92 42 L128 42 L154 76 L204 76"
      />
      <path
        className="preview-ray-mirror"
        d="M53 63 L70 88"
      />
      <path
        className="preview-ray-mirror"
        d="M150 63 L164 87"
      />
      <circle className="preview-ray-target" cx="204" cy="76" r="8" />
      <circle className="preview-ray-emitter" cx="12" cy="76" r="4" />
    </svg>
  )
}

function AudioPreview() {
  return (
    <div className="preview-audio">
      <span className="preview-audio-ring preview-audio-ring-a" />
      <span className="preview-audio-ring preview-audio-ring-b" />
      <div className="preview-audio-bars">
        {AUDIO_BARS.map((index) => (
          <span
            key={index}
            className="preview-audio-bar"
            style={
              {
                '--i': index,
                '--bar-duration': `${0.72 + (index % 5) * 0.11}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span className="preview-audio-core" />
    </div>
  )
}

function NeuralPreview() {
  return (
    <div className="preview-neural">
      <svg viewBox="0 0 220 124" aria-hidden="true">
        <g className="preview-neural-links">
          <path d="M24 42 L68 30 L112 56 L156 42 L196 62" />
          <path d="M24 62 L68 56 L112 32 L156 72 L196 42" />
          <path d="M24 82 L68 82 L112 82 L156 94 L196 82" />
          <path d="M24 42 L68 82 L112 56 L156 28 L196 82" />
        </g>
        <path
          className="preview-neural-pulse"
          d="M24 62 L68 30 L112 56 L156 72 L196 62"
        />
        {NEURAL_NODES.map(([x, y, delay], index) => (
          <circle
            key={index}
            className="preview-neural-node"
            cx={x}
            cy={y}
            r={index > 11 ? 4 : 3}
            style={{ '--i': delay } as CSSProperties}
          />
        ))}
      </svg>
    </div>
  )
}

function GpuPreview() {
  return (
    <div className="preview-gpu">
      <span className="preview-gpu-plane preview-gpu-plane-a" />
      <span className="preview-gpu-plane preview-gpu-plane-b" />
      <div className="preview-gpu-cube">
        <div className="preview-gpu-grid">
          {GPU_CELLS.map((index) => (
            <span
              key={index}
              className="preview-gpu-cell"
              style={{ '--i': index } as CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function PreviewGlyph({ exhibitId }: { exhibitId: GalleryExhibitId }) {
  switch (exhibitId) {
    case 'prism-caustics':
      return <PrismPreview />
    case 'laser-scan-hologram':
      return <HologramPreview />
    case 'particle-morph':
      return <ParticlePreview />
    case 'plasma-reactor':
      return <ReactorPreview />
    case 'photonic-mesh':
      return <RayMazePreview />
    case 'orbital-lens':
      return <AudioPreview />
    case 'quantum-lattice':
      return <NeuralPreview />
    case 'phase-torus':
      return <GpuPreview />
  }
}

export function ExhibitPreviewLoop({
  exhibitId,
  active,
  tourCurrent,
  climaxActive,
  climaxPulse,
}: {
  exhibitId: GalleryExhibitId
  active: boolean
  tourCurrent: boolean
  climaxActive: boolean
  climaxPulse: number
}) {
  return (
    <div
      aria-hidden="true"
      data-exhibit-preview={exhibitId}
      data-preview-running={active ? 'true' : 'false'}
      data-preview-tour={tourCurrent ? 'true' : 'false'}
      className={cn(
        'exhibit-preview',
        active && 'is-active',
        tourCurrent && 'is-tour',
      )}
    >
      <span className="exhibit-preview-halo" />
      <span className="exhibit-preview-axis" />
      <span className="exhibit-preview-ticks">
        {TICKS.map((index) => (
          <span
            key={index}
            style={
              {
                '--i': index,
                '--tick-size': `${5 + (index % 3) * 2}px`,
              } as CSSProperties
            }
          />
        ))}
      </span>
      <div className="exhibit-preview-glyph">
        <PreviewGlyph exhibitId={exhibitId} />
      </div>
      <span className="exhibit-preview-scanline" />
      {climaxActive ? (
        <span
          key={climaxPulse}
          className="exhibit-preview-climax"
        />
      ) : null}
    </div>
  )
}
