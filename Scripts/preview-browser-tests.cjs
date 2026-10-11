// Run after the core harness writes test-results/preview-after.html.
// Requires Playwright on Node's module path and a local Microsoft Edge installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'test-results/preview-after.html'), 'utf8');
const baselinePath = path.join(root, 'test-results/preview-before.html');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let imageRequests = 0, releaseImage;
    const pendingImage = new Promise(resolve => { releaseImage = resolve; });
    await page.route('https://images.example.com/slow.png', async route => {
      imageRequests++; await pendingImage;
      await route.fulfill({ status: 200, contentType: 'image/png', body: png });
    });
    await page.route('https://images.example.com/broken.png', route => route.fulfill({ status: 404, body: '' }));
    await page.evaluate(() => {
      window.messages = []; window.chrome ??= {};
      window.chrome.webview = { postMessage: message => window.messages.push(message), addEventListener: (_, handler) => { window.receiveNative = handler; } };
    });
    const startup = performance.now();
    await page.setContent(shell, { waitUntil: 'load' });
    const shellMs = performance.now() - startup;
    let version = 0;
    const update = async (body, extra = {}) => {
      const payload = { body, css: '', resetScroll: false, version: ++version, ...extra };
      await page.evaluate(async payload => { await window.receiveNative({ data: { id: 'update-' + payload.version, action: 'update', payload } }); }, payload);
      return payload.version;
    };
    const markup = '<h1>快速预览</h1><p>正文无需等待图片。</p><p><img src="https://images.example.com/slow.png" alt="slow"></p>';
    const started = performance.now(); await update(markup);
    const bodyMs = performance.now() - started;
    assert.ok(await page.locator('h1').isVisible());
    await page.waitForFunction(() => window.messages.some(m => m.type === 'resources' && m.pendingImages === 1));
    assert.ok(bodyMs < 1000, 'Text should be ready without awaiting the slow image');
    console.log('PASS text renders while remote image is still pending');
    await page.evaluate(() => { window.savedImage = document.querySelector('img'); window.shellToken = {}; });
    await update(markup.replace('正文无需等待图片。', '输入更新，不重新加载图片。'));
    await update('<p>插入一个段落</p>' + markup.replace('正文无需等待图片。', '输入更新，不重新加载图片。'), { css: 'h1 { color: rgb(1, 2, 3); }' });
    assert.equal(await page.evaluate(() => window.savedImage === document.querySelector('img')), true);
    assert.equal(imageRequests, 1);
    assert.equal(await page.locator('h1').evaluate(node => getComputedStyle(node).color), 'rgb(1, 2, 3)');
    console.log('PASS text edits, block insertion and theme changes retain the image node and one request');
    releaseImage();
    await page.waitForFunction(() => window.messages.some(m => m.type === 'resources' && m.version === 3 && m.pendingImages === 0 && m.failedImages === 0));
    console.log('PASS resource progress completes when image finishes');
    const longBody = '<h1>长文章</h1>' + '<p>正文行</p>'.repeat(70);
    await update(longBody, { resetScroll: true });
    await page.evaluate(() => scrollTo(0, 400));
    await update(longBody.replace('长文章', '修改标题'));
    assert.equal(await page.evaluate(() => scrollY), 400);
    await update(longBody, { resetScroll: true, baseHref: 'https://wxtyper-other.local/' });
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.evaluate(() => document.baseURI), 'https://wxtyper-other.local/');
    console.log('PASS edits preserve scroll while opening another document resets it and changes image base');
    await update('<p><img src="https://images.example.com/broken.png"></p>', { resetScroll: true });
    await page.waitForFunction(() => window.messages.some(m => m.type === 'resources' && m.failedImages === 1 && m.pendingImages === 0));
    console.log('PASS failed images stop loading and report an error');
    await update('<h1>可复制</h1><p><strong>正文</strong></p>', { resetScroll: true });
    const copied = await page.evaluate(() => window.wxtyperCopyHTML());
    assert.ok(copied.includes('style=') && copied.includes('可复制'));
    console.log('PASS HTML copy still returns inlined styles after incremental updates');
    let diagramRequests = 0;
    await page.route('https://cdn.jsdelivr.net/**', async route => {
      diagramRequests++;
      await route.fulfill({ contentType: 'application/javascript', body: "window.mermaid={initialize(){},async run({nodes}){window.diagramRuns=(window.diagramRuns||0)+nodes.length;for(const node of nodes){node.innerHTML='<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"40\"><text x=\"10\" y=\"20\">diagram</text></svg>';}}};" });
    });
    const diagram = '<h1>图表</h1><div class="mermaid">graph TD; A--&gt;B;</div>';
    await update(diagram, { resetScroll: true });
    await page.evaluate(() => window.__wxtyperMermaidReady);
    await page.evaluate(() => { window.savedDiagram = document.querySelector('.mermaid svg'); });
    await update(diagram.replace('图表</h1>', '图表标题更新</h1>'));
    await page.evaluate(() => window.__wxtyperMermaidReady);
    assert.equal(diagramRequests, 1);
    assert.equal(await page.evaluate(() => window.diagramRuns), 1);
    assert.equal(await page.evaluate(() => window.savedDiagram === document.querySelector('.mermaid svg')), true);
    const diagrams = await page.evaluate(() => window.wxtyperExportMermaid());
    assert.equal(Buffer.from(diagrams[0], 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    console.log('PASS unchanged diagrams are reused; PNG export bridge remains functional');
    assert.deepEqual(errors, []);

    let baselineMs = null;
    if (fs.existsSync(baselinePath)) {
      const oldPage = await browser.newPage();
      await oldPage.route('https://images.example.com/slow.png', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.fulfill({ contentType: 'image/png', body: png });
      });
      const began = performance.now();
      await oldPage.setContent(fs.readFileSync(baselinePath, 'utf8'), { waitUntil: 'load' });
      baselineMs = Math.round(performance.now() - began); await oldPage.close();
    }
    const result = { shellMs: Math.round(shellMs), bodyUpdateMs: Math.round(bodyMs), baselineNavigationWith2sImageMs: baselineMs, imageRequestsDuringEdits: imageRequests };
    fs.writeFileSync(path.join(root, 'test-results/preview-performance.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
