// Packs the built app into ONE shareable HTML file: CSS, JS and the three data feeds
// inlined, Google Fonts linked. No server, no fetches. Output: demo/messynet-japan-mobility.html
// Written without <html>/<head>/<body>, as the artifact host wraps the page itself.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const index = readFileSync(join(dist, 'index.html'), 'utf8')
const cssHref = index.match(/href="\.?\/?(assets\/[^"]+\.css)"/)?.[1]
const jsSrc = index.match(/src="\.?\/?(assets\/[^"]+\.js)"/)?.[1]
if (!cssHref || !jsSrc) throw new Error('could not find built CSS/JS in dist/index.html — run `npm run build` first')
const safe = (s) => s.replace(/<\/script/gi, '<\\/script')
const css = readFileSync(join(dist, cssHref), 'utf8')
const js = readFileSync(join(dist, jsSrc), 'utf8')
const feed = (n) => JSON.parse(readFileSync(join(root, 'public', 'data', `${n}.json`), 'utf8'))
const data = { retail: feed('jp_retail_readout'), tourism: feed('jp_tourism_readout'), reference: feed('jp_reference') }

const html = `<meta charset="utf-8" />
<title>MessyNet Japan Mobility</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;600&display=swap" />
<style>
${css}
body { background: #f5f2e9; }
</style>
<div id="root"></div>
<script>window.__JP_DATA__ = ${safe(JSON.stringify(data))};</script>
<script type="module">
${safe(js)}
</script>
`
mkdirSync(join(root, 'demo'), { recursive: true })
const out = join(root, 'demo', 'messynet-japan-mobility.html')
writeFileSync(out, html)
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`)
