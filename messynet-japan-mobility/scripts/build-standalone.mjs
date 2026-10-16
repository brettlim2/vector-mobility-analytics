// Builds one self-contained, shareable HTML file per report. Each build sets ONLY=<report>, so the
// bundler removes the other report's code and copy, and only that report's data is embedded.
// Output: demo/messynet-airport-retail-demo.html, demo/messynet-inbound-tourism-demo.html
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const feed = (n) => JSON.parse(readFileSync(join(root, 'public', 'data', `${n}.json`), 'utf8'))
const VARIANTS = [
  { only: 'retail', title: 'MessyNet Airport Retail Demo', file: 'messynet-airport-retail-demo.html',
    data: () => ({ retail: feed('jp_retail_readout'), tourism: null, reference: feed('jp_reference') }),
    mustNotContain: ['Taiwan', 'Kansai', 'Narita', 'eSIM', 'Fuji TV', 'CAPCOM', 'Odaiba', 'Tokyo Game Show', 'artifact/1Lwee'] },
  { only: 'tourism', title: 'MessyNet Inbound Tourism Demo', file: 'messynet-inbound-tourism-demo.html',
    data: () => ({ retail: null, tourism: feed('jp_tourism_readout'), reference: feed('jp_reference') }),
    mustNotContain: ['New Chitose Airport ×', 'Fashion A', 'Zara', 'tenant', 'Fuji TV', 'CAPCOM', 'Odaiba', 'Tokyo Game Show', 'artifact/1Lwee'] },
]
const safe = (s) => s.replace(/<\/script/gi, '<\\/script')

for (const v of VARIANTS) {
  const out = join(root, `dist-${v.only}`)
  execSync(`npx vite build --outDir "${out}" --emptyOutDir`, { cwd: root, stdio: 'pipe', env: { ...process.env, ONLY: v.only } })
  const index = readFileSync(join(out, 'index.html'), 'utf8')
  const css = readFileSync(join(out, index.match(/href="\.?\/?(assets\/[^"]+\.css)"/)[1]), 'utf8')
  const js = readFileSync(join(out, index.match(/src="\.?\/?(assets\/[^"]+\.js)"/)[1]), 'utf8')
  const html = `<meta charset="utf-8" />
<title>${v.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;600&display=swap" />
<style>
${css}
body { background: #f5f2e9; }
</style>
<div id="root"></div>
<script>window.__JP_DATA__ = ${safe(JSON.stringify(v.data()))};</script>
<script type="module">
${safe(js)}
</script>
`
  // the point of a standalone demo: nothing from the other report travels with it
  const leaks = v.mustNotContain.filter((w) => html.includes(w))
  if (leaks.length) throw new Error(`${v.file} still contains: ${leaks.join(', ')}`)
  mkdirSync(join(root, 'demo'), { recursive: true })
  writeFileSync(join(root, 'demo', v.file), html)
  rmSync(out, { recursive: true, force: true })
  console.log(`wrote demo/${v.file} (${(html.length / 1024).toFixed(0)} KB) · checked clean of: ${v.mustNotContain.join(', ')}`)
}
