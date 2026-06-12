// Browser-side audio → 128k MP3 conversion using ffmpeg.wasm.
// Single-threaded core: no SharedArrayBuffer / cross-origin-isolation headers
// needed, so it works on the live Vercel site as-is. The ~25 MB core is loaded
// lazily from a CDN on first use and reused after that.
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// ESM build: under Vite the ffmpeg worker is a module worker, so it loads the
// core via dynamic import() — which needs the esm variant, not umd.
const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'

let ffmpegPromise = null

function loadFFmpeg(onProgress) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg()
      if (onProgress) ffmpeg.on('progress', ({ progress }) => onProgress(progress))
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })()
  }
  return ffmpegPromise
}

/** Warm up the wasm core ahead of time (optional). */
export async function preloadWasm() {
  try { await loadFFmpeg() } catch { /* ignore */ }
}

/** Convert a File/Blob to a 128k (or given) stereo MP3 Blob, in the browser. */
export async function convertToMp3Wasm(file, bitrate = '128') {
  const ffmpeg = await loadFFmpeg()
  const inName = `in-${Date.now()}-${Math.floor(performance.now())}`
  const outName = `${inName}.mp3`
  await ffmpeg.writeFile(inName, await fetchFile(file))
  // -vn: drop any video/cover stream, -ac 2: stereo, -b:a: target bitrate
  await ffmpeg.exec(['-i', inName, '-vn', '-ac', '2', '-b:a', `${bitrate}k`, outName])
  const data = await ffmpeg.readFile(outName)
  try { await ffmpeg.deleteFile(inName); await ffmpeg.deleteFile(outName) } catch { /* ignore */ }
  return new Blob([data.buffer], { type: 'audio/mpeg' })
}
