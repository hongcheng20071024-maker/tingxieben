/* Browser regression test for the actual v2 build. Speech and pointer devices are simulated. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const runtime = process.env.CODEX_NODE_MODULES || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
function dependency(name) { try { return require(name); } catch (_) { return require(path.join(runtime, name)); } }
const { chromium, webkit } = dependency('playwright');
const sharp = dependency('sharp');
const root = path.resolve(__dirname, '..');
const output = process.env.TEST_OUTPUT ? path.resolve(process.env.TEST_OUTPUT) : path.resolve(root, '../../outputs/tingxieben-v2-tests');
fs.mkdirSync(output, { recursive: true });
const passed = [];
function pass(name) { passed.push(name); console.log('PASS ' + name); }
const baseline = { commit:'0cedf1fd021375fe6716ebfd91da1474f196a092', files:Object.entries({
  '.gitignore':'db2eeae0808c784ec240fa861d3cefa097278172',
  '.nojekyll':'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
  'LICENSE':'e5c67bb0a370192653d6853366261ea17a78b3b4',
  'README.md':'f005e2611cca09ae7bd75511f1a91fc44e9d4eee',
  'docs/qrcode.png':'35bbfd53cf29a0a6d62087d04d75d276ab9a7332',
  'docs/词库格式.md':'7bac53fa4b51e73d2281ee05f852330be6b6a609',
  'icon-180.png':'2db8aa96a0c0a37cb6e7669a176d73a5529bd439',
  'icon-192.png':'bd2cf4965967be4e877bc3d3a637a03115e22b47',
  'icon-512.png':'d8da541ab2d80cd21b9536bfde728f1307f90019',
  'icon-maskable-512.png':'d1d127301bfce1f0d3ef134f011a887907a2acda',
  'index.html':'753a41761008f04f6e6724d36c68e7f3a29ef1c7',
  'library-backup-unit1.json':'dfdb6431e7760f6e61efa979d0d0ed178788d6c9',
  'manifest.webmanifest':'471d54f533278a7906a7d7a8443e1f387f27f1dc',
  'source/听写本.html':'c9b1a7378050614ef2331b07dc513d3cacd55f1a',
  'sw.js':'a935c4b5d2d9c178510ccea5a226412d06a7ffb1',
  'tools/build_site.py':'d7bd4f30043013aa841d5047e3584196498ccac2',
  'tools/deploy_pages.py':'f62dbb9b525b032350489bf3fe5409d96d420fcb',
  'tools/make_icons.py':'dbb9cabada72d7e44109ffd09f4b71753cf6c5cf'
}).map(([path,sha]) => ({path,sha})) };
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webmanifest':'application/manifest+json' };

async function main() {
  for (const entry of baseline.files) {
    const body = fs.readFileSync(path.join(root, entry.path));
    const blob = crypto.createHash('sha1').update(Buffer.from(`blob ${body.length}\0`)).update(body).digest('hex');
    assert.equal(blob, entry.sha, 'Original changed: ' + entry.path);
  }
  assert(!fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('data-scratchpad-script'));
  pass('All 18 original files match GitHub commit; original index has no scratchpad');
  const server = http.createServer((req, res) => {
    try {
      let relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (relative.endsWith('/')) relative += 'index.html';
      const file = path.resolve(root, '.' + relative);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const data = fs.readFileSync(file);
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    } catch (_) { res.writeHead(404).end('missing'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    const engine = process.env.TEST_ENGINE === 'webkit' ? webkit : chromium;
    browser = await engine.launch({ ...(process.env.TEST_BROWSER ? {executablePath:process.env.TEST_BROWSER} : {}), downloadsPath:output, headless:true });
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const words = JSON.parse(fs.readFileSync(path.join(root, 'library-backup-unit1.json'))).groups[0].words.slice(0, 2);
    const seed = [{ id:'browser-test-public-seed', revision:1, name:'公开测试词组', words }];
    await page.addInitScript(({ seed }) => {
      if (!localStorage.getItem('listen-write-library-v1')) localStorage.setItem('listen-write-library-v1', JSON.stringify(seed));
      window.__spoken = [];
      let speechTimer;
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:class {
        constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.voice = null; }
      }});
      const voices = [{ name:'Simulated English', lang:'en-US', voiceURI:'test-en', localService:true, default:true }, { name:'Simulated Chinese', lang:'zh-CN', voiceURI:'test-zh', localService:true, default:false }];
      Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:{
        getVoices:() => voices, speaking:false, pending:false, paused:false,
        addEventListener:() => {}, removeEventListener:() => {},
        cancel() { clearTimeout(speechTimer); this.speaking = false; },
        speak(utterance) {
          window.__spoken.push({ text:utterance.text, lang:utterance.lang, rate:utterance.rate });
          this.speaking = true;
          if (utterance.onstart) utterance.onstart({});
          speechTimer = setTimeout(() => { this.speaking = false; if (utterance.onend) utterance.onend({}); }, 25);
        }
      }});
    }, { seed });
    const pageURL = process.env.TEST_FILE === '1' ? pathToFileURL(path.join(root, 'v2/index.html')).href : base + '/v2/';
    await page.goto(pageURL);
    await page.getByRole('checkbox', { name:'选择 公开测试词组' }).waitFor();
    if (process.argv.includes('--inspect')) { console.log(await page.locator('body').innerText()); return; }
    assert.equal(await page.locator('.scratchpad-panel').count(), 0);
    await page.getByRole('checkbox', { name:'选择 公开测试词组' }).check();
    await page.getByRole('radio', { name:'纸笔听写', exact:true }).check();
    async function choose(name, option) {
      await page.getByRole('combobox', { name, exact:true }).click();
      await page.getByRole('option', { name:option, exact:true }).click();
    }
    await choose('书写间隔', '5 秒');
    await choose('每词朗读', '1 遍');
    await page.locator('.start-button').click();
    await page.locator('.scratchpad-panel canvas').waitFor();
    const canvas = page.locator('.scratchpad-panel canvas');
    const tool = action => page.locator(`.scratchpad-panel [data-action="${action}"]`);
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function ink() {
      await frame();
      return canvas.evaluate(c => {
        const rgba = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let count = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) count++;
        return { count, ratio:count/(c.width*c.height), hash:c.toDataURL(), width:c.width, height:c.height };
      });
    }
    async function realStroke(y = .3) {
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width*.15, box.y + box.height*y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width*.7, box.y + box.height*y, { steps:25 });
      await page.mouse.up();
      await frame();
    }
    async function synthetic(events) {
      await canvas.evaluate((c, events) => {
        const r = c.getBoundingClientRect();
        for (const event of events) c.dispatchEvent(new PointerEvent(event.type, { bubbles:true, cancelable:true, pointerId:7, pointerType:'pen', isPrimary:true, button:0, buttons:event.type==='pointerup'?0:1, pressure:.5, ...event, clientX:r.x+r.width*(event.x??.3), clientY:r.y+r.height*(event.y??.3) }));
      }, events);
      await frame();
    }
    async function clear(accept = true) {
      page.once('dialog', async dialog => accept ? dialog.accept() : dialog.dismiss());
      await tool('clear').click(); await frame();
    }
    await page.setViewportSize({ width:768, height:1024 });
    await frame();
    await page.getByRole('button', { name:'草稿区开始播放', exact:true }).waitFor();
    await page.getByRole('button', { name:'草稿区重听当前词', exact:true }).click();
    await page.getByRole('button', { name:'草稿区继续', exact:true }).waitFor();
    assert.equal(await page.getByRole('button', { name:'继续', exact:true }).count(), 1);
    assert.equal((await page.evaluate(() => window.__spoken.at(-1))).text, words[0].word);
    assert.match(await page.locator('.scratchpad-progress').innerText(), /第 01 \/ 2 词/);
    await page.getByRole('button', { name:'返回词库', exact:true }).click();
    await page.getByRole('button', { name:'结束并返回', exact:true }).click();
    await page.locator('.start-button').click();
    await canvas.waitFor();
    await page.getByRole('button', { name:'草稿区开始播放', exact:true }).waitFor();
    pass('Initial replay before playback updates the mirror from Start to Resume; a fresh round resets the control');
    await page.setViewportSize({ width:1024, height:768 });
    await frame();
    assert.equal((await ink()).count, 0);
    await realStroke();
    const first = await ink(); assert(first.count > 20);
    await tool('undo').click(); assert.equal((await ink()).count, 0);
    await tool('redo').click(); assert.equal((await ink()).hash, first.hash);
    pass('Real mouse stroke, undo and redo restore identical pixels');
    await clear(false); assert.equal((await ink()).hash, first.hash);
    await tool('add').click(); assert.equal((await ink()).count, 0);
    await realStroke(.6); const second = await ink();
    await clear(true); assert.equal((await ink()).count, 0);
    await tool('previous').click(); assert.equal((await ink()).hash, first.hash);
    await tool('next').click(); assert.equal((await ink()).count, 0);
    await tool('previous').click();
    pass('Multiple pages, clear cancellation and current-page-only confirmed clearing');
    await tool('eraser').click(); await realStroke(); assert.equal((await ink()).count, 0);
    await tool('undo').click(); assert.equal((await ink()).hash, first.hash);
    await tool('pen').click();
    pass('Eraser removes ink and undo restores it');
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = function(blob) { window.__exportBlob = blob; return original.call(this, blob); };
    });
    const downloadEvent = page.waitForEvent('download');
    await tool('save').click();
    const download = await downloadEvent;
    const downloadPath = path.join(output, 'scratchpad-export.png');
    let nativeDownload = true;
    try { await download.saveAs(downloadPath); }
    catch (error) {
      if (!String(error).includes('canceled')) throw error;
      nativeDownload = false;
      const encoded = await page.evaluate(() => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(window.__exportBlob);
      }));
      fs.writeFileSync(downloadPath, Buffer.from(encoded, 'base64'));
    }
    const { data: exported, info: exportInfo } = await sharp(downloadPath).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
    assert.equal(exportInfo.width, 2000); assert.equal(exportInfo.height, 1400);
    assert.deepEqual([...exported.slice(0, 4)], [255, 255, 255, 255]);
    let inkPixels = 0;
    for (let i = 0; i < exported.length; i += 4) { assert.equal(exported[i+3], 255); if (exported[i+2] > exported[i] + 60) inkPixels++; }
    assert(inkPixels > 100);
    pass('PNG export triggers download and generates 2000 × 1400 white opaque paper with preserved ink' + (nativeDownload ? '' : ' (OS download canceled; original Blob verified)'));
    const originalRatio = first.ratio;
    await page.setViewportSize({ width:768, height:1024 }); await frame();
    const rotated = await ink(); assert(rotated.count > 20); assert(Math.abs(rotated.ratio/originalRatio-1) < .4);
    assert(await canvas.evaluate(c => getComputedStyle(c).touchAction === 'none'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path:path.join(output, 'ipad-portrait.png'), fullPage:true });
    await page.setViewportSize({ width:1024, height:768 }); await frame();
    assert((await ink()).count > 20);
    await page.screenshot({ path:path.join(output, 'ipad-landscape.png'), fullPage:true });
    pass('iPad portrait/landscape resize preserves ink and avoids horizontal overflow');
    await page.setViewportSize({ width:390, height:844 }); await frame();
    assert((await ink()).count > 20);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path:path.join(output, 'iphone-portrait.png'), fullPage:true });
    await page.setViewportSize({ width:1440, height:900 }); await frame();
    assert((await ink()).count > 20);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width:1024, height:768 }); await frame();
    pass('Phone and desktop widths preserve ink and avoid horizontal overflow');
    await clear(true);
    await synthetic([{ type:'pointerdown', x:.2, y:.2 }, { type:'pointermove', x:.7, y:.2 }, { type:'pointercancel' }]);
    const cancelled = await ink(); assert(cancelled.count > 20);
    await synthetic([{ type:'pointerdown', pointerId:8, x:.2, y:.4 }, { type:'pointermove', pointerId:8, x:.7, y:.4 }, { type:'pointerup', pointerId:8, x:.7, y:.4 }]);
    assert((await ink()).count > cancelled.count);
    await tool('undo').click(); assert.equal((await ink()).hash, cancelled.hash);
    pass('Simulated pen pointercancel completes stroke and permits the next stroke');
    await synthetic([{ type:'pointerdown', pointerId:10, x:.2, y:.7 }, { type:'pointermove', pointerId:10, x:.7, y:.7 }]);
    await tool('redo').click();
    await synthetic([{ type:'pointerup', pointerId:10, x:.7, y:.7 }]);
    assert((await ink()).count > cancelled.count);
    await tool('undo').click(); assert.equal((await ink()).hash, cancelled.hash);
    pass('Simulated second-input redo during an active stroke cannot insert an undefined stroke');
    await clear(true);
    await page.locator('.scratchpad-pen-only input').check();
    await synthetic([{ type:'pointerdown', pointerType:'touch', x:.2, y:.2 }, { type:'pointermove', pointerType:'touch', x:.7, y:.2 }, { type:'pointerup', pointerType:'touch', x:.7, y:.2 }]);
    assert.equal((await ink()).count, 0);
    await synthetic([{ type:'pointerdown', x:.2, y:.2 }, { type:'pointermove', x:.7, y:.2 }, { type:'pointerup', x:.7, y:.2 }]);
    assert((await ink()).count > 20);
    await page.locator('.scratchpad-pen-only input').uncheck();
    await clear(true);
    await synthetic([{ type:'pointerdown', pointerType:'touch', x:.2, y:.3 }, { type:'pointermove', pointerType:'touch', x:.5, y:.3 }, { type:'pointerdown', pointerId:9, pointerType:'touch', isPrimary:false, x:.2, y:.6 }, { type:'pointermove', pointerId:9, pointerType:'touch', isPrimary:false, x:.7, y:.6 }, { type:'pointerup', pointerId:9, pointerType:'touch', isPrimary:false }, { type:'pointerup', pointerType:'touch', x:.7, y:.3 }]);
    assert((await ink()).count > 20);
    await tool('undo').click(); assert.equal((await ink()).count, 0);
    pass('Simulated pen-only palm protection and secondary-touch rejection');
    await page.setViewportSize({ width:768, height:1024 }); await frame();
    await realStroke();
    const beforeFold = await ink();
    await tool('fold').click(); assert.equal(await canvas.isVisible(), false);
    await tool('fold').click(); assert.equal((await ink()).hash, beforeFold.hash);
    assert.match(await page.locator('.scratchpad-progress').innerText(), /第 01 \/ 2 词/);
    await page.getByRole('button', { name:'草稿区开始播放', exact:true }).click();
    await page.getByRole('button', { name:'草稿区暂停', exact:true }).waitFor();
    assert.equal(await page.getByRole('button', { name:'暂停', exact:true }).count(), 1);
    await page.getByRole('button', { name:'草稿区暂停', exact:true }).click();
    await page.getByRole('button', { name:'草稿区继续', exact:true }).waitFor();
    assert.equal((await ink()).hash, beforeFold.hash);
    const spokenBeforeReplay = await page.evaluate(() => window.__spoken.length);
    await page.getByRole('button', { name:'草稿区重听当前词', exact:true }).click();
    assert.equal(await page.evaluate(() => window.__spoken.length), spokenBeforeReplay + 1);
    assert.equal((await page.evaluate(() => window.__spoken.at(-1))).text, words[0].word);
    assert.equal(await page.getByRole('button', { name:'草稿区继续', exact:true }).count(), 1);
    await page.getByRole('button', { name:'草稿区继续', exact:true }).click();
    await page.getByRole('button', { name:'暂停', exact:true }).click();
    await page.getByRole('button', { name:'草稿区继续', exact:true }).waitFor();
    assert.equal((await ink()).hash, beforeFold.hash);
    pass('Portrait scratchpad playback controls start, pause, resume and replay the original practice; original controls mirror back');
    await page.getByRole('button', { name:'返回词库', exact:true }).click();
    await page.getByRole('button', { name:'继续练习', exact:true }).click();
    assert.equal((await ink()).hash, beforeFold.hash);
    pass('Fold/unfold, paper pause/replay and cancelled exit retain scratchpad');
    await page.getByRole('button', { name:'继续', exact:true }).click();
    await page.waitForFunction(() => document.querySelector('.progress-label strong')?.textContent === '02', null, { timeout:10000 });
    assert.equal((await ink()).hash, beforeFold.hash);
    assert.match(await page.locator('.scratchpad-progress').innerText(), /第 02 \/ 2 词/);
    await page.getByRole('heading', { name:'本轮听写完成', exact:true }).waitFor({ timeout:10000 });
    assert.equal((await ink()).hash, beforeFold.hash);
    assert.equal(await page.locator('.scratchpad-panel').count(), 1);
    assert.equal(await page.locator('.result-row').count(), 2);
    assert.equal(await tool('playback').isDisabled(), true);
    assert.equal(await tool('relisten').isDisabled(), true);
    assert.equal(await tool('playback').getAttribute('aria-label'), '草稿区本轮完成');
    assert.equal(await page.locator('.scratchpad-progress').innerText(), '本轮完成，可核对答案');
    pass('Scratchpad progress follows next word; playback and replay disable after results');
    pass('Actual paper timer advances words; result view retains the same scratchpad');
    await page.getByRole('button', { name:'再练整组', exact:true }).click();
    assert.equal((await ink()).count, 0);
    assert.equal(await page.locator('.scratchpad-page-number').innerText(), '第 1 / 1 页');
    await realStroke();
    await page.getByRole('button', { name:'返回词库', exact:true }).click();
    await page.getByRole('button', { name:'结束并返回', exact:true }).click();
    assert.equal(await page.locator('.scratchpad-panel').count(), 0);
    await page.getByRole('radio', { name:'键盘听写', exact:true }).check();
    await choose('朗读内容', '中文释义 → 写英文');
    await page.locator('.start-button').click();
    assert.equal(await page.locator('.scratchpad-panel').count(), 0);
    await page.getByRole('button', { name:'播放单词', exact:true }).click();
    assert.equal((await page.evaluate(() => window.__spoken.at(-1))).text, words[0].meaning);
    await page.locator('#answer').fill('wrong-answer');
    await page.locator('.answer-submit').click();
    assert.equal(await page.locator('.feedback.incorrect strong').innerText(), words[0].word);
    await page.getByRole('button', { name:'听英文发音', exact:true }).click();
    assert.equal((await page.evaluate(() => window.__spoken.at(-1))).text, words[0].word);
    assert.equal((await page.evaluate(() => window.__spoken.at(-1))).lang, 'en-US');
    await page.getByRole('button', { name:'慢速英文', exact:true }).click();
    assert.equal((await page.evaluate(() => window.__spoken.at(-1))).rate, .65);
    await page.locator('.dictionary-audio summary').click();
    assert.equal(await page.getByRole('button', { name:'加载词典录音', exact:true }).count(), 1);
    await page.getByRole('button', { name:'下一个单词', exact:true }).click();
    await page.locator('#answer').fill(words[1].word.toUpperCase());
    await page.locator('.answer-submit').click();
    assert.equal(await page.locator('.feedback.correct').count(), 1);
    await page.getByRole('button', { name:'查看本轮结果', exact:true }).click();
    assert.equal(await page.getByRole('heading', { name:'1 / 2 词拼写正确', exact:true }).count(), 1);
    assert.equal(await page.locator('.scratchpad-panel').count(), 0);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('listen-write-library-v1'))), seed);
    pass('New paper round resets; confirmed exit removes canvas; keyboard Chinese cue, answer audio and grading work without altering the library');
    assert.deepEqual(errors, []);
    pass('No browser JavaScript exceptions throughout the regression');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ browser:process.env.TEST_ENGINE || 'chromium', executable:process.env.TEST_BROWSER || null, pageURL, commit:baseline.commit, passed, nativeDownload, actualIPad:false, serviceWorkerEndToEnd:false, simulated:['speech synthesis', 'pen and touch PointerEvents'], screenshotPaths:['ipad-portrait.png','ipad-landscape.png','iphone-portrait.png'] }, null, 2));
    console.log(JSON.stringify({ passed:passed.length, output }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
