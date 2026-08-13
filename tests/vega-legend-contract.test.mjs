import assert from 'node:assert/strict'
import test from 'node:test'
import * as vl from 'vega-lite'
import * as vega from 'vega'

/**
 * SpeedEfficiency routes a Vega click to either the row drilldown or the vendor-family
 * filter by looking at the clicked item's datum: bars carry `key`, colour-legend entries
 * carry `value`. That discrimination is an assumption about Vega's scenegraph, and a
 * Vega/Vega-Lite upgrade could change it — silently turning the legend into a dead
 * affordance. Vega builds a scenegraph in Node with renderer 'none', so this is checkable
 * without a browser.
 */
const spec = {
  data: {
    values: [
      { label: 'grok-4.6', perHour: 12, vendor: 'xAI', key: 'k1' },
      { label: 'kimi-k2.6', perHour: 7, vendor: 'Moonshot', key: 'k2' },
    ],
  },
  mark: 'bar',
  encoding: {
    y: { field: 'label', type: 'nominal', sort: '-x' },
    x: { field: 'perHour', type: 'quantitative' },
    color: {
      field: 'vendor',
      type: 'nominal',
      legend: { orient: 'bottom', direction: 'horizontal', columns: 5, symbolSize: 70 },
    },
  },
}

async function scenegraph() {
  const view = new vega.View(vega.parse(vl.compile(spec).spec), { renderer: 'none' })
  await view.runAsync()
  const out = { legend: [], bars: [] }
  const seen = new Set()
  // Descend only through `items` — `item.mark` back-references the parent and loops.
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    if (Array.isArray(node)) return node.forEach(walk)
    const role = node.role ?? node.mark?.role
    if (node.datum !== undefined) {
      if (role === 'legend-label' || role === 'legend-symbol') out.legend.push(node.datum)
      else if (node.datum && node.datum.key) out.bars.push(node.datum)
    }
    walk(node.items)
  }
  walk(view.scenegraph().root)
  return out
}

test('colour-legend entries expose datum.value (the vendor) and bars expose datum.key', async () => {
  const { legend, bars } = await scenegraph()

  assert.ok(legend.length > 0, 'no legend items in the scenegraph')
  const values = [...new Set(legend.map((d) => d.value))].sort()
  assert.deepEqual(values, ['Moonshot', 'xAI'])

  assert.ok(bars.length > 0, 'no bar items carrying datum.key')
  assert.ok(bars.every((d) => typeof d.key === 'string'))
})

test('the two are distinguishable — a legend datum has no key, a bar datum has no value', async () => {
  // This is what makes one click handler safe for both: without it, clicking a bar could
  // be misread as a vendor and silently filter the board out from under the user.
  const { legend, bars } = await scenegraph()
  assert.ok(legend.every((d) => d.key === undefined), 'legend datum must not carry key')
  assert.ok(bars.every((d) => d.value === undefined), 'bar datum must not carry value')
})
