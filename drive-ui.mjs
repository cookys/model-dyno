// Actually drive the LIVE site. Static checks proved the code shipped; this proves the
// interaction works. Focus is /speed/cloud — the board the vendor filter was asked for.
import { chromium } from 'playwright'

const BASE = 'https://cookys.github.io/model-dyno/'
const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const settle = (ms = 3000) => page.waitForTimeout(ms)
const modelCol = () =>
  page.$$eval('table tbody tr', (rs) =>
    rs.map((r) => r.querySelector('td')?.innerText?.trim().split('\n')[0]).filter(Boolean))

log('=== /speed/cloud — unfiltered ===')
await page.goto(`${BASE}#/speed/cloud`, { waitUntil: 'networkidle' })
await settle()
const before = await modelCol()
log(`rows: ${before.length}`)
log(`grok rows: ${JSON.stringify(before.filter((m) => /grok/i.test(m)))}`)

// the vendor control
const sel = page.locator('select').filter({ hasText: /All vendors|全部廠商/ }).first()
const selCount = await sel.count()
log(`vendor selector found: ${selCount}`)
if (selCount) {
  log(`options: ${JSON.stringify(await sel.locator('option').allTextContents())}`)
}
await page.screenshot({ path: '/home/cookys/shot-cloud-before.png' })

log('\n=== select xAI ===')
if (selCount) {
  await sel.selectOption({ label: 'xAI' })
  await settle()
  log(`url: ${page.url()}`)
  const after = await modelCol()
  log(`rows: ${after.length}`)
  log(`models shown: ${JSON.stringify(after)}`)
  const nonGrok = after.filter((m) => !/grok/i.test(m))
  log(`NON-grok rows leaking in: ${JSON.stringify(nonGrok)}`)
  const banner = await page.locator('text=/Vendor family|廠商家族/').count()
  log(`banner visible: ${banner}`)
  await page.screenshot({ path: '/home/cookys/shot-cloud-xai.png' })

  log('\n=== clear ===')
  const clear = page.locator('button', { hasText: /Clear filter|清除篩選/ }).first()
  log(`clear button: ${await clear.count()}`)
  if (await clear.count()) {
    await clear.click()
    await settle()
    log(`rows after clear: ${(await modelCol()).length} (unfiltered was ${before.length})`)
    log(`url: ${page.url()}`)
  }
}

log('\n=== /speed/efficiency — legend click ===')
await page.goto(`${BASE}#/speed/efficiency`, { waitUntil: 'networkidle' })
await settle(4000)
const legendLabels = await page.$$eval('.role-legend-label text, g[aria-roledescription="legend"] text',
  (ns) => ns.map((n) => n.textContent?.trim()).filter(Boolean))
log(`legend labels: ${JSON.stringify([...new Set(legendLabels)])}`)
const xai = page.locator('text=xAI').last()
if (await xai.count()) {
  await xai.click({ force: true })
  await settle()
  log(`url after legend click: ${page.url()}`)
  log(`banner: ${await page.locator('text=/Vendor family|廠商家族/').count()}`)
  await page.screenshot({ path: '/home/cookys/shot-eff-xai.png' })
} else {
  log('xAI legend not found')
}

log(`\nJS errors: ${errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none'}`)
await browser.close()
