// Lighthouse, pinned in package.json, run with the Playwright image's own Chromium (ADR-067).
//
// Locally, against the production image: npm --prefix e2e run lighthouse
// Against a deployed site, from the E2E container:
//   LH_URL=https://iknowserviceai.onrender.com/ LH_RUNS=1 node lighthouse.mjs
//
// Each preset runs LH_RUNS times (3 by default), and the run with the median performance score is
// reported. Results go to .verify/lighthouse/, which git ignores.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

const url = process.env.LH_URL ?? 'http://localhost:8080/'
const runs = Number(process.env.LH_RUNS ?? 3)
const hostRules = process.env.LH_URL ? '' : (process.env.HOST_RULES ?? '')
const outDir = '.verify/lighthouse'
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']
const METRICS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
]

mkdirSync(outDir, { recursive: true })

async function once(preset) {
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(hostRules ? [`--host-resolver-rules=${hostRules}`] : []),
    ],
  })
  try {
    const config = preset === 'desktop' ? desktopConfig : undefined
    const result = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error' }, config)
    const lhr = result.lhr
    return {
      scores: Object.fromEntries(CATEGORIES.map((key) => [key, Math.round(lhr.categories[key].score * 100)])),
      metrics: Object.fromEntries(METRICS.map((key) => [key, lhr.audits[key].displayValue])),
      failed: Object.values(lhr.audits)
        .filter((audit) => audit.score !== null && audit.score < 1 && audit.scoreDisplayMode !== 'informative' && audit.scoreDisplayMode !== 'manual' && audit.scoreDisplayMode !== 'notApplicable')
        .map((audit) => `${audit.id}${audit.displayValue ? ` (${audit.displayValue})` : ''}`),
      transferBytes: lhr.audits['total-byte-weight']?.numericValue,
      lighthouseVersion: lhr.lighthouseVersion,
      userAgent: lhr.environment.hostUserAgent,
    }
  } finally {
    await chrome.kill()
  }
}

const summary = { url, runs, date: new Date().toISOString().slice(0, 10), presets: {} }
for (const preset of ['mobile', 'desktop']) {
  const results = []
  for (let index = 0; index < runs; index += 1) {
    const result = await once(preset)
    console.log(`${preset} run ${index + 1}: ${JSON.stringify(result.scores)} ${JSON.stringify(result.metrics)}`)
    results.push(result)
  }
  const ordered = [...results].sort((a, b) => a.scores.performance - b.scores.performance)
  const median = ordered[Math.floor(ordered.length / 2)]
  summary.presets[preset] = { median, all: results.map((result) => result.scores) }
  console.log(`${preset} median: ${JSON.stringify(median.scores)}`)
  if (median.failed.length) console.log(`${preset} audits below full marks: ${median.failed.join(', ')}`)
  console.log(`${preset} transfer: ${Math.round((median.transferBytes ?? 0) / 1024)} KiB`)
}

const name = process.env.LH_URL ? 'live' : 'local'
writeFileSync(`${outDir}/${name}-summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
console.log(`Wrote ${outDir}/${name}-summary.json`)
