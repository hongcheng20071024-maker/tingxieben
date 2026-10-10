/* Actual v3 browser regression. Speech and IME events are simulated; assertions use rendered controls and real form submission. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const modules = process.env.CODEX_NODE_MODULES || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
function dependency(name) { try { return require(name); } catch (_) { return require(path.join(modules, name)); } }
const { chromium, webkit } = dependency('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.TEST_OUTPUT ? path.resolve(process.env.TEST_OUTPUT) : path.resolve(root, '../../outputs/tingxieben-v3-tests');
fs.mkdirSync(output, { recursive:true });
const passed = [], screenshots = [], errors = [];
function pass(name) { passed.push(name); console.log('PASS ' + name); }
const words = [{ word:'benefit', meaning:'益处；使受益' }, { word:'take part in', meaning:'参加' }, { word:"can't", meaning:'不能' }];
const seed = [{ id:'browser-test-v3-rewrite', revision:1, name:'三版重写测试', words }];
const preferenceKey = 'listen-write-rewrite-wrong-v3';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };

async function main() {
  const server = http.createServer((req,res) => {
    try {
      let relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (relative.endsWith('/')) relative += 'index.html';
      const file = path.resolve(root, '.' + relative);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404).end('missing'); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const pageURL = process.env.TEST_FILE === '1' ? pathToFileURL(path.join(root,'v3/index.html')).href : 'http://127.0.0.1:' + server.address().port + '/v3/';
  let browser, page;
  const report = () => ({ browser:process.env.TEST_ENGINE || 'chromium', pageURL, passed, errors, screenshots, actualIPad:false, serviceWorkerEndToEnd:false, simulated:['speech synthesis','IME composition KeyboardEvent'], success:!process.exitCode });
  try {
    const engine = process.env.TEST_ENGINE === 'webkit' ? webkit : chromium;
    browser = await engine.launch({ ...(process.env.TEST_BROWSER ? { executablePath:process.env.TEST_BROWSER } : {}), headless:true });
    const context = await browser.newContext({ viewport:{ width:1440,height:900 } });
    page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(({ seed }) => {
      if (!localStorage.getItem('listen-write-library-v1')) localStorage.setItem('listen-write-library-v1',JSON.stringify(seed));
      window.__spoken = [];
      let speechTimer;
      Object.defineProperty(window,'SpeechSynthesisUtterance',{ configurable:true,value:class { constructor(text) { this.text=text; this.lang=''; this.rate=1; this.voice=null; } } });
      const voices = [{ name:'Simulated English',lang:'en-US',voiceURI:'test-en',localService:true,default:true },{ name:'Simulated Chinese',lang:'zh-CN',voiceURI:'test-zh',localService:true,default:false }];
      Object.defineProperty(window,'speechSynthesis',{ configurable:true,value:{
        getVoices:()=>voices, speaking:false,pending:false,paused:false,
        addEventListener:()=>{},removeEventListener:()=>{},
        cancel() { clearTimeout(speechTimer); this.speaking=false; },
        speak(u) { window.__spoken.push({ text:u.text,lang:u.lang,rate:u.rate }); this.speaking=true; if(u.onstart)u.onstart({}); speechTimer=setTimeout(()=>{ this.speaking=false; if(u.onend)u.onend({}); },25); }
      } });
    },{ seed });
    await page.goto(pageURL);
    const option = () => page.getByRole('checkbox',{ name:'答错后再写一遍',exact:true });
    const next = () => page.getByRole('button',{ name:'下一个单词',exact:true });
    const results = () => page.getByRole('button',{ name:'查看本轮结果',exact:true });
    const confirm = () => page.getByRole('button',{ name:'确认重写',exact:true });
    const original = () => page.locator('#answer');
    const rewrite = () => page.getByRole('textbox',{ name:'再写一次英文拼写',exact:true });
    const frame = () => page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    async function choose(name,value) { await page.getByRole('combobox',{ name,exact:true }).click(); await page.getByRole('option',{ name:value,exact:true }).click(); }
    async function selectGroup() { await page.getByRole('checkbox',{ name:'选择 三版重写测试',exact:true }).check(); }
    async function start(mode='键盘听写') { await selectGroup(); await page.getByRole('radio',{ name:mode,exact:true }).check(); await page.locator('.start-button').click(); }
    async function wrong(answer='benifit') { await original().fill(answer); await page.locator('.answer-submit').click(); await rewrite().waitFor(); }
    async function submitRewrite(answer,enter=false) { await rewrite().fill(answer); if(enter)await rewrite().press('Enter'); else await confirm().click(); }
    async function exitRound(cancel=false) { await page.getByRole('button',{ name:'返回词库',exact:true }).click(); await page.getByRole('button',{ name:cancel?'继续练习':'结束并返回',exact:true }).click(); }
    async function ensureProgress(number) { await page.waitForFunction(n=>document.querySelector('.progress-label strong')?.textContent===n,number); }
    async function screenshot(name,viewport) {
      await page.setViewportSize(viewport); await frame();
      const geometry = await page.evaluate(()=>({ scroll:document.documentElement.scrollWidth,width:innerWidth }));
      assert(geometry.scroll<=geometry.width+1,`${name}: horizontal overflow ${geometry.scroll} > ${geometry.width}`);
      const box = await rewrite().boundingBox();
      assert(box && box.width>120 && box.x>=0 && box.x+box.width<=viewport.width+1,`${name}: rewrite input outside viewport`);
      const file = path.join(output,name); await page.screenshot({ path:file,fullPage:true }); screenshots.push(file);
    }
    await option().waitFor(); assert.equal(await option().isChecked(),true);
    assert.equal(await option().evaluate(e=>e.tagName),'INPUT');
    await option().uncheck(); assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),preferenceKey),false);
    await option().check(); assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),preferenceKey),true);
    pass('Home has a native opt-in checkbox, enabled by default, with independent persisted boolean preference');
    await start();
    assert.equal(await rewrite().count(),0); assert.equal(await page.locator('.scratchpad-panel').count(),0);
    await original().fill('benifit'); await original().press('Enter'); await rewrite().waitFor();
    await page.waitForFunction(()=>document.activeElement?.id==='rewrite-answer');
    assert.equal(await original().isDisabled(),true); assert.equal(await original().inputValue(),'benifit');
    assert.equal(await page.locator('.feedback.incorrect strong').innerText(),'benefit');
    assert.match(await page.locator('.feedback.incorrect').innerText(),/你的答案：benifit/);
    assert.equal(await confirm().isDisabled(),true); assert.equal(await next().isDisabled(),true);
    assert.equal(await rewrite().getAttribute('spellcheck'),'false');
    assert.equal(await rewrite().getAttribute('autocapitalize'),'none');
    await rewrite().press('Enter'); assert.equal(await next().isDisabled(),true); await ensureProgress('01');
    pass('Incorrect first answer is preserved and disabled; blank rewrite cannot submit or advance');
    await submitRewrite('benefitt');
    await page.getByText('还没写对，请对照正确拼写再试一次。',{ exact:true }).waitFor();
    assert.equal(await next().isDisabled(),true); await ensureProgress('01');
    assert.match(await page.locator('.progress-label').innerText(),/0 词正确/);
    await page.getByRole('button',{ name:'听英文发音',exact:true }).click();
    assert.deepEqual((await page.evaluate(()=>window.__spoken.at(-1))),{ text:'benefit',lang:'en-US',rate:.9 });
    await page.getByRole('button',{ name:'慢速英文',exact:true }).click();
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).rate,.65);
    pass('A wrong retry stays on the same word and retains English and slow-English pronunciation');
    for (const [name,viewport] of [['pc-rewrite.png',{width:1440,height:900}],['ipad-portrait-rewrite.png',{width:768,height:1024}],['ipad-landscape-rewrite.png',{width:1024,height:768}],['iphone-rewrite.png',{width:390,height:844}],['small-phone-rewrite.png',{width:375,height:667}]]) await screenshot(name,viewport);
    pass('Wrong-answer rewrite fits desktop, both iPad orientations, iPhone and narrow phone without horizontal overflow');
    await rewrite().fill('benefit');
    const composedPrevented = await rewrite().evaluate(e=>!e.dispatchEvent(new KeyboardEvent('keydown',{ key:'Enter',code:'Enter',isComposing:true,keyCode:229,bubbles:true,cancelable:true })));
    assert.equal(composedPrevented,true); assert.equal(await next().isDisabled(),true);
    await rewrite().press('Enter'); await next().waitFor(); assert.equal(await next().isDisabled(),false);
    await page.waitForFunction(()=>document.activeElement?.textContent==='下一个单词');
    assert.match(await page.locator('.progress-label').innerText(),/0 词正确/);
    assert.match(await page.locator('.feedback.incorrect').innerText(),/你的答案：benifit/);
    pass('IME Enter does not submit; regular Enter accepts a correct rewrite without converting the original error into a score');
    await next().click(); await ensureProgress('02'); assert.equal(await rewrite().count(),0); assert.equal(await original().inputValue(),'');
    await original().fill('  TAKE   PART IN  '); await original().press('Enter');
    assert.equal(await page.locator('.feedback.correct').count(),1); assert.equal(await rewrite().count(),0);
    assert.match(await page.locator('.progress-label').innerText(),/1 词正确/);
    await next().click(); await ensureProgress('03');
    await page.getByRole('button',{ name:'不会，查看答案',exact:true }).click(); await rewrite().waitFor();
    assert.equal(await results().isDisabled(),true);
    await submitRewrite('CAN’T',true); assert.equal(await results().isDisabled(),false);
    await results().click();
    await page.getByRole('heading',{ name:'1 / 3 词拼写正确',exact:true }).waitFor();
    assert.equal(await page.locator('.result-row').count(),3);
    assert.match(await page.locator('.result-row').nth(0).innerText(),/你的答案：benifit/);
    assert.match(await page.locator('.result-row').nth(2).innerText(),/未作答 \/ 查看答案/);
    assert.equal(await page.locator('.result-row .answer-wrong').count(),2);
    pass('Correct first attempts need no rewrite; reveal and last-word completion are gated; case, whitespace and smart apostrophes use the original normalization');
    await page.getByRole('button',{ name:'只练错词 · 2',exact:true }).click();
    await original().waitFor(); assert.equal(await rewrite().count(),0); assert.equal(await original().inputValue(),''); await ensureProgress('01');
    assert.match(await page.locator('.progress-label').innerText(),/\/ 2 词/);
    await original().fill('benefit'); await original().press('Enter'); await next().click();
    await original().fill("can't"); await original().press('Enter'); await results().click();
    await page.getByRole('heading',{ name:'2 / 2 词拼写正确',exact:true }).waitFor();
    await page.getByRole('button',{ name:'再练整组',exact:true }).click();
    await wrong(); assert.equal(await next().isDisabled(),true);
    await exitRound(true); assert.equal(await rewrite().inputValue(),''); assert.equal(await next().isDisabled(),true);
    await exitRound(); assert.equal(await rewrite().count(),0);
    pass('Wrong-word practice and replay reset rewrite state; cancelling exit retains the pending rewrite and confirmed exit clears it');
    await option().uncheck(); await page.reload(); await option().waitFor(); assert.equal(await option().isChecked(),false);
    await start(); await original().fill('wrong'); await original().press('Enter');
    assert.equal(await rewrite().count(),0); assert.equal(await next().isDisabled(),false);
    await next().click(); await ensureProgress('02'); await exitRound();
    pass('Disabling the feature persists through reload and restores immediate original next-word behavior');
    await option().check(); await page.reload(); await option().waitFor(); assert.equal(await option().isChecked(),true);
    await selectGroup(); await choose('朗读内容','中文释义 → 写英文'); await start();
    await page.getByRole('button',{ name:'播放单词',exact:true }).click();
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).text,words[0].meaning);
    await wrong(); await page.getByRole('button',{ name:'听英文发音',exact:true }).click();
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).text,'benefit');
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).lang,'en-US');
    await submitRewrite('benefit'); assert.equal(await next().isDisabled(),false); await exitRound();
    pass('Enabled preference persists through reload and Chinese-cue mode keeps English answer audio and the same rewrite flow');
    await page.setViewportSize({width:768,height:1024}); await selectGroup(); await page.getByRole('radio',{ name:'纸笔听写',exact:true }).check();
    await choose('书写间隔','5 秒'); await choose('每词朗读','1 遍'); await page.locator('.start-button').click();
    const canvas = page.locator('.scratchpad-panel canvas'); await canvas.waitFor();
    assert.equal(await original().count(),0); assert.equal(await rewrite().count(),0);
    const box = await canvas.boundingBox(); await page.mouse.move(box.x+box.width*.2,box.y+box.height*.4); await page.mouse.down(); await page.mouse.move(box.x+box.width*.7,box.y+box.height*.4,{steps:20}); await page.mouse.up(); await frame();
    const ink = await canvas.evaluate(c=>c.toDataURL());
    assert(await canvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((value,i)=>i%4===3&&value>0)));
    await page.getByRole('button',{ name:'草稿区开始播放',exact:true }).click(); await page.getByRole('button',{name:'草稿区暂停',exact:true}).click();
    assert.equal(await canvas.evaluate(c=>c.toDataURL()),ink); assert.equal(await rewrite().count(),0);
    const paperFile=path.join(output,'ipad-paper-retained.png'); await page.screenshot({path:paperFile,fullPage:true}); screenshots.push(paperFile);
    await exitRound();
    pass('Paper mode retains v2 scratchpad drawing and playback, with no keyboard rewrite controls');
    assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('listen-write-library-v1'))),seed);
    assert.deepEqual(errors,[]);
    pass('Word library remains unchanged and the complete regression raises no browser JavaScript exceptions');
  } catch(error) {
    process.exitCode=1;
    if(page)try{await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});}catch(_){}
    console.error(error);
  } finally {
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report(),null,2));
    console.log(JSON.stringify({passed:passed.length,output,success:!process.exitCode}));
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
