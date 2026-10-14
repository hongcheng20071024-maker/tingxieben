const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { v4CheckMeaning } = require('../source/meaning-grader-v6.js');
const source = fs.readFileSync(path.join(__dirname, '../source/correction-v6.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../source/听写本.html'), 'utf8');
const normalize = html.match(/var Wa=(.+?),br=/);
assert.ok(normalize, 'Use the app spelling normalizer');
const context = vm.createContext({ v4CheckMeaning });
vm.runInContext('var Wa=' + normalize[1] + ';\n' + source, context);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
const partCases = [
  ['english wrong', 'english', { correct: false }, true, false],
  ['English from Chinese wrong', 'chinese', { correct: false }, true, false],
  ['English correct', 'english', { correct: true }, false, false],
  ['Chinese correct', 'meaning', { correct: true }, false, false],
  ['Chinese wrong', 'meaning', { correct: false }, false, true],
  ['dual both right', 'dual', { spellingCorrect: true, meaningCorrect: true }, false, false],
  ['dual English wrong', 'dual', { spellingCorrect: false, meaningCorrect: true }, true, false],
  ['dual Chinese wrong', 'dual', { spellingCorrect: true, meaningCorrect: false }, false, true],
  ['dual both wrong', 'dual', { spellingCorrect: false, meaningCorrect: false }, true, true],
  ['dual revealed correct text', 'dual', { spellingCorrect: true, meaningCorrect: true, revealed: true }, true, true],
  ['Chinese revealed correct text', 'meaning', { correct: true, revealed: true }, false, true],
  ['English revealed correct text', 'chinese', { correct: true, revealed: true }, true, false],
  ['not graded', 'dual', undefined, false, false]
];
for (const [name, cue, record, english, meaning] of partCases) {
  const snapshot = JSON.stringify(record);
  if (record) Object.freeze(record);
  assert.deepEqual(plain(context.v6RewriteParts(cue, record)), { english, meaning }, name);
  assert.equal(JSON.stringify(record), snapshot, name + ' leaves first attempt unchanged');
  passed++;
}
const word = Object.freeze({ word: 'desperately', meaning: 'adv. 拼命地；不顾一切地' });
const gradeCases = [
  ['English only ignores absent Chinese', { english: true }, { english: 'DESPERATELY' }, {}, true, true],
  ['English typo stays wrong', { english: true }, { english: 'desperatly' }, {}, false, true],
  ['Chinese only accepts 的 for 地', { meaning: true }, { meaning: '拼命的' }, {}, true, true],
  ['Chinese alternative', { meaning: true }, { meaning: '不顾一切的' }, {}, true, true],
  ['Chinese does not accept substring', { meaning: true }, { meaning: '顾一切的' }, {}, true, false],
  ['Chinese does not accept unlisted synonym', { meaning: true }, { meaning: '绝望的' }, {}, true, false],
  ['both right', { english: true, meaning: true }, { english: 'desperately', meaning: '拼命的' }, {}, true, true],
  ['English right Chinese wrong', { english: true, meaning: true }, { english: 'desperately', meaning: '绝望的' }, {}, true, false],
  ['Chinese right English wrong', { english: true, meaning: true }, { english: 'desperatly', meaning: '拼命的' }, {}, false, true],
  ['keep successful English', { english: true, meaning: true }, { english: '', meaning: '拼命的' }, { english: true }, true, true],
  ['keep successful Chinese', { english: true, meaning: true }, { english: 'desperately', meaning: '' }, { meaning: true }, true, true],
  ['blank both', { english: true, meaning: true }, { english: '', meaning: '' }, {}, false, false],
  ['blank Chinese', { meaning: true }, { meaning: '  ' }, {}, true, false],
  ['Chinese mixed good and bad', { meaning: true }, { meaning: '拼命的;快乐的' }, {}, true, false]
];
for (const [name, parts, answers, accepted, english, meaning] of gradeCases) {
  const result = context.v6CheckRewrite(word, Object.freeze(parts), Object.freeze(answers), Object.freeze(accepted));
  assert.deepEqual(plain(result), { english, meaning, complete: english && meaning }, name);
  passed++;
}

