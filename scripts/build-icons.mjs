import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

mkdirSync(join(root, 'build', 'icons'), { recursive: true })

const svg = readFileSync(join(root, 'public', 'favicon.svg'))

await sharp(svg).resize(256, 256).png().toFile(join(root, 'build', 'icons', 'icon.png'))
console.log('build/icons/icon.png written')
