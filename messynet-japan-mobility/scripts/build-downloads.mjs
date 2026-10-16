// Offline, downloadable copies of the two combined demos: brand fonts embedded (no internet needed),
// and the airport demo's link to the event readouts pointed at the sibling file in the same folder.
// Run `npm run demo` in both projects first. Output: ../Demo downloads/ and a zip of it.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const messynet = join(root, '..')
const fonts = join(messynet, 'Design System', 'fonts')
const outDir = join(messynet, 'Demo downloads')
const EVENTS_FILE = 'messynet-japan-event-readouts.html'

const b64 = (f) => readFileSync(join(fonts, f)).toString('base64')
const fontCss = readFileSync(join(fonts, 'font-faces.css'), 'utf8')
  .replace(/url\('__FONTS__\/([^']+)'\)/g, (_, f) => `url(data:font/woff2;base64,${b64(f)})`)
const googleFonts = /<link rel="preconnect"[^>]*>\n<link rel="preconnect"[^>]*>\n<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\n/

function offline(src, swaps = []) {
  let html = readFileSync(src, 'utf8')
  if (!googleFonts.test(html)) throw new Error(`no Google Fonts block in ${src}`)
  html = html.replace(googleFonts, `<style>\n${fontCss}\n</style>\n`)
  for (const [a, b] of swaps) {
    if (!html.includes(a)) throw new Error(`expected text not found in ${src}: ${a.slice(0, 60)}`)
    html = html.split(a).join(b)
  }
  if (/fonts\.googleapis|fonts\.gstatic/.test(html)) throw new Error(`${src} still loads web fonts`)
  return html
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'font-licences'), { recursive: true })
writeFileSync(join(outDir, 'messynet-japan-mobility.html'), offline(join(root, 'demo', 'messynet-japan-mobility.html'), [
  ['https://claude.ai/artifact/1LweeyyXwa1QrF58uQ7y1d', `./${EVENTS_FILE}`],
  ['Opens a separate page. It must be shared with you before the link works.', 'Opens the event readouts file that came in the same folder.'],
  ['別ページが開きます。共有設定がされていない場合は開けません。', '同じフォルダにあるイベント分析のファイルが開きます。'],
]))
writeFileSync(join(outDir, EVENTS_FILE), offline(join(messynet, 'Japan Event Readouts', 'demo', EVENTS_FILE)))
for (const f of ['OFL-DM-Sans.txt', 'OFL-Space-Grotesk.txt', 'OFL-JetBrains-Mono.txt']) copyFileSync(join(fonts, f), join(outDir, 'font-licences', f))
writeFileSync(join(outDir, 'README.txt'), `MessyNet · Japan demos (offline copies)

Open either file by double-clicking it. Both work without an internet connection.
Keep the two files in the same folder: the airport demo links to the event readouts.

messynet-japan-mobility.html
  Airport retail and airline / inbound tourism sample reports.
  SAMPLE DATA: every figure is made up to show what a report would look like.
  Open the "Start here" tab first: it lists what is real, assumed and still needed.

messynet-japan-event-readouts.html
  Fuji TV x Odaiba and CAPCOM x Tokyo Game Show readouts.
  REAL DATA from the MessyNet Japan mobility panel, September 2026.
  A sample of phones, not a head count.

Both files: English / Japanese and Daylight / Dark switches at the top right.
Fonts (DM Sans, Space Grotesk, JetBrains Mono) are embedded under the SIL Open Font
Licence; see font-licences/.
`)
const zip = join(messynet, 'MessyNet-Japan-demos.zip')
rmSync(zip, { force: true })
execSync(`cd "${messynet}" && zip -rq "MessyNet-Japan-demos.zip" "Demo downloads"`)
console.log('wrote', outDir, 'and', zip)
