const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.ROUDY_TEST_PLAYWRIGHT || "playwright");

const projectRoot = path.resolve(__dirname, "..");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png"
};
const widths = [360, 390, 412, 430];
const scales = [100, 120, 140];
const browserExecutable = [
  process.env.BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((candidate) => candidate && fs.existsSync(candidate));

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(projectRoot, relativePath);
  if (!filePath.startsWith(projectRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
});

function isInside(rect, width) {
  return rect.left >= -0.5 && rect.right <= width + 0.5 && rect.width > 0;
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
  const stableSizes = new Map();

  try {
    for (const width of widths) {
      for (const scale of scales) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
        await context.addInitScript((selectedScale) => {
          localStorage.setItem("sc_settings_v3", JSON.stringify({
            language: "pt-BR",
            highContrast: false,
            colorBlind: false,
            scale: selectedScale
          }));
        }, scale);
        const page = await context.newPage();
        await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
        await page.route("**/api/auth/config", (route) => route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ enabled: false, provider: "local", supabaseUrl: "", supabaseAnonKey: "" })
        }));
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

        const metrics = await page.evaluate(() => {
          const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
          const tabs = [...document.querySelectorAll(".tab")].map((element) => ({
            rect: element.getBoundingClientRect().toJSON(),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
          }));
          const youtubeButton = document.querySelector("#youtube-search-btn");
          const titleStyle = getComputedStyle(document.querySelector(".music-title"));
          const secondaryStyle = getComputedStyle(document.querySelector(".music-sub"));
          return {
            scale: document.documentElement.dataset.uiScale,
            inlineZoom: document.body.style.zoom,
            viewportWidth: innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            app: rect("#app"),
            header: rect(".topbar"),
            logo: rect(".topbar-icon"),
            account: rect("#app-account-btn"),
            tabs,
            youtubeBar: rect(".youtube-search-bar"),
            youtubeInput: rect("#youtube-input"),
            youtubeButton: {
              rect: youtubeButton.getBoundingClientRect().toJSON(),
              clientWidth: youtubeButton.clientWidth,
              scrollWidth: youtubeButton.scrollWidth
            },
            playlistSearch: rect("#search-music"),
            aiButton: rect(".ai-generate-action"),
            musicCard: rect(".music-item"),
            musicAvatar: rect(".music-avatar"),
            fab: rect(".fab"),
            titleFont: Number.parseFloat(titleStyle.fontSize),
            secondaryFont: Number.parseFloat(secondaryStyle.fontSize)
          };
        });

        assert.equal(metrics.scale, String(scale), `${width}px/${scale}%: nível de acessibilidade incorreto`);
        assert.equal(metrics.inlineZoom, "", `${width}px/${scale}%: zoom global não deve ser aplicado`);
        assert.ok(metrics.documentScrollWidth <= width, `${width}px/${scale}%: scroll horizontal no documento`);
        assert.ok(metrics.bodyScrollWidth <= width, `${width}px/${scale}%: scroll horizontal no body`);
        for (const [name, rect] of Object.entries({
          app: metrics.app,
          header: metrics.header,
          account: metrics.account,
          youtubeBar: metrics.youtubeBar,
          youtubeInput: metrics.youtubeInput,
          youtubeButton: metrics.youtubeButton.rect,
          playlistSearch: metrics.playlistSearch,
          aiButton: metrics.aiButton,
          musicCard: metrics.musicCard,
          fab: metrics.fab
        })) assert.ok(isInside(rect, width), `${width}px/${scale}%: ${name} saiu da viewport`);
        assert.equal(metrics.tabs.length, 3, `${width}px/${scale}%: navegação deve manter três itens`);
        metrics.tabs.forEach((tab, index) => {
          assert.ok(isInside(tab.rect, width), `${width}px/${scale}%: aba ${index + 1} fora da viewport`);
          assert.ok(tab.scrollWidth <= tab.clientWidth + 1, `${width}px/${scale}%: texto da aba ${index + 1} cortado`);
          if (index) assert.ok(tab.rect.left >= metrics.tabs[index - 1].rect.right - 0.5, `${width}px/${scale}%: abas sobrepostas`);
        });
        assert.ok(metrics.youtubeInput.width > metrics.youtubeButton.rect.width, `${width}px/${scale}%: botão Pesquisar esmagou o campo`);
        assert.ok(metrics.youtubeButton.scrollWidth <= metrics.youtubeButton.clientWidth + 1, `${width}px/${scale}%: texto Pesquisar cortado`);
        assert.ok(metrics.musicCard.height <= 82, `${width}px/${scale}%: card ficou alto demais (${metrics.musicCard.height}px)`);
        assert.ok(metrics.secondaryFont < metrics.titleFont, `${width}px/${scale}%: texto secundário perdeu hierarquia`);
        assert.equal(errors.length, 0, `${width}px/${scale}%: erros: ${errors.join(" | ")}`);

        const key = `${width}`;
        if (scale === 100) stableSizes.set(key, { logo: metrics.logo, avatar: metrics.musicAvatar, fab: metrics.fab, titleFont: metrics.titleFont });
        if (scale === 140) {
          const baseline = stableSizes.get(key);
          assert.equal(metrics.logo.width, baseline.logo.width, `${width}px: logo não deve crescer com o texto`);
          assert.equal(metrics.musicAvatar.width, baseline.avatar.width, `${width}px: ícone do card não deve crescer com o texto`);
          assert.equal(metrics.fab.width, baseline.fab.width, `${width}px: FAB não deve crescer com o texto`);
          assert.ok(metrics.titleFont > baseline.titleFont, `${width}px: título deve ganhar legibilidade no nível máximo`);
        }
        await context.close();
      }
    }
    console.log("accessibility-scale-ui.test.js: OK (360/390/412/430px em 100/120/140%)");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
