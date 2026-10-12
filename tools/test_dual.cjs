/* Real-browser v5 regression. Speech and IME are simulated; all typing, feedback,
 * focus, layout and scratchpad assertions exercise the rendered application. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const modules=process.env.CODEX_NODE_MODULES||path.join(process.env.USERPROFILE||process.env.HOME||'.','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
function dependency(name){try{return require(name);}catch(_){return require(path.join(modules,name));}}
const {chromium,webkit}=dependency('playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.TEST_OUTPUT?path.resolve(process.env.TEST_OUTPUT):path.resolve(root,'../../outputs/tingxieben-v5-tests');
fs.mkdirSync(output,{recursive:true});
const passed=[],screenshots=[],errors=[];
function pass(name){passed.push(name);console.log('PASS '+name);}
const words=[
  {word:'benefit',meaning:'n. 益处；v. 使受益'},
  {word:'bank',meaning:'银行 / 河岸'},
  {word:'bright',meaning:'明亮的、聪明的'},
  {word:'happy',meaning:'快乐的，幸福的'},
  {word:'help',meaning:'v. 帮助'},
  {word:'light',meaning:'光；灯'},
  {word:'apple',meaning:'苹果'},
  {word:'method',meaning:'方法；办法'}
];
const paired=[
  [' BENEFIT ','使受益',true,true],
  ['bannk','河岸',false,true],
  ['bright','明',true,false],
  ['hapy','不快乐的',false,false],
  ['help','帮 助',true,true],
  ['light','错误；灯',true,false],
  ['apple','apple',true,false],
  [null,null,false,false]
];
const normalized=[{word:"can't",meaning:'不能'},{word:'well-being',meaning:'健康；幸福'}];
const longWords=[
  {word:'pneumonoultramicroscopicsilicovolcanoconiosis',meaning:'由吸入非常细微的硅尘所引起的一种肺部疾病；矽肺病'},
  {word:'antidisestablishmentarianism',meaning:'反对取消国教制度的政治主张；反对政教分离的主张'}
];
const seed=[
  {id:'browser-test-v5-dual',revision:1,name:'五版双项测试',words},
  {id:'browser-test-v5-rewrite',revision:1,name:'五版重写测试',words:words.slice(0,2)},
  {id:'browser-test-v5-normalize',revision:1,name:'五版归一化测试',words:normalized},
  {id:'browser-test-v5-long',revision:1,name:'五版长文本测试',words:longWords},
  {id:'browser-test-v5-audio',revision:1,name:'五版音频测试',words:[{word:'recording',meaning:'录音'},{word:'unrecorded',meaning:'未记录的'},{word:'offline',meaning:'离线的'},{word:'pending',meaning:'待定的'},{word:'stale',meaning:'过时的'}]},
  {id:'browser-test-v5-empty',revision:1,name:'五版空释义测试',words:[{word:'lonely',meaning:''}]},
  {id:'browser-test-v5-pos',revision:1,name:'五版仅词性测试',words:[{word:'marker',meaning:'n. v.'}]}
];
const dualOption='英文发音 → 写英文和中文';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};

async function main(){
  const server=http.createServer((req,res)=>{try{let relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(relative.endsWith('/'))relative+='index.html';const file=path.resolve(root,'.'+relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end('missing');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const htmlPath=path.join(root,'v5/index.html');
  const testedHtmlSha256=crypto.createHash('sha256').update(fs.readFileSync(htmlPath)).digest('hex');
  const pageURL=process.env.TEST_FILE==='1'?pathToFileURL(htmlPath).href:'http://127.0.0.1:'+server.address().port+'/v5/';
  let browser,page;
  const report=()=>({browser:process.env.TEST_ENGINE||'chromium',pageURL,testedHtmlSha256,passed,errors,screenshots,actualIPad:false,serviceWorkerEndToEnd:false,simulated:['speech synthesis','IME composition KeyboardEvent','dictionary recordings and network responses'],success:!process.exitCode});
  try{
    const engine=process.env.TEST_ENGINE==='webkit'?webkit:chromium;
    browser=await engine.launch({...(process.env.TEST_BROWSER?{executablePath:process.env.TEST_BROWSER}:{}),headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    page=await context.newPage();
    page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(({seed})=>{
      if(!localStorage.getItem('listen-write-library-v1'))localStorage.setItem('listen-write-library-v1',JSON.stringify(seed));
      window.__spoken=[];let speechTimer;
      Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(text){this.text=text;this.lang='';this.rate=1;this.voice=null;}}});
      const voices=[{name:'Simulated English',lang:'en-US',voiceURI:'test-en',localService:true,default:true},{name:'Simulated Chinese',lang:'zh-CN',voiceURI:'test-zh',localService:true,default:false}];
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>voices,speaking:false,pending:false,paused:false,addEventListener:()=>{},removeEventListener:()=>{},cancel(){clearTimeout(speechTimer);this.speaking=false;},speak(u){window.__spoken.push({text:u.text,lang:u.lang,rate:u.rate});this.speaking=true;if(u.onstart)u.onstart({});speechTimer=setTimeout(()=>{this.speaking=false;if(u.onend)u.onend({});},25);}}});
      window.__dictionaryMode='success';window.__dictionaryQueries=[];window.__recordings=[];window.__pendingDictionary=[];
      const fetchOriginal=window.fetch.bind(window);
      window.fetch=(input,options={})=>{
        const url=typeof input==='string'?input:input.url;
        if(!url.startsWith('https://api.dictionaryapi.dev/api/v2/entries/en/'))return fetchOriginal(input,options);
        const word=decodeURIComponent(url.split('/').at(-1));window.__dictionaryQueries.push(word);
        const payload=[{word,phonetics:['us','uk'].map(accent=>({audio:`https://api.dictionaryapi.dev/media/pronunciations/en/${word}-${accent}.mp3`,sourceUrl:`https://commons.wikimedia.org/wiki/File:En-${accent}-${word}.ogg`,license:{name:'CC BY-SA 3.0',url:'https://creativecommons.org/licenses/by-sa/3.0/'}}))}];
        const response={ok:true,status:200,json:async()=>window.__dictionaryMode==='missing'?[{word,phonetics:[]}]:payload};
        if(window.__dictionaryMode==='error')return Promise.reject(new Error('Failed dictionary lookup: '+word+' '+url));
        if(window.__dictionaryMode==='pending')return new Promise((resolve,reject)=>{
          const pending={resolve:()=>resolve(response),reject};window.__pendingDictionary.push(pending);
          if(options.signal)options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
        });
        return Promise.resolve(response);
      };
      Object.defineProperty(window,'Audio',{configurable:true,value:class extends EventTarget{
        constructor(src=''){super();this.src=src;this.playbackRate=1;this.paused=true;this.currentTime=0;this.duration=.03;this.preload='';}
        emit(type){this.dispatchEvent(new Event(type));if(typeof this['on'+type]==='function')this['on'+type](new Event(type));}
        load(){setTimeout(()=>{this.readyState=4;this.emit('canplay');this.emit('loadedmetadata');},0);}
        play(){window.__recordings.push({src:this.src,rate:this.playbackRate});this.paused=false;this.emit('playing');this.timer=setTimeout(()=>{this.paused=true;this.emit('ended');},25);return Promise.resolve();}
        pause(){clearTimeout(this.timer);this.paused=true;}
        removeAttribute(name){if(name==='src')this.src='';}
      }});
    },{seed});
    await page.goto(pageURL);
    const english=()=>page.getByRole('textbox',{name:'输入英文拼写',exact:true});
    const chinese=()=>page.getByRole('textbox',{name:'输入中文意思',exact:true});
    const rewrite=()=>page.getByRole('textbox',{name:'再写一次英文拼写',exact:true});
    const rewriteOption=()=>page.getByRole('checkbox',{name:'答错后再写一遍',exact:true});
    const check=()=>page.getByRole('button',{name:'检查英文和中文',exact:true});
    const next=()=>page.getByRole('button',{name:'下一个单词',exact:true});
    const results=()=>page.getByRole('button',{name:'查看本轮结果',exact:true});
    const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    async function choose(name,value){await page.getByRole('combobox',{name,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();await page.locator('[role="listbox"]').waitFor({state:'hidden'});}
    async function group(name='五版双项测试'){for(const control of await page.getByRole('checkbox',{name:/^选择 /}).all())await control.uncheck();await page.getByRole('checkbox',{name:'选择 '+name,exact:true}).check();}
    async function start(name='五版双项测试',mode='键盘听写'){await group(name);await page.getByRole('radio',{name:mode,exact:true}).check();await page.locator('.start-button').click();}
    async function exitRound(cancel=false){await page.getByRole('button',{name:'返回词库',exact:true}).click();await page.getByRole('button',{name:cancel?'继续练习':'结束并返回',exact:true}).click();}
    async function ensureProgress(number){await page.waitForFunction(n=>document.querySelector('.progress-label strong')?.textContent===n,number);}
    async function play(){await page.getByRole('button',{name:/^(播放单词|重听)$/}).click();}
    async function answer(en,zh){await english().fill(en);await chinese().fill(zh);await check().click();await page.locator('.feedback').waitFor();}
    async function screenshot(name,viewport,checkInputs=true){
      await page.locator('[role="listbox"]').waitFor({state:'hidden'});await page.setViewportSize(viewport);await frame();
      const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
      assert(geometry.scroll<=geometry.width+1,`${name}: horizontal overflow ${geometry.scroll} > ${geometry.width}`);
      if(checkInputs)for(const input of [english(),chinese()]){const box=await input.boundingBox();assert(box&&box.width>120&&box.x>=0&&box.x+box.width<=viewport.width+1,`${name}: input outside viewport`);}
      const file=path.join(output,name);await page.screenshot({path:file,fullPage:true});screenshots.push(file);
    }
    async function textFits(selector){
      const measured=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,width:node.clientWidth,scroll:node.scrollWidth,left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,viewport:innerWidth})));
      assert(measured.length>0,`${selector}: expected visible text`);
      for(const box of measured)assert(box.scroll<=box.width+1&&box.left>=0&&box.right<=box.viewport+1,`${selector}: text clipped or outside viewport: ${JSON.stringify(box)}`);
    }
    async function assertComponents(en,zh){
      const feedback=page.locator('.feedback');
      assert.equal(await page.locator(en&&zh?'.feedback.correct':'.feedback.incorrect').count(),1,'Combined score requires both components');
      assert.match(await feedback.innerText(),new RegExp('英文拼写[：: ]*(?:'+(en?'正确':'未正确|未匹配|错误|未作答|已查看答案')+')'));
      assert.match(await feedback.innerText(),new RegExp('中文意思[：: ]*(?:'+(zh?'正确':'未正确|未匹配|错误|未作答|已查看答案')+')'));
      assert.equal(await feedback.locator('.v5-dual-verdict [data-correct="true"]').count(),Number(en)+Number(zh));
    }
    async function scoreHeading(correct,total){
      const heading=page.getByRole('heading',{name:`${correct} / ${total} 词双项正确`,exact:true});
      await heading.waitFor();return heading;
    }

    await choose('朗读内容',dualOption);
    await rewriteOption().waitFor();await rewriteOption().uncheck();
    assert.match(await page.locator('.practice-panel').innerText(),/英文|中文/);
    await screenshot('pc-dual-home.png',{width:1440,height:900},false);
    await start();
    await english().waitFor();await chinese().waitFor();
    assert.equal(await english().getAttribute('id'),'answer');assert.equal(await chinese().getAttribute('id'),'meaning-answer');
    assert.equal(await english().getAttribute('lang'),'en');assert.equal(await chinese().getAttribute('lang'),'zh-CN');
    assert.equal(await check().isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'显示中文提示',exact:true}).count(),0);
    assert(!/benefit|益处|使受益/.test(await page.locator('.session-area').innerText()));
    assert.equal(await rewrite().count(),0);
    await play();assert.deepEqual(await page.evaluate(()=>window.__spoken.at(-1)),{text:'benefit',lang:'en-US',rate:.9});
    pass('Home exposes English-and-Chinese dictation; practice has two labelled inputs, English audio and no answer or translation hint');
    await english().fill('benefit');assert.equal(await check().isDisabled(),true);
    await english().press('Enter');await frame();
    assert.equal(await chinese().evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('.feedback').count(),0);
    await chinese().fill('使受益');await english().fill('');assert.equal(await check().isDisabled(),true);
    await english().fill(' BENEFIT ');assert.equal(await check().isDisabled(),false);
    pass('Both answers are required; Enter from the English input moves to the Chinese input without grading');
    for(const[name,viewport]of[['pc-dual.png',{width:1440,height:900}],['ipad-portrait-dual.png',{width:768,height:1024}],['ipad-landscape-dual.png',{width:1024,height:768}],['iphone-dual.png',{width:390,height:844}],['small-phone-dual.png',{width:375,height:667}]])await screenshot(name,viewport);
    pass('The dual answer form fits desktop, both iPad orientations, iPhone and a narrow phone without horizontal overflow');
    await chinese().focus();await play();await frame();assert.equal(await english().inputValue(),' BENEFIT ');assert.equal(await chinese().inputValue(),'使受益');assert.equal(await chinese().evaluate(node=>node===document.activeElement),true);
    pass('Replaying English audio preserves both draft answers and focus in the Chinese field');
    await chinese().dispatchEvent('compositionstart',{data:'使受益'});await chinese().press('Enter');
    assert.equal(await page.locator('.feedback').count(),0);await ensureProgress('01');
    await chinese().dispatchEvent('compositionend',{data:'使受益'});await chinese().press('Enter');
    await page.locator('.feedback.correct').waitFor();await assertComponents(true,true);
    pass('Chinese IME confirmation Enter does not submit; ordinary Enter accepts normalized English plus any complete listed Chinese sense');
    await next().click();
    for(let i=1;i<words.length;i++){
      await ensureProgress(String(i+1).padStart(2,'0'));assert.equal(await english().inputValue(),'');assert.equal(await chinese().inputValue(),'');
      const[en,zh,enCorrect,zhCorrect]=paired[i];
      if(en===null)await page.getByRole('button',{name:'不会，查看答案',exact:true}).click();else await answer(en,zh);
      await page.locator('.feedback').waitFor();await assertComponents(enCorrect,zhCorrect);
      assert.equal(await rewrite().count(),0);const advance=i===words.length-1?results():next();assert.equal(await advance.isDisabled(),false);
      if(i===1)await screenshot('iphone-dual-spelling-wrong.png',{width:390,height:844});
      if(i===2)await screenshot('iphone-dual-meaning-wrong.png',{width:390,height:844});
      await advance.click();
    }
    await scoreHeading(2,8);assert.equal(await page.locator('.result-row').count(),8);assert.equal(await page.locator('.result-row .answer-wrong').count(),6);
    assert.match(await page.locator('.v5-dual-totals').innerText(),/英文拼写 5 \/ 8[\s\S]*中文意思 3 \/ 8/);
    for(let i=0;i<words.length;i++){
      const row=await page.locator('.result-row').nth(i).innerText();
      if(paired[i][0]!==null){assert(row.includes(paired[i][0].trim()));assert(row.includes(paired[i][1]));}
      else assert.match(row,/未作答|查看答案/);
    }
    pass('All four spelling-and-meaning correctness combinations receive separate feedback; the round counts a word correct only when both are correct');
    pass('Substring guesses, opposite meanings, mixed wrong-plus-correct guesses and English-as-Chinese are rejected; reveal is wrong and results preserve both answers');
    await page.getByRole('button',{name:'只练错词 · 6',exact:true}).click();await ensureProgress('01');assert.match(await page.locator('.progress-label').innerText(),/\/ 6 词/);
    const retry=[['bank','银行'],['bright','聪明'],['happy','幸福'],['light','灯'],['apple','苹果'],['method','办法']];
    for(const[i,[en,zh]]of retry.entries()){await answer(en,zh);await assertComponents(true,true);await(i===retry.length-1?results():next()).click();}
    await scoreHeading(6,6);await page.getByRole('button',{name:'再练整组',exact:true}).click();await ensureProgress('01');
    assert.equal(await english().inputValue(),'');assert.equal(await chinese().inputValue(),'');
    await english().fill('bank');await chinese().fill('河岸');await exitRound(true);
    assert.equal(await english().inputValue(),'bank');assert.equal(await chinese().inputValue(),'河岸');await exitRound();
    pass('Wrong-word review and replay keep both fields clean; cancelling exit preserves both in-progress answers');

    await rewriteOption().check();await start('五版重写测试');
    await answer('benefit','错误意思');await assertComponents(true,false);assert.equal(await rewrite().count(),0);assert.equal(await next().isDisabled(),false);await next().click();
    await answer('bannk','河岸');await assertComponents(false,true);await rewrite().waitFor();assert.equal(await results().isDisabled(),true);
    await rewrite().fill('bannk');await page.getByRole('button',{name:'确认重写',exact:true}).click();assert.equal(await results().isDisabled(),true);
    await rewrite().fill('bank');await rewrite().press('Enter');assert.equal(await results().isDisabled(),false);await results().click();await scoreHeading(0,2);assert.match(await page.locator('.v5-dual-totals').innerText(),/英文拼写 1 \/ 2[\s\S]*中文意思 1 \/ 2/);await page.getByRole('button',{name:'回到词库',exact:true}).click();
    pass('Optional rewrite applies only to wrong English spelling; a wrong Chinese meaning can advance and correction does not change first-attempt results');
    await start('五版重写测试');await english().fill('benefit');await chinese().fill('使受益');await chinese().dispatchEvent('compositionstart',{data:'使受益'});
    await page.getByRole('button',{name:'不会，查看答案',exact:true}).click();await page.locator('.feedback.incorrect').waitFor();await rewrite().waitFor();assert.equal(await next().isDisabled(),true);
    await rewrite().fill('benefit');await rewrite().press('Enter');await next().click();await answer('bank','银行');await results().click();await scoreHeading(1,2);await page.getByRole('button',{name:'回到词库',exact:true}).click();
    pass('Reveal while the Chinese input is composing works, scores neither component and can require English rewrite without locking the next word');
    await rewriteOption().uncheck();await start('五版归一化测试');
    await answer('  CAN’T  ','不能');await assertComponents(true,true);await next().click();await answer(' WELL-BEING ','幸福');await assertComponents(true,true);await results().click();await scoreHeading(2,2);await page.getByRole('button',{name:'回到词库',exact:true}).click();
    pass('English NFKC, apostrophe, case and outer whitespace normalization and complete non-first Chinese senses work together');

    await start('五版长文本测试');await page.setViewportSize({width:375,height:667});
    for(const[index,pair]of[[longWords[0].word,longWords[0].meaning.split('；')[0]],[longWords[1].word+'wrong','很长的错误中文答案用来确认两个回答的反馈与结果不会溢出页面']].entries()){
      await english().fill(pair[0]);await chinese().fill(pair[1]);await page.keyboard.down('Enter');await page.locator(index===0?'.feedback.correct':'.feedback.incorrect').waitFor();await frame();
      const advance=index===0?next():results();assert.equal(await advance.evaluate(node=>node===document.activeElement),true);await page.keyboard.down('Enter');await frame();await ensureProgress(String(index+1).padStart(2,'0'));await page.keyboard.up('Enter');
      await textFits('.feedback');await textFits('.feedback strong');await screenshot(index===0?'small-phone-long-dual-correct.png':'small-phone-long-dual-incorrect.png',{width:375,height:667});await advance.click();
      if(index===0){await frame();assert.equal(await english().evaluate(node=>node===document.activeElement),true);}
    }
    const heading=await scoreHeading(1,2);await frame();assert.equal(await heading.evaluate(node=>node===document.activeElement),true);await textFits('.result-row');await textFits('.result-row strong');await textFits('.result-row small');await screenshot('small-phone-long-dual-results.png',{width:375,height:667},false);await page.getByRole('button',{name:'回到词库',exact:true}).click();
    pass('Held Enter preserves next-word and last-word feedback; focus follows checking, advancing and result summary');
    pass('Long English words and both Chinese answers wrap fully in feedback and results at 375 pixels');

    await group('五版重写测试');await page.getByRole('radio',{name:'纸笔听写',exact:true}).check();await choose('书写间隔','5 秒');await choose('每词朗读','1 遍');await page.setViewportSize({width:768,height:1024});await page.locator('.start-button').click();
    const canvas=page.locator('.scratchpad-panel canvas');await canvas.waitFor();assert.equal(await english().count(),0);assert.equal(await chinese().count(),0);assert(!/benefit|益处|使受益/.test(await page.locator('.session-area').innerText()));
    const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.4,{steps:20});await page.mouse.up();await frame();
    const ink=await canvas.evaluate(c=>c.toDataURL());assert(await canvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((value,i)=>i%4===3&&value>0)));
    await page.getByRole('button',{name:'草稿区开始播放',exact:true}).click();await page.getByRole('button',{name:'草稿区暂停',exact:true}).click();assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).text,'benefit');assert.equal((await page.evaluate(()=>window.__spoken.at(-1))).lang,'en-US');assert.equal(await canvas.evaluate(c=>c.toDataURL()),ink);
    await page.getByRole('button',{name:'草稿区继续',exact:true}).click();await page.getByRole('heading',{name:'本轮听写完成',exact:true}).waitFor({timeout:18000});assert.equal(await canvas.evaluate(c=>c.toDataURL()),ink);assert.equal(await page.locator('.result-row').count(),2);assert.match(await page.locator('.result-row').first().innerText(),/benefit[\s\S]*益处[\s\S]*使受益/);await screenshot('ipad-paper-dual-results.png',{width:768,height:1024},false);await page.getByRole('button',{name:'回到词库',exact:true}).click();
    pass('Paper dual mode reads English, preserves scratchpad ink through pause and completion, and reveals both references for manual self-check');
    await page.getByRole('radio',{name:'键盘听写',exact:true}).check();
    for(const name of['五版空释义测试','五版仅词性测试']){await group(name);const button=page.locator('.start-button');if(!(await button.isDisabled()))await button.click();assert.equal(await english().count(),0);assert.match(await page.locator('.practice-panel').innerText(),/缺少可用于判分的中文释义/);}
    pass('Missing and part-of-speech-only Chinese meanings block dual keyboard practice from starting');
    const audioSource=page.getByRole('combobox',{name:'发音资源',exact:true});
    assert.equal(await audioSource.inputValue(),'device');
    const requestsBefore=await page.evaluate(()=>window.__dictionaryQueries.length);
    await page.getByRole('button',{name:'试听发音资源',exact:true}).click();await frame();
    assert.equal(await page.evaluate(()=>window.__dictionaryQueries.length),requestsBefore);
    await audioSource.selectOption('dictionary-us');await page.getByRole('button',{name:'试听发音资源',exact:true}).click();
    await page.waitForFunction(()=>window.__recordings.some(audio=>audio.src.endsWith('-us.mp3')));
    await page.getByRole('link',{name:'录音来源与作者',exact:true}).waitFor();
    assert.match(await page.getByRole('link',{name:'录音来源与作者',exact:true}).getAttribute('href'),/^https:\/\/commons\.wikimedia\.org\//);
    assert.equal(await page.getByRole('link',{name:'CC BY-SA 3.0',exact:true}).getAttribute('href'),'https://creativecommons.org/licenses/by-sa/3.0/');
    await audioSource.selectOption('dictionary-uk');await page.getByRole('button',{name:'试听发音资源',exact:true}).click();
    await page.waitForFunction(()=>window.__recordings.some(audio=>audio.src.endsWith('-uk.mp3')));
    assert.equal(await page.evaluate(()=>localStorage.getItem('listen-write-audio-source-v5')),'dictionary-uk');
    pass('Device preview makes no external lookup; US and UK previews use the requested accent, expose recording source and license, and save the choice');
    await audioSource.selectOption('dictionary-us');await start('五版音频测试');await play();
    await page.waitForFunction(()=>window.__recordings.some(audio=>audio.src.endsWith('/recording-us.mp3')));
    assert(!/recording|录音[：:]|https:|dictionaryapi|wikimedia/i.test(await page.locator('.session-area').innerText()));
    assert.equal(await page.locator('.session-area .v5-audio-credit').count(),0);
    await answer('recording','录音');await assertComponents(true,true);
    await page.locator('.session-area .v5-audio-credit').waitFor();
    assert.equal(await page.getByRole('link',{name:'CC BY-SA 3.0',exact:true}).getAttribute('href'),'https://creativecommons.org/licenses/by-sa/3.0/');
    await page.evaluate(()=>window.__dictionaryMode='missing');await next().click();
    pass('Selected dictionary playback works in an active dual round without exposing the target word or recording URL before feedback');
    await page.waitForFunction(()=>window.__spoken.at(-1)?.text==='unrecorded');
    assert(!/unrecorded|https:|dictionaryapi|wikimedia/i.test(await page.locator('.session-area').innerText()));
    await answer('unrecorded','未记录');await page.evaluate(()=>window.__dictionaryMode='error');await next().click();
    await page.waitForFunction(()=>window.__spoken.at(-1)?.text==='offline');
    assert(!/offline|https:|dictionaryapi|wikimedia/i.test(await page.locator('.session-area').innerText()));
    await answer('offline','离线');await page.evaluate(()=>window.__dictionaryMode='pending');await next().click();
    pass('Missing recordings and network errors fall back to device English with a generic notice and no hidden-answer leak');
    await page.waitForFunction(()=>window.__spoken.at(-1)?.text==='pending',undefined,{timeout:8500});
    assert(!/pending|https:|dictionaryapi|wikimedia/i.test(await page.locator('.session-area').innerText()));
    await answer('pending','待定');await next().click();
    pass('A dictionary lookup that never settles times out and falls back to device English rather than leaving playback stuck');
    const beforeCancel=await page.evaluate(()=>({speech:window.__spoken.length,recordings:window.__recordings.length,queries:window.__dictionaryQueries.length}));
    await play();await page.waitForFunction(n=>window.__dictionaryQueries.length>n,beforeCancel.queries);await exitRound();
    await page.evaluate(()=>window.__pendingDictionary.forEach(pending=>pending.resolve()));await frame();await frame();
    assert.deepEqual(await page.evaluate(()=>({speech:window.__spoken.length,recordings:window.__recordings.length})),{speech:beforeCancel.speech,recordings:beforeCancel.recordings});
    pass('Leaving a round cancels an unresolved dictionary lookup; a late response cannot play a stale word');
    await page.reload();assert.equal(await page.getByRole('combobox',{name:'朗读内容',exact:true}).innerText(),dualOption);
    assert.equal(await page.getByRole('combobox',{name:'发音资源',exact:true}).inputValue(),'dictionary-us');
    pass('The selected dual dictation direction persists after reload');
    assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('listen-write-library-v1'))),seed);assert.deepEqual(errors,[]);
    pass('Seeded word groups remain byte-equivalent in local storage and no browser JavaScript exceptions occur');
  }catch(error){process.exitCode=1;if(page)try{await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});}catch(_){}console.error(error);}
  finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report(),null,2));console.log(JSON.stringify({passed:passed.length,output,success:!process.exitCode}));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
