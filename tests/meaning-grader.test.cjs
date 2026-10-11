const assert = require('node:assert/strict');
const { v4MeaningAlternatives, v4CheckMeaning } = require('../source/meaning-grader.js');

const cases = [
  ['accept first meaning', '拼命地', '拼命地;不顾一切地', true],
  ['accept second meaning', '不顾一切地', '拼命地;不顾一切地', true],
  ['omit final 地', '不顾一切', '拼命地;不顾一切地', true],
  ['omit final 的', '卑微', '低下的,卑微的', true],
  ['keep internal 的', '人的尊严', '人的尊严', true],
  ['internal 的 is meaningful', '人尊严', '人的尊严', false],
  ['comma-separated meaning', '女主人公', '女主角,女主人公', true],
  ['fullwidth comma', '女主角', '女主角，女主人公', true],
  ['all separator forms', '向往', '渴望；盼望,期望，向往、想念/希望／憧憬|企盼｜等待\n想要', true],
  ['all answers may be correct', '需要;有赖于', 'vt.需要；有赖于', true],
  ['one correct plus wrong does not pass', '需要;放弃', 'vt.需要；有赖于', false],
  ['one correct plus contrary does not pass', '需要，不需要', '需要;有赖于', false],
  ['reverse containment is not enough', '不需要', '需要;有赖于', false],
  ['truncated meaning is not enough', '需', '需要;有赖于', false],
  ['prefix guessing is not enough', '有赖', '需要;有赖于', false],
  ['unlisted synonym is not guessed', '必需', '需要;有赖于', false],
  ['a single character may be valid', '岸', 'n. 银行；（河）岸', true],
  ['optional prefix composed with meaning', '河岸', 'n. 银行；（河）岸', true],
  ['optional prefix is not an answer by itself', '河', 'n. 银行；（河）岸', false],
  ['another single-character definition', '热', 'adj. 热；温暖的', true],
  ['part-of-speech labels', '热情', 'adj. 热情的；adv. 热情地', true],
  ['combined part-of-speech labels', '倚靠', 'n. 银行； vt./vi. 倚靠', true],
  ['numbered meanings', '有赖于', '1. vt. 需要；(2) 有赖于', true],
  ['circled numbering', '卓越', '①引人注目的；②卓越的', true],
  ['Chinese numbering', '非凡', '一、非凡的；二、令人惊奇的', true],
  ['Chinese part-of-speech labels', '银行', '名词：银行；动词：倚靠', true],
  ['NFKC input', 'ａｄｊ． 热情的', 'adj. 热情的', true],
  ['whitespace and punctuation', '  女 主 人 公。 ', '女主角,女主人公', true],
  ['formatting characters', '需\u200b要', '需要', true],
  ['quotation marks', '“需要”', '需要', true],
  ['unmarked brackets are not standalone aliases', '女主人公', '女主角（女主人公）', false],
  ['explicit synonym', '敲打', '打击（又作敲打）', true],
  ['single-character explicit synonym', '烫', '热（也称烫）', true],
  ['several bracket synonyms', '女英雄', '女主角（又称女主人公、女英雄）', true],
  ['grammar note is removed', '迅速', 'adv. 迅速地（用于动作）', true],
  ['grammar note is not an answer', '用于动作', 'adv. 迅速地（用于动作）', false],
  ['object note is not an answer', '某物', '需要（某物）', false],
  ['register note is not an answer', '正式', '卓越的（正式）', false],
  ['grammar label is not an answer', '不可数', '尊严（不可数）', false],
  ['guess hidden in answer brackets is rejected', '需要（不需要）', '需要', false],
  ['standalone ambiguous brackets are not guessed', '银行', '（银行）', false],
  ['standalone annotation in brackets', '正式', '（正式）', false],
  ['no invented subword synonym', '主角', '女主角,女主人公', false],
  ['punctuation inside a word is not ignored', '需-要', '需要', false],
  ['no automatic traditional Chinese conversion', '銀行', '银行', false],
  ['empty answer', '', '需要', false],
  ['whitespace answer', ' \u200b ', '需要', false],
  ['punctuation answer', '；，。、|', '需要', false],
  ['empty definition', '需要', '', false],
  ['part-of-speech only is not a definition', 'n', 'n.', false],
  ['null answer', null, '需要', false],
  ['non-string definition', '需要', {}, false],
  ['large input rejected safely', '需'.repeat(12001), '需要', false],
  ['HTML is not stripped into a correct answer', '<b>需要</b>', '需要', false],
  ['bracket weather annotation is not a synonym', '天气', '晴朗的（天气）', false],
  ['suffix object annotations are not composed into meanings', '晴朗的天气', '晴朗的（天气）', false],
  ['bracket contrary annotation is not a synonym', '不重要', '重要的（不重要）', false],
  ['long grammar annotation is not a synonym', '通常用于动作', '迅速地（通常用于动作）', false],
  ['single-character object annotation is not a synonym', '人', '热情的（人）', false],
  ['unlabelled 目的 is a noun', '目', '目的', false],
  ['unlabelled 土地 is a noun', '土', '土地', false],
  ['unlabelled 目的地 is a noun', '目的', '目的地', false],
  ['noun part-of-speech keeps final 地', '租', 'n. 租地', false],
  ['verb part-of-speech keeps final 地', '落', 'v. 落地', false],
  ['noun after numbering', '目', '1. n. 目的', false],
  ['retain meaningful noun with 地', '土地', 'n. 土地', true],
  ['English definition does not become Chinese meaning', 'abc', 'abc', false],
  ['mixed Chinese and English definition', '3D影像', '3D影像', true],
  ['numeric definition does not become Chinese meaning', '123', '123', false],
  ['English-only part-of-speech definition is empty', 'thing', 'n. thing', false],
  ['mixed Chinese technical definition', 'pH值', 'pH值', true],
  ['combined noun and verb labels', '影响', 'n. & v. 影响', true],
  ['combined adjective and adverb labels', '清楚', 'adj. & adv. 清楚地', true],
  ['combined labels with a plus', '影响', 'n.+v. 影响', true],
  ['combined labels with and', '影响', 'n. and v. 影响', true],
  ['combined labels do not hide a wrong answer', '放弃', 'n. & v. 影响', false],
  ['adjacent circled first sense', '银行', '①银行②河岸', true],
  ['adjacent circled later sense', '河岸', '①银行②河岸', true],
  ['adjacent numbered senses are not one meaning', '银行河岸', '①银行②河岸', false],
  ['Chinese list marker is not an answer', '一', '一、非凡的；二、令人惊奇的', false],
  ['Chinese later list marker is not an answer', '二', '一、非凡的；二、令人惊奇的', false],
  ['Chinese marker after POS is not an answer', '一', 'adj. 一、非凡的；二、令人惊奇的', false],
  ['Chinese marker after POS keeps meaning', '非凡', 'adj. 一、非凡的；二、令人惊奇的', true],
  ['existing textbook colon first sense', '环境', '环境:境遇', true],
  ['existing textbook colon second sense', '境遇', '环境:境遇', true],
  ['fullwidth colon between meanings', '境遇', 'n. 环境：境遇', true],
  ['colon does not make POS an answer', '名词', '名词：环境', false],
  ['colon POS still accepts meaning', '环境', '名词：环境', true],
  ['colon does not make subject label an answer', '物理', '物理：力', false],
  ['colon does not make metadata label an answer', '释义', '释义：环境', false],
  ['colon does not make annotation an answer', '用于动作', '迅速地（用于：动作）', false],
  ['colon-separated wrong guess is rejected', '环境：银行', '环境:境遇', false],
];

let passed = 0;
for (const [name, answer, meaning, expected] of cases) {
  assert.equal(v4CheckMeaning(answer, meaning), expected, name);
  passed += 1;
}
assert.deepEqual(v4MeaningAlternatives('拼命地;不顾一切地'), ['拼命地', '拼命', '不顾一切地', '不顾一切']);
passed += 1;
assert.deepEqual(v4MeaningAlternatives(null), []);
passed += 1;
assert.deepEqual(v4MeaningAlternatives('adj.；v.'), []);
passed += 1;

const library = require('../library-backup-unit1.json');
for (const group of library.groups) {
  for (const word of group.words) {
    const alternatives = v4MeaningAlternatives(word.meaning);
    assert.ok(alternatives.length, `${word.word} has a usable meaning`);
    for (const answer of alternatives) assert.equal(v4CheckMeaning(answer, word.meaning), true, `${word.word}: ${answer}`);
    passed += 1;
  }
}

console.log(`PASS ${passed} Chinese meaning grading checks`);
