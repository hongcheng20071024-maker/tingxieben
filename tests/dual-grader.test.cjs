/* Exercise v5 with the original spelling normalizer and the unchanged Chinese grader. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {v4CheckMeaning, v4MeaningAlternatives} = require('../source/meaning-grader.js');
const html = fs.readFileSync(path.join(__dirname,'../source/听写本.html'),'utf8');
const normalize = html.match(/var Wa=(.+?),br=/);
assert.ok(normalize, 'Test must use the actual native spelling normalizer');
const storage = new Map();
const context = vm.createContext({v4CheckMeaning,
  v4ReadCuePreference:()=>storage.get('listen-write-cue-v4')||'english',
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
vm.runInContext('var Wa='+normalize[1]+';\n'+fs.readFileSync(path.join(__dirname,'../source/dual-mode.js'),'utf8'),context);
const grade = context.v5GradeDual;
const word = {word:'bank',meaning:'n. 银行；（河）岸'};
const cases = [
  ['both correct','bank','银行',true,true,false],
  ['alternate meaning','bank','河岸',true,true,false],
  ['English normalization',' ＢＡＮＫ ',' 岸。 ',true,true,false],
  ['meaning wrong','bank','苹果',true,false,false],
  ['spelling wrong','benk','银行',false,true,false],
  ['both wrong','benk','苹果',false,false,false],
  ['revealed correct text is still not an attempt','bank','银行',false,false,true],
  ['revealed empty text','','',false,false,true],
  ['blank English','','银行',false,true,false],
  ['blank Chinese','bank','',true,false,false],
  ['substring guess','bank','河',true,false,false],
  ['mixed wrong plus right','bank','银行；苹果',true,false,false],
  ['negation does not match','bank','不是银行',true,false,false],
  ['English instead of Chinese','bank','bank',true,false,false],
  ['unlisted synonym','bank','金融机构',true,false,false],
  ['HTML is not removed','bank','<b>银行</b>',true,false,false]
];
let passed=0;
for (const [name,english,chinese,spellingCorrect,meaningCorrect,revealed] of cases) {
  const result=grade(english,chinese,word,revealed);
  assert.equal(result.spellingCorrect,spellingCorrect,name+': English');
  assert.equal(result.meaningCorrect,meaningCorrect,name+': Chinese');
  assert.equal(result.correct,spellingCorrect&&meaningCorrect,name+': joint grade');
  assert.equal(result.revealed,revealed,name+': reveal');
  assert.equal(result.answer,revealed?'未作答 / 查看答案':english.trim(),name+': original English');
  assert.equal(result.meaningAnswer,revealed?'未作答 / 查看答案':chinese.trim(),name+': original Chinese');
  passed++;
}
for (const [english,chinese,word_] of [
  ["CAN’T",'不能',{word:"can't",meaning:'不能'}],
  ['look   after','照顾',{word:'look after',meaning:'照顾；照料'}],
  ['well-known','著名',{word:'well-known',meaning:'adj. 著名的'}]
]) {
  assert.equal(grade(english,chinese,word_).correct,true,'Native punctuation/phrase spelling');passed++;
}
const library=require('../library-backup-unit1.json');
for (const group of library.groups) for (const item of group.words) {
  for (const chinese of v4MeaningAlternatives(item.meaning)) {
    assert.equal(grade(item.word,chinese,item).correct,true,item.word+': textbook meaning');
    assert.equal(grade(item.word+'wrong',chinese,item).correct,false,item.word+': one correct part is insufficient');
  }
  passed++;
}
context.v5SaveCuePreference('dual');
assert.equal(context.v5ReadCuePreference(),'dual');
assert.equal(storage.has('listen-write-cue-v4'),false,'Combined cue never overwrites v4 preference');passed++;
context.v5SaveCuePreference('invalid');assert.equal(context.v5ReadCuePreference(),'dual');passed++;
storage.delete('listen-write-cue-v5');storage.set('listen-write-cue-v4','meaning');
assert.equal(context.v5ReadCuePreference(),'meaning','Existing direction can be inherited');passed++;
assert.equal(context.v5CueHasMeaning('dual'),true);assert.equal(context.v5CueHasMeaning('meaning'),true);
assert.equal(context.v5CueHasMeaning('english'),false);assert.equal(context.v5CueHasMeaning('chinese'),false);passed++;
console.log(`PASS ${passed} combined grading and preference checks (including every textbook word)`);
