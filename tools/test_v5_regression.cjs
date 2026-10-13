/* Real-browser v5 regression of all inherited modes. Speech and IME events are simulated; typing, submissions, layout and canvas use the rendered app. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const modules = process.env.CODEX_NODE_MODULES || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
function dependency(name) { try { return require(name); } catch (_) { return require(path.join(modules, name)); } }
const { chromium, webkit } = dependency('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.TEST_OUTPUT ? path.resolve(process.env.TEST_OUTPUT) : path.resolve(root, '../../outputs/tingxieben-v5-regression');
fs.mkdirSync(output, { recursive:true });
const passed = [], screenshots = [], errors = [];
function pass(name) { passed.push(name); console.log('PASS ' + name); }
const words = [
  { word:'benefit', meaning:'n. 益处；v. 使受益' },
  { word:'desperately', meaning:'adv. ①拼命地，②不顾一切地' },
  { word:'bright', meaning:'明亮的、聪明的' },
  { word:'bank', meaning:'银行 / 河岸' },
  { word:'calm', meaning:'平静的\n使平静' },
  { word:'help', meaning:'v. 帮助' },
  { word:'cheap', meaning:'便宜的；廉价的' },
  { word:'happy', meaning:'快乐的，幸福的' },
  { word:'light', meaning:'光；灯' },
  { word:'apple', meaning:'苹果' },
  { word:'method', meaning:'方法；办法' }
];
const regressionWords = [{ word:'benefit', meaning:'益处；使受益' }, { word:"can't", meaning:'不能' }];
const polishWords = [
  { word:'pneumonoultramicroscopicsilicovolcanoconiosis', meaning:'由吸入非常细微的硅尘所引起的一种肺部疾病；矽肺病' },
  { word:'antidisestablishmentarianism', meaning:'反对取消国教制度的政治主张；反对政教分离的主张' }
];
const seed = [
  { id:'browser-test-v4-meaning', revision:1, name:'四版多义测试', words },
  { id:'browser-test-v4-original', revision:1, name:'原有模式回归', words:regressionWords },
  { id:'browser-test-v4-empty', revision:1, name:'空释义测试', words:[{word:'lonely',meaning:''}] },
  { id:'browser-test-v4-pos', revision:1, name:'仅词性测试', words:[{word:'marker',meaning:'n. v.'}] },
  { id:'browser-test-v4-polish', revision:1, name:'细节打磨测试', words:polishWords }
];
const answers = ['使受益',' 拼 命 ','聪明','河岸','使平静','帮 助','便','不快乐的','错误；灯','apple',null];
const expected = [true,true,true,true,true,true,false,false,false,false,false];
const meaningOption = '英文发音 → 写中文意思';
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
  const htmlPath = path.join(root,'v5/index.html');
  const testedHtmlSha256 = crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex');
  const pageURL = process.env.TEST_FILE === '1' ? pathToFileURL(htmlPath).href : 'http://127.0.0.1:' + server.address().port + '/v5/';
  let browser, page;
  const report = () => ({ browser:process.env.TEST_ENGINE || 'chromium', pageURL, testedHtmlSha256, passed, errors, screenshots, actualIPad:false, serviceWorkerEndToEnd:false, simulated:['speech synthesis','IME composition KeyboardEvent'], success:!process.exitCode });
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
    const original = () => page.locator('#answer');
    const rewrite = () => page.getByRole('textbox',{ name:'再写一次英文拼写',exact:true });
    const rewriteOption = () => page.getByRole('checkbox',{ name:'答错后再写一遍',exact:true });
    const next = () => page.getByRole('button',{ name:'下一个单词',exact:true });
    const results = () => page.getByRole('button',{ name:'查看本轮结果',exact:true });
    const frame = () => page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    async function choose(name,value) { await page.getByRole('combobox',{ name,exact:true }).click(); await page.getByRole('option',{ name:value,exact:true }).click(); await page.locator('[role="listbox"]').waitFor({state:'hidden'}); }
    async function group(name='四版多义测试') {
      const controls = page.getByRole('checkbox',{name:/^选择 /});
      for (const control of await controls.all()) await control.uncheck();
      await page.getByRole('checkbox',{ name:'选择 '+name,exact:true }).check();
    }
    async function start(name='四版多义测试',mode='键盘听写') { await group(name); await page.getByRole('radio',{ name:mode,exact:true }).check(); await page.locator('.start-button').click(); }
    async function exitRound(cancel=false) { await page.getByRole('button',{ name:'返回词库',exact:true }).click(); await page.getByRole('button',{ name:cancel?'继续练习':'结束并返回',exact:true }).click(); }
    async function ensureProgress(number) { await page.waitForFunction(n=>document.querySelector('.progress-label strong')?.textContent===n,number); }
    async function play() { await page.getByRole('button',{name:/^(播放单词|重听)$/}).click(); }
    async function screenshot(name,viewport,checkInput=true) {
      await page.locator('[role="listbox"]').waitFor({state:'hidden'});
      await page.setViewportSize(viewport); await frame();
      const geometry = await page.evaluate(()=>({ scroll:document.documentElement.scrollWidth,width:innerWidth }));
      assert(geometry.scroll<=geometry.width+1,`${name}: horizontal overflow ${geometry.scroll} > ${geometry.width}`);
      if(checkInput) {
        const box = await original().boundingBox();
        assert(box && box.width>120 && box.x>=0 && box.x+box.width<=viewport.width+1,`${name}: Chinese answer input outside viewport`);
      }
      const file = path.join(output,name); await page.screenshot({path:file,fullPage:true}); screenshots.push(file);
    }
    async function answer(value) { await original().fill(value); await page.getByRole('button',{name:'检查意思',exact:true}).click(); }
    async function textFits(selector) {
      const measured=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>({
        text:node.textContent, width:node.clientWidth, scroll:node.scrollWidth,
        left:node.getBoundingClientRect().left, right:node.getBoundingClientRect().right,
        viewport:innerWidth
      })));
      assert(measured.length>0,`${selector}: expected visible text`);
      for(const box of measured) assert(box.scroll<=box.width+1&&box.left>=0&&box.right<=box.viewport+1,`${selector}: text clipped or outside viewport: ${JSON.stringify(box)}`);
    }

    await rewriteOption().waitFor(); assert.equal(await rewriteOption().isChecked(),true);
    const advancedVoice=page.locator('details.v5-advanced-voice');
    assert.equal(await advancedVoice.evaluate(node=>node.open),false);
    await advancedVoice.locator('summary').click();
    assert((await advancedVoice.getByRole('combobox').count())>0,'Collapsed system voice controls must remain reachable in the original spelling mode');
    await advancedVoice.locator('summary').click();
    assert.equal(await page.getByRole('combobox',{name:'发音资源',exact:true}).isVisible(),true);
    pass('Original spelling mode keeps pronunciation sources visible and system voice settings reachable through advanced controls');
    await choose('朗读内容',meaningOption);
    assert.equal(await rewriteOption().count(),0);
    assert.match(await page.locator('.practice-panel').innerText(),/一种/);
    await screenshot('pc-meaning-home.png',{width:1440,height:900},false);
    await start();
    const chineseAnswer=page.getByRole('textbox',{name:'输入中文意思',exact:true});
    await chineseAnswer.waitFor(); assert.equal(await chineseAnswer.getAttribute('lang'),'zh-CN');
    assert.equal(await original().getAttribute('placeholder'),'写出任意一种中文意思');
    assert.equal(await page.getByRole('button',{name:'显示中文提示',exact:true}).count(),0);
    assert.equal(await rewrite().count(),0); assert.equal(await page.locator('.scratchpad-panel').count(),0);
    assert(!/益处|使受益/.test(await page.locator('.session-area').innerText()));
    assert.equal(await page.getByRole('button',{name:'检查意思',exact:true}).isDisabled(),true);
    await play(); assert.deepEqual(await page.evaluate(()=>window.__spoken.at(-1)),{text:'benefit',lang:'en-US',rate:.9});
    pass('Home exposes the Chinese-meaning mode and one-meaning guidance; active keyboard mode plays English, hides translations and spelling rewrite controls');

    for (const [name,viewport] of [['pc-meaning.png',{width:1440,height:900}],['ipad-portrait-meaning.png',{width:768,height:1024}],['ipad-landscape-meaning.png',{width:1024,height:768}],['iphone-meaning.png',{width:390,height:844}],['small-phone-meaning.png',{width:375,height:667}]]) await screenshot(name,viewport);
    pass('The Chinese answer form fits desktop, both iPad orientations, iPhone and a narrow phone without horizontal overflow');

    await original().fill(answers[0]);
    await original().dispatchEvent('compositionstart',{data:'使受益'});
    await original().press('Enter');
    assert.equal(await page.locator('.feedback').count(),0); await ensureProgress('01');
    await original().dispatchEvent('compositionend',{data:'使受益'});
    await original().press('Enter');
    await page.getByRole('heading',{name:'意思正确！',exact:true}).waitFor();
    assert.equal(await page.locator('.feedback.correct').count(),1); assert.equal(await rewrite().count(),0);
    assert.equal(await page.locator('.feedback').getAttribute('role'),'status');
    assert.equal(await page.locator('.feedback .v4-meaning-verdict').innerText(),'回答正确，已匹配词库释义。');
    pass('Chinese IME confirmation Enter does not submit; ordinary Enter accepts a complete non-first meaning');

    await next().click();
    for(let i=1;i<words.length;i++) {
      await ensureProgress(String(i+1).padStart(2,'0'));
      assert.equal(await original().inputValue(),'');
      if(answers[i]===null) await page.getByRole('button',{name:'不会，查看答案',exact:true}).click();
      else await answer(answers[i]);
      await page.locator('.feedback').waitFor();
      assert.equal(await page.locator(expected[i]?'.feedback.correct':'.feedback.incorrect').count(),1,`${words[i].word}: unexpected meaning verdict for ${answers[i]}`);
      assert.equal(await page.locator('.feedback .v4-meaning-verdict').innerText(),expected[i]?'回答正确，已匹配词库释义。':answers[i]===null?'已查看答案，本词会加入本轮错词。':'未匹配到词库释义；同义表达可在分组中补充。');
      assert.equal(await rewrite().count(),0,`${words[i].word}: English rewrite must not appear in meaning mode`);
      const advance=i===words.length-1?results():next();
      assert.equal(await advance.isDisabled(),false);
      if(i===8) await screenshot('iphone-meaning-incorrect.png',{width:390,height:844});
      await advance.click();
    }
    await page.getByRole('heading',{name:'6 / 11 词释义正确',exact:true}).waitFor();
    assert.equal(await page.locator('.result-row').count(),11);
    assert.equal(await page.locator('.result-row .answer-wrong').count(),5);
    assert.match(await page.locator('.result-row').nth(0).innerText(),/你的答案：使受益/);
    assert.match(await page.locator('.result-row').nth(7).innerText(),/你的答案：不快乐的/);
    assert.match(await page.locator('.result-row').nth(8).innerText(),/你的答案：错误；灯/);
    assert.match(await page.locator('.result-row').nth(10).innerText(),/未作答 \/ 查看答案/);
    pass('Any complete listed sense is accepted across semicolon, numbered comma, enumeration comma, slash and newline, with whitespace and optional final 的 or 地 normalized');
    pass('Substring guesses, opposite meanings, mixed wrong-plus-correct guesses and English spelling are rejected; reveal is scored wrong and results retain Chinese answers');

    await page.getByRole('button',{name:'只练错词 · 5',exact:true}).click();
    await ensureProgress('01'); assert.match(await page.locator('.progress-label').innerText(),/\/ 5 词/);
    assert.equal(await original().inputValue(),'');
    for(const [i,value] of ['廉价','幸福','灯','苹果','办法'].entries()) {
      await answer(value); assert.equal(await page.locator('.feedback.correct').count(),1); assert.equal(await rewrite().count(),0);
      await (i===4?results():next()).click();
    }
    await page.getByRole('heading',{name:'5 / 5 词释义正确',exact:true}).waitFor();
    await page.getByRole('button',{name:'再练整组',exact:true}).click();
    await ensureProgress('01'); assert.equal(await original().inputValue(),'');
    await original().fill('廉价'); await exitRound(true); assert.equal(await original().inputValue(),'廉价');
    await exitRound(); assert.equal(await original().count(),0);
    await start('原有模式回归'); await ensureProgress('01'); assert.equal(await original().inputValue(),''); await exitRound();
    pass('Wrong-word practice, replay and exit reset session state while preserving cancelled-exit input; new rounds begin with a clean Chinese answer');

    await start('原有模式回归');
    await original().fill('使受益');
    await original().dispatchEvent('compositionstart',{data:'使受益'});
    await page.getByRole('button',{name:'不会，查看答案',exact:true}).click();
    await page.locator('.feedback.incorrect').waitFor();
    await next().click(); await ensureProgress('02');
    await original().fill('不能'); await original().press('Enter');
    await page.locator('.feedback.correct').waitFor(); await results().click();
    await page.getByRole('heading',{name:'1 / 2 词释义正确',exact:true}).waitFor();
    await page.getByRole('button',{name:'回到词库',exact:true}).click();
    pass('Revealing an answer after a composing input loses focus works, scores the reveal wrong and does not leave the following answer locked');

    await start('细节打磨测试'); await page.setViewportSize({width:375,height:667});
    for(const [index,value] of [polishWords[0].meaning.split('；')[0],'很长的错误中文答案用来确认反馈与结果中文不溢出以及英文也应该能够正确换行'].entries()) {
      await original().fill(value); await page.keyboard.down('Enter');
      await page.locator(index===0?'.feedback.correct':'.feedback.incorrect').waitFor(); await frame();
      const advance=index===0?next():results();
      assert.equal(await advance.evaluate(node=>node===document.activeElement),true,'Answer feedback should move keyboard focus to the advance control');
      await page.keyboard.down('Enter'); await frame();
      await ensureProgress(String(index+1).padStart(2,'0'));
      assert.equal(await page.getByRole('heading',{name:'1 / 2 词释义正确',exact:true}).count(),0,'Held Enter must not skip last-word feedback');
      await page.keyboard.up('Enter');
      await textFits('.feedback'); await textFits('.feedback strong');
      await screenshot(index===0?'small-phone-long-correct.png':'small-phone-long-incorrect.png',{width:375,height:667});
      await advance.click();
      if(index===0) { await frame(); assert.equal(await original().evaluate(node=>node===document.activeElement),true,'Next word should focus the answer field'); }
    }
    await page.getByRole('heading',{name:'1 / 2 词释义正确',exact:true}).waitFor();
    await frame();
    assert.equal(await page.getByRole('heading',{name:'1 / 2 词释义正确',exact:true}).evaluate(node=>node===document.activeElement),true,'Results should focus their heading for keyboard and screen-reader continuity');
    await textFits('.result-row'); await textFits('.result-row strong'); await textFits('.result-row small');
    assert.match(await page.locator('.result-row').first().innerText(),new RegExp(polishWords[0].meaning.split('；')[0]));
    assert.equal(await page.locator('.result-row .v4-answer-correct').count(),1);
    assert.equal(await page.locator('.result-row .v4-answer-incorrect').count(),1);
    const answerColors=await page.locator('.result-row small').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
    assert.notEqual(answerColors[0],answerColors[1],'Correct and incorrect answers must not share the old error color');
    await screenshot('small-phone-long-results.png',{width:375,height:667},false);
    await page.getByRole('button',{name:'回到词库',exact:true}).click();
    pass('Held Enter preserves both next-word and last-word feedback; keyboard focus follows checking and advancing without skipping a word');
    pass('Long English words, Chinese reference meanings and correct or incorrect answers wrap fully in feedback and results at 375 pixels');
    pass('Live feedback explicitly distinguishes correct, unmatched and revealed answers; results focus their heading and distinguish correct-answer color');

    await choose('朗读内容','英文发音');
    await rewriteOption().waitFor(); assert.equal(await rewriteOption().isChecked(),true);
    await start('原有模式回归'); await play(); assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).text,'benefit');
    await original().fill('benifit'); await original().press('Enter'); await rewrite().waitFor();
    assert.equal(await next().isDisabled(),true); assert.equal(await original().inputValue(),'benifit');
    await rewrite().fill('benefit'); await page.getByRole('button',{name:'确认重写',exact:true}).click();
    assert.equal(await next().isDisabled(),false); assert.match(await page.locator('.progress-label').innerText(),/0 词正确/); await exitRound();
    await choose('朗读内容','中文释义 → 写英文'); await start('原有模式回归'); await play();
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).text,'益处；使受益');
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).lang,'zh-CN');
    await original().fill('benifit'); await original().press('Enter'); await rewrite().waitFor();
    await page.getByRole('button',{name:'听英文发音',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).text,'benefit');
    await rewrite().fill('benefit'); await rewrite().press('Enter'); assert.equal(await next().isDisabled(),false); await exitRound();
    pass('Original English spelling and Chinese-to-English modes retain v3 wrong-answer rewriting, original first-attempt score and pronunciation');

    await choose('朗读内容',meaningOption); await group('原有模式回归');
    await page.getByRole('radio',{name:'纸笔听写',exact:true}).check();
    assert.equal(await rewriteOption().count(),0);
    await choose('书写间隔','5 秒'); await choose('每词朗读','1 遍');
    await page.setViewportSize({width:768,height:1024}); await page.locator('.start-button').click();
    const canvas=page.locator('.scratchpad-panel canvas'); await canvas.waitFor();
    assert.equal(await original().count(),0); assert.equal(await rewrite().count(),0);
    assert(!/益处|使受益/.test(await page.locator('.session-area').innerText()));
    const box=await canvas.boundingBox(); await page.mouse.move(box.x+box.width*.2,box.y+box.height*.4); await page.mouse.down(); await page.mouse.move(box.x+box.width*.7,box.y+box.height*.4,{steps:20}); await page.mouse.up(); await frame();
    const ink=await canvas.evaluate(c=>c.toDataURL());
    assert(await canvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((value,i)=>i%4===3&&value>0)));
    await page.getByRole('button',{name:'草稿区开始播放',exact:true}).click(); await page.getByRole('button',{name:'草稿区暂停',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).text,'benefit');
    assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).lang,'en-US');
    assert.equal(await canvas.evaluate(c=>c.toDataURL()),ink);
    await page.getByRole('button',{name:'草稿区继续',exact:true}).click();
    await page.getByRole('heading',{name:'本轮听写完成',exact:true}).waitFor({timeout:18000});
    assert.equal(await canvas.evaluate(c=>c.toDataURL()),ink); assert.equal(await page.locator('.result-row').count(),2);
    assert.match(await page.locator('.result-row').nth(0).innerText(),/益处；使受益/);
    await screenshot('ipad-paper-meaning-results.png',{width:768,height:1024},false);
    await page.getByRole('button',{name:'回到词库',exact:true}).click(); assert.equal(await page.locator('.scratchpad-panel').count(),0);
    pass('Paper meaning mode reads English, preserves drawn scratchpad ink through pause and completion, and reveals Chinese senses for final self-check');

    await page.getByRole('radio',{name:'键盘听写',exact:true}).check();
    for(const name of ['空释义测试','仅词性测试']) {
      await group(name);
      const button=page.locator('.start-button');
      if(!(await button.isDisabled())) await button.click();
      assert.equal(await original().count(),0,`${name}: session must not start`);
      assert.equal(await page.getByRole('combobox',{name:'朗读内容',exact:true}).count(),1);
      assert.match(await page.locator('.practice-panel').innerText(),/缺少可用于判分的中文释义/);
    }
    pass('An empty Chinese meaning and a part-of-speech-only meaning both block the new mode from starting');
    for(const cue of [meaningOption,'中文释义 → 写英文']) {
      await choose('朗读内容',cue); await page.reload();
      assert.equal(await page.getByRole('combobox',{name:'朗读内容',exact:true}).innerText(),cue);
    }
    await page.evaluate(()=>localStorage.setItem('listen-write-cue-v5','unrecognized-mode'));
    await page.reload();
    assert.equal(await page.getByRole('combobox',{name:'朗读内容',exact:true}).innerText(),'英文发音');
    await choose('朗读内容',meaningOption);
    pass('The selected dictation direction survives reload; an invalid saved direction safely falls back to English spelling');
    assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('listen-write-library-v1'))),seed);
    assert.deepEqual(errors,[]);
    pass('All seeded word groups remain byte-equivalent in local storage and no browser JavaScript exceptions occur');
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
