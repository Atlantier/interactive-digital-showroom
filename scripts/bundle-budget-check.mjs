import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const distDir = 'dist'
const assetsDir = join(distDir, 'assets')
const html = readFileSync(join(distDir, 'index.html'), 'utf8')

function gzipKb(path) {
  return gzipSync(readFileSync(path)).byteLength / 1024
}

function parseAssets(pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1])
}

const entryAssets = parseAssets(
  /<script[^>]+src="\.\/assets\/([^"]+\.js)"/g,
)
const preloadAssets = parseAssets(
  /<link[^>]+rel="modulepreload"[^>]+href="\.\/assets\/([^"]+\.js)"/g,
)
const styleAssets = parseAssets(
  /<link[^>]+rel="stylesheet"[^>]+href="\.\/assets\/([^"]+\.css)"/g,
)

const entryKb = entryAssets.reduce(
  (total, asset) => total + gzipKb(join(assetsDir, asset)),
  0,
)
const initialKb = [...new Set([...entryAssets, ...preloadAssets])].reduce(
  (total, asset) => total + gzipKb(join(assetsDir, asset)),
  0,
)
const cssKb = styleAssets.reduce(
  (total, asset) => total + gzipKb(join(assetsDir, asset)),
  0,
)
const fontKb = readdirSync(assetsDir)
  .filter((asset) => /\.(woff2?|ttf|otf)$/i.test(asset))
  .reduce(
    (total, asset) =>
      total + statSync(join(assetsDir, asset)).size / 1024,
    0,
  )

const budgets = {
  entry: 100,
  initial: 500,
  css: 35,
  fonts: 140,
}
const measurements = {
  entry: entryKb,
  initial: initialKb,
  css: cssKb,
  fonts: fontKb,
}
const violations = Object.entries(budgets).filter(
  ([key, budget]) => measurements[key] > budget,
)

console.log(
  [
    `Entry JS: ${entryKb.toFixed(1)} KB gzip`,
    `Initial JS: ${initialKb.toFixed(1)} KB gzip`,
    `CSS: ${cssKb.toFixed(1)} KB gzip`,
    `Fonts: ${fontKb.toFixed(1)} KB`,
  ].join(' | '),
)

if (violations.length > 0) {
  for (const [key, budget] of violations) {
    console.error(
      `Bundle budget exceeded: ${key} ${measurements[key].toFixed(
        1,
      )} KB > ${budget} KB`,
    )
  }
  process.exit(1)
}
