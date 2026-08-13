// Why did the efficiency legend click not filter? Distinguish "my test clicked the wrong
// element" from "Vega never delivers the event to the handler".
import { chromium } from 'playwright'

const BASE = 'https://cookys.github.io/model-dyno/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
await page.goto(`${BASE}#/speed/efficiency`, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)

// What does the legend actually look like in the DOM?
const legendInfo = await page.evaluate(() => {
  const out = { roleLabel: 0, roleSymbol: 0, texts: [], xaiBoxes: [] }
  document.querySelectorAll('g.role-legend-label').forEach(() => out.roleLabel++)
  document.querySelectorAll('g.role-legend-symbol').forEach(() => out.roleSymbol++)
  document.querySelectorAll('.role-legend-label text').forEach((n) => out.texts.push(n.textContent))
  document.querySelectorAll('text').forEach((n) => {
    if (n.textContent?.trim() === 'xAI') {
      const r = n.getBoundingClientRect()
      out.xaiBoxes.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                          parent: n.parentElement?.getAttribute('class') || n.parentElement?.tagName })
    }
  })
  return out
})
console.log('legend groups:', legendInfo.roleLabel, 'symbols:', legendInfo.roleSymbol)
console.log('legend texts:', JSON.stringify(legendInfo.texts))
console.log('every "xAI" text node on the page:', JSON.stringify(legendInfo.xaiBoxes, null, 1))

// The legend sits far below the fold (y≈1619 in a 1100px viewport), so a raw coordinate
// click lands nowhere. Scroll it into view first, then click the real element.
const xaiText = page.locator('.role-legend-label text', { hasText: /^xAI$/ }).first()
console.log('\nxAI legend text nodes:', await xaiText.count())
if (await xaiText.count()) {
  await xaiText.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const box = await xaiText.boundingBox()
  console.log('after scroll, box =', JSON.stringify(box))
  await xaiText.click({ force: true })
  await page.waitForTimeout(2500)
  console.log('url after label click :', page.url())
  console.log('banner:', await page.locator('text=/Vendor family|廠商家族/').count())

  if (!page.url().includes('publisher=')) {
    // Try the colour swatch instead of the text — different scenegraph item, same datum.
    const sym = page.locator('g.role-legend-symbol path').nth(18)
    console.log('\ntrying the swatch instead; symbols:', await page.locator('g.role-legend-symbol path').count())
    await sym.scrollIntoViewIfNeeded()
    await sym.click({ force: true })
    await page.waitForTimeout(2500)
    console.log('url after symbol click:', page.url())
    console.log('banner:', await page.locator('text=/Vendor family|廠商家族/').count())
  }
}

// Does the Vega view deliver ANY click to a legend item? Probe the scenegraph hit-test.
const probe = await page.evaluate(() => {
  // Vega attaches the view to the container element as __vega_view__ in some setups; if
  // not reachable, report that rather than guessing.
  const el = document.querySelector('.vega-embed') || document.querySelector('svg')?.parentElement
  return { hasVegaEmbed: !!document.querySelector('.vega-embed'), tag: el?.tagName, cls: el?.className?.toString?.().slice(0, 80) }
})
console.log('\nvega container:', JSON.stringify(probe))
await page.screenshot({ path: '/home/cookys/shot-legend-diag.png' })
await browser.close()
