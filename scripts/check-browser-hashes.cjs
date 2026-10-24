/*
 * Cross-engine reproducibility check: every template is simulated in Chromium (the built app, through its
 * UI) and the recording fingerprint shown in Settings is compared with the one computed in Node
 * (tests/hashes.test.ts → .cache/node-hashes.json).
 * Usage: npx vite build && npx vite preview --port 5179 &; npx vitest run tests/hashes.test.ts; node scripts/check-browser-hashes.cjs
 */
const { chromium } = require('playwright')
const fs = require('fs')
const expected = JSON.parse(fs.readFileSync('.cache/node-hashes.json', 'utf8'))
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })
  page.on('dialog', d => d.accept())
  await page.goto(process.env.VERITY_URL || 'http://localhost:5179/')
  await page.waitForTimeout(1500)
  let failed = 0
  for (const [name, hash] of Object.entries(expected)) {
    await page.click('text=模板')
    await page.click(`.titem:has-text("${name}")`)
    await page.click('text=创建场景')
    await page.waitForFunction(() => !document.querySelector('.viewport .badge.info') && !document.querySelector('.viewport .badge.warn'))
    await page.waitForTimeout(600)
    await page.click('.right .tabs button:has-text("设置")')
    const got = await page.$eval('.fp', el => el.getAttribute('title'))
    const ok = got === hash
    if (!ok) failed++
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${got}${ok ? '' : ' expected ' + hash}`)
  }
  console.log(`${Object.keys(expected).length - failed}/${Object.keys(expected).length} identical in ${await browser.version()}`)
  await browser.close()
  process.exit(failed ? 1 : 0)
})()