// Exercise handlers and React state transitions. Full browser coverage lives in
// the v6 UI suite; this isolates duplicate submit and IME handling regressions.
function mount(parts) {
  const state = [];
  let cursor = 0;
  let completions = 0;
  let focused = '';
  const jsx = (type, props, key) => ({ type, props, key });
  const G = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect() {}
  };
  const ctx = vm.createContext({ v4CheckMeaning, G, y: { jsx, jsxs: jsx, Fragment: 'fragment' }, Si: 'input', me: 'button' });
  vm.runInContext('var Wa=' + normalize[1] + ';\n' + source, ctx);
  let tree;
  function all(node = tree) {
    if (!node || typeof node !== 'object') return [];
    const children = node.props?.children;
    return [node, ...(Array.isArray(children) ? children : [children]).filter(child => child != null).flatMap(all)];
  }
  function render() {
    cursor = 0;
    tree = ctx.V6RewriteAnswers({ word, parts, onComplete() { completions++; } });
    for (const node of all()) if (node.type === 'input') node.props.ref.current = { focus() { focused = node.props.id; } };
    return tree;
  }
  function input(part) { return all().find(node => node.props?.id === 'v6-rewrite-' + part); }
  function type(part, value) { input(part).props.onChange({ target: { value } }); render(); }
  function button() { return all().find(node => node.type === 'button'); }
  function enter(part, extras = {}) {
    const event = { key: 'Enter', repeat: false, nativeEvent: {}, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extras };
    input(part).props.onKeyDown(event);
    render();
    return event;
  }
  render();
  return { render, input, type, button, enter, all, get completions() { return completions; }, get focused() { return focused; } };
}
{
  const form = mount({ english: true, meaning: true });
  assert.equal(form.button().props.disabled, true);
  form.type('english', 'desperately');
  form.type('meaning', '快乐的');
  form.button().props.onClick(); form.render();
  assert.equal(form.input('english').props.readOnly, true);
  assert.equal(form.input('meaning').props.readOnly, false);
  assert.equal(form.input('meaning').props['aria-invalid'], true);
  assert.equal(form.completions, 0);
  assert.equal(form.focused, 'v6-rewrite-meaning');
  form.type('english', 'tampered');
  assert.equal(form.input('english').props.value, 'desperately', 'accepted field is sticky');
  form.type('meaning', '拼命的');
  const check = form.button().props.onClick;
  check(); check(); form.render();
  assert.equal(form.completions, 1, 'duplicate submit completes only once');
  assert.equal(form.input('english'), undefined, 'completion replaces inputs');
  passed++;
}
{
  const form = mount({ meaning: true });
  assert.equal(form.input('english'), undefined, 'no redundant English rewrite');
  form.type('meaning', '拼命的');
  form.input('meaning').props.onCompositionStart();
  const composingEnter = form.enter('meaning');
  assert.equal(composingEnter.prevented, false, 'IME can commit a candidate normally');
  assert.equal(composingEnter.stopped, true, 'IME does not trigger outer submission');
  assert.equal(form.completions, 0);
  form.input('meaning').props.onCompositionEnd();
  form.enter('meaning', { keyCode: 229 });
  assert.equal(form.completions, 0, 'Safari IME key guard');
  form.enter('meaning', { nativeEvent: { isComposing: true } });
  assert.equal(form.completions, 0, 'native composition guard');
  form.enter('meaning', { repeat: true });
  assert.equal(form.completions, 0, 'held Enter does not submit');
  form.enter('meaning');
  assert.equal(form.completions, 1);
  passed++;
}
{
  const form = mount({ english: true, meaning: true });
  form.type('english', 'desperately');
  form.enter('english');
  assert.equal(form.input('english').props.readOnly, true);
  assert.equal(form.focused, 'v6-rewrite-meaning', 'partial correction moves to missing field');
  assert.equal(form.completions, 0);
  form.type('meaning', '不顾一切的');
  form.enter('meaning');
  assert.equal(form.completions, 1);
  passed++;
}
console.log(`PASS ${passed} v6 correction checks`);
