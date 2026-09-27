/**
 * Measures every voiceover file and screen clip, and writes src/media.json.
 * The composition reads durations from here rather than guessing, so a re-recorded
 * line or a longer capture re-times the video without any hand editing.
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const seconds = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())

const vo = {}
const voDir = path.join(ROOT, 'public/vo')
for (const f of fs.existsSync(voDir) ? fs.readdirSync(voDir).filter((f) => f.endsWith('.mp3')).sort() : []) {
  vo[f.replace('.mp3', '')] = { file: `vo/${f}`, duration: seconds(path.join(voDir, f)) }
}

const clips = {}
const clipDir = path.join(ROOT, 'public/clips')
for (const f of fs.existsSync(clipDir) ? fs.readdirSync(clipDir).filter((f) => f.endsWith('.mp4')).sort() : []) {
  const file = path.join(clipDir, f)
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])
    .toString().trim().split(',').map(Number)
  clips[f.replace('.mp4', '')] = { file: `clips/${f}`, duration: seconds(file), width: w, height: h }
}

fs.writeFileSync(path.join(ROOT, 'src/media.json'), JSON.stringify({ vo, clips }, null, 1) + '\n')
console.log('vo:', Object.keys(vo).length, 'clips:', Object.keys(clips).length)
for (const [k, v] of Object.entries(clips)) console.log(`  ${k.padEnd(14)} ${v.duration.toFixed(2)}s  ${v.width}x${v.height}`)
