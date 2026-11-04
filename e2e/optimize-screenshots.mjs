// Shrinks the README screenshots in place, with a reduced palette. Run by: npm --prefix e2e run screenshots
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const directory = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'screenshots')
let before = 0
let after = 0
for (const name of readdirSync(directory).filter((file) => file.endsWith('.png'))) {
  const path = join(directory, name)
  before += statSync(path).size
  const smaller = await sharp(readFileSync(path))
    .png({ palette: true, quality: 85, compressionLevel: 9, effort: 8 })
    .toBuffer()
  writeFileSync(path, smaller)
  after += smaller.length
}
console.log(`Screenshots: ${(before / 1024).toFixed(0)} KB down to ${(after / 1024).toFixed(0)} KB`)
