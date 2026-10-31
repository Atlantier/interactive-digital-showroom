import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { soundEngine } from '../../utils/soundEngine'

const BAR_HEIGHTS = [7, 11, 15, 10, 6] as const
const BAND_COUNT = BAR_HEIGHTS.length

export function SoundSpectrum() {
  const soundEnabled = useAppStore((state) => state.soundEnabled)
  const spectrumRef = useRef<HTMLDivElement>(null)
  const barRefs = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    if (!soundEnabled) {
      for (let index = 0; index < BAND_COUNT; index += 1) {
        const bar = barRefs.current[index]
        if (!bar) continue
        bar.style.transform = 'scaleY(0.12)'
        bar.style.opacity = '0.22'
      }
      if (spectrumRef.current) {
        spectrumRef.current.dataset.audioLevel = '0.000'
        spectrumRef.current.dataset.active = 'false'
      }
      return
    }

    let animationFrame = 0
    const bands = new Float32Array(BAND_COUNT)
    const smoothed = new Float32Array(BAND_COUNT)

    const draw = () => {
      soundEngine.readFrequencyBands(bands)

      let total = 0
      for (let index = 0; index < BAND_COUNT; index += 1) {
        const value = bands[index]
        const smoothing = value > smoothed[index] ? 0.68 : 0.16
        smoothed[index] += (value - smoothed[index]) * smoothing
        const visualValue = smoothed[index]
        const scale = 0.12 + Math.pow(visualValue, 0.62) * 0.88
        const bar = barRefs.current[index]

        if (bar) {
          bar.style.transform = `scaleY(${scale.toFixed(3)})`
          bar.style.opacity = String(0.22 + visualValue * 0.78)
        }
        total += visualValue
      }

      const average = total / BAND_COUNT
      if (spectrumRef.current) {
        spectrumRef.current.dataset.audioLevel = average.toFixed(3)
        spectrumRef.current.dataset.active =
          average > 0.015 ? 'true' : 'false'
      }
      animationFrame = window.requestAnimationFrame(draw)
    }

    animationFrame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [soundEnabled])

  return (
    <div
      ref={spectrumRef}
      data-audio-spectrum
      data-audio-level="0"
      data-active="false"
      role="img"
      aria-label="实时音频频谱"
      title="实时音频频谱"
      className="audio-spectrum flex h-9 w-8 shrink-0 items-end justify-center gap-[2px] border border-white/10 bg-white/[0.025] px-[5px] py-[7px]"
    >
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={height}
          ref={(element) => {
            barRefs.current[index] = element
          }}
          data-spectrum-bar
          data-frequency-band={index + 1}
          aria-hidden="true"
          className="audio-spectrum-bar"
          style={{
            height,
            transform: 'scaleY(0.12)',
          }}
        />
      ))}
    </div>
  )
}
