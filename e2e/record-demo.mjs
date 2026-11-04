// Records the silent walkthrough against the production image, in mock mode:
//   npm --prefix e2e run demo:record
// Writes assets/demo/iknowserviceai-demo.mp4 and an animated preview, iknowserviceai-demo.gif.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const output = join(root, 'assets', 'demo')
const FFMPEG = 'jrottenberg/ffmpeg:7.1-alpine'
const MAX_VIDEO_MB = 15
const MAX_PREVIEW_MB = 8

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`)
}

function findVideo(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = findVideo(path)
      if (found) return found
    } else if (entry.name.endsWith('.webm')) return path
  }
  return null
}

function ffmpeg(...args) {
  run('docker', ['run', '--rm', '--volume', `${root}:/work`, '--workdir', '/work', FFMPEG, '-y', '-loglevel', 'error', ...args])
}

function sizeMb(path) {
  return statSync(path).size / 1024 / 1024
}

run('node', [join(here, 'run-prod.mjs'), '--project=demo'])
const video = findVideo(join(here, 'test-results'))
if (!video) throw new Error('The recording produced no video.')
const source = relative(root, video).replaceAll('\\', '/')
mkdirSync(output, { recursive: true })

const mp4 = join(output, 'iknowserviceai-demo.mp4')
ffmpeg('-i', source, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', 'assets/demo/iknowserviceai-demo.mp4')

// Twice the speed and a small palette: a preview only has to give the idea.
const gif = join(output, 'iknowserviceai-demo.gif')
ffmpeg('-i', source, '-filter_complex', 'setpts=0.5*PTS,fps=5,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', 'assets/demo/iknowserviceai-demo.gif')

console.log(`Video: ${sizeMb(mp4).toFixed(1)} MB. Preview: ${sizeMb(gif).toFixed(1)} MB.`)
if (sizeMb(mp4) > MAX_VIDEO_MB) throw new Error(`The video is over ${MAX_VIDEO_MB} MB.`)
if (sizeMb(gif) > MAX_PREVIEW_MB) throw new Error(`The preview is over ${MAX_PREVIEW_MB} MB.`)
