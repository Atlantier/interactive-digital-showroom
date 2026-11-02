import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CANONICAL_URL =
  'https://atlantier.github.io/interactive-digital-showroom/'

describe('showroom metadata', () => {
  it('publishes canonical, social metadata, and a 1200x630 card', () => {
    const html = readFileSync('index.html', 'utf8')

    expect(html).toContain(`rel="canonical"`)
    expect(html).toContain(CANONICAL_URL)
    expect(html).toContain('property="og:title"')
    expect(html).toContain('property="og:image"')
    expect(html).toContain('name="twitter:card"')
    expect(html).toContain('summary_large_image')

    const png = readFileSync('public/og-showroom.png')
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })
})
