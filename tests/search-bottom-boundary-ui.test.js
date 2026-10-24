const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// Exercise the actual production layout rules without authentication/network fixtures.
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const searchCss = fs.readFileSync(path.join(root, 'css/search-menu.css'), 'utf8');
const tabsCss = html.match(/\.tab-bar,html\[data-ui-scale\] \.tab-bar\{[^}]+\}/)[0];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
      for (const safeBottom of [0, 34]) {
        const page = await browser.newPage({ viewport });
        // Desktop engines report zero safe-area inset; substitute it to test notch geometry too.
        const css = (tabsCss + searchCss).replaceAll('env(safe-area-inset-bottom)', `${safeBottom}px`);
        await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}#underlying{position:fixed;inset:0;background:red}${css}</style>
          <button id="underlying">Conteúdo da tela anterior</button>
          <section class="roudy-search is-open"><header class="roudy-search-header">Buscar</header><div class="roudy-search-scroll"><button id="last-result" style="display:block;margin-top:1200px">Último resultado</button></div></section>
          <nav class="tab-bar" id="primary-tabs"><button id="home">Home</button></nav>`);
        await page.waitForTimeout(250);
        const geometry = await page.evaluate(() => {
          const search = document.querySelector('.roudy-search').getBoundingClientRect();
          const nav = document.querySelector('.tab-bar').getBoundingClientRect();
          const x = innerWidth / 2, y = nav.top - 1;
          return { gap: nav.top - search.bottom, leaks: document.elementFromPoint(x, y)?.id === 'underlying' };
        });
        assert.ok(Math.abs(geometry.gap) < 0.5, `Search/nav gap: ${JSON.stringify({ viewport, safeBottom, ...geometry })}`);
        assert.equal(geometry.leaks, false, 'Touches above navigation must not reach the previous screen');
        await page.locator('.roudy-search-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
        await page.locator('#last-result').click();
        await page.locator('#home').click();
        await page.close();
      }
    }
    console.log('search-bottom-boundary-ui.test.js: OK (8 viewport/safe-area combinations)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
