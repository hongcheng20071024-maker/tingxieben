/* Focused V6.1 regressions against the actual injected correction component.
 * A small hook harness isolates keyboard handlers; rendered-browser tests cover
 * real DOM focus, React batching, layout and integration with first scores.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { v4CheckMeaning } = require('../source/meaning-grader-v6.js');
const source = fs.readFileSync(path.join(__dirname, '../source/correction-v6-1.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../source/听写本.html'), 'utf8');
const normalizer = html.match(/var Wa=(.+?),br=/);
assert.ok(normalizer, 'Use the app spelling normalizer');
const word = Object.freeze({ word: 'desperately', meaning: 'adv. 拼命地；不顾一切地' });
const reference = { type: 'reference', props: { children: 'desperately / 拼命地' } };
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

function mount(parts) {
  const state = [];
  let cursor = 0, completions = 0, focused = '', tree;
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
  vm.runInContext('var Wa=' + normalizer[1] + ';\n' + source, ctx);
  function all(node = tree) {
    if (!node || typeof node !== 'object') return [];
    const children = node.props?.children;
    return [node, ...(Array.isArray(children) ? children : [children]).filter(child => child != null).flatMap(all)];
  }
  function render() {
    cursor = 0;
    tree = ctx.V61RewriteAnswers({ word, parts, reference, onComplete() { completions++; } });
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
  function confirm() { button().props.onClick(); render(); }
  render();
  return { render, input, type, button, enter, confirm, all, ctx,
    get completions() { return completions; }, get focused() { return focused; } };
}

test('First Enter moves to Chinese without grading either field or reporting an empty answer', () => {
  const form = mount({ english: true, meaning: true });
  form.type('english', 'desperately');
  assert.equal(form.input('english').props.enterKeyHint, 'next');
  const event = form.enter('english');
  assert.equal(event.stopped, true);
  assert.equal(event.prevented, true);
  assert.equal(form.focused, 'v6-rewrite-meaning');
  assert.equal(form.input('english').props.readOnly, false, 'Navigation does not grade English');
  assert.equal(form.input('english').props['aria-invalid'], false);
  assert.equal(form.input('meaning').props['aria-invalid'], false);
  assert.equal(form.completions, 0);
  form.type('meaning', '拼命的');
  form.enter('meaning');
  assert.equal(form.completions, 1);
});

test('A typo survives navigation and is rejected on the final Enter; an accepted Chinese field is skipped', () => {
  const form = mount({ english: true, meaning: true });
  form.type('english', 'desperatly');
  form.enter('english');
  assert.equal(form.input('english').props['aria-invalid'], false);
  form.type('meaning', '不顾一切的');
  form.enter('meaning');
  assert.equal(form.input('english').props['aria-invalid'], true);
  assert.equal(form.input('meaning').props.readOnly, true);
  assert.equal(form.focused, 'v6-rewrite-english');
  assert.equal(form.input('english').props.enterKeyHint, 'done');
  form.type('meaning', '试图改掉已通过项');
  assert.equal(form.input('meaning').props.value, '不顾一切的');
  form.type('english', 'desperately');
  form.enter('english');
  assert.equal(form.completions, 1, 'Only the remaining field needs confirmation');
});

test('Explicit confirmation checks all fields and keeps an accepted English field locked', () => {
  const form = mount({ english: true, meaning: true });
  assert.equal(form.button().props.disabled, true);
  form.type('english', 'desperately');
  form.confirm();
  assert.equal(form.input('english').props.readOnly, true);
  assert.equal(form.input('meaning').props['aria-invalid'], true);
  assert.equal(form.focused, 'v6-rewrite-meaning');
  form.type('english', 'tampered');
  assert.equal(form.input('english').props.value, 'desperately');
  form.enter('english');
  assert.equal(form.focused, 'v6-rewrite-meaning', 'A readonly field can only move to the next pending field');
  assert.equal(form.completions, 0);
  form.type('meaning', '拼命的');
  form.enter('meaning');
  assert.equal(form.completions, 1);
});

test('Single English correction confirms on Enter', () => {
  const form = mount({ english: true });
  assert.equal(form.input('meaning'), undefined);
  assert.equal(form.input('english').props.enterKeyHint, 'done');
  form.type('english', 'DESPERATELY');
  form.enter('english');
  assert.equal(form.completions, 1);
});

test('Single Chinese correction keeps full-meaning grading and 的/地 compatibility', () => {
  const form = mount({ meaning: true });
  assert.equal(form.input('english'), undefined);
  form.type('meaning', '顾一切的');
  form.enter('meaning');
  assert.equal(form.input('meaning').props['aria-invalid'], true, 'A substring cannot pass');
  form.type('meaning', '不顾一切的');
  form.enter('meaning');
  assert.equal(form.completions, 1);
});

test('Composition, Safari key code and held Enter cannot navigate or submit', () => {
  const form = mount({ english: true, meaning: true });
  form.type('english', 'desperately');
  form.input('english').props.onCompositionStart();
  const composing = form.enter('english');
  assert.equal(composing.prevented, false, 'Candidate selection keeps its default behavior');
  assert.equal(composing.stopped, true, 'The outer form does not see candidate Enter');
  assert.equal(form.focused, '');
  form.input('english').props.onCompositionEnd();
  form.enter('english', { keyCode: 229 });
  form.enter('english', { nativeEvent: { isComposing: true } });
  form.enter('english', { repeat: true });
  assert.equal(form.focused, '');
  form.enter('english');
  form.type('meaning', '拼命的');
  form.input('meaning').props.onCompositionStart();
  form.confirm();
  assert.equal(form.completions, 0, 'Explicit submit is also blocked during composition');
  form.input('meaning').props.onCompositionEnd();
  form.enter('meaning', { repeat: true });
  assert.equal(form.completions, 0);
  form.enter('meaning');
  assert.equal(form.completions, 1);
});

test('Repeated final submit completes once, replaces inputs and keeps reference available', () => {
  const form = mount({ meaning: true });
  form.type('meaning', '拼命的');
  const check = form.button().props.onClick;
  check(); check(); form.render();
  assert.equal(form.completions, 1);
  assert.equal(form.input('meaning'), undefined);
  assert.equal(form.all().some(node => node.props?.className === 'v61-rewrite-inputs'), false);
  assert.equal(form.all().some(node => node.props?.className === 'v61-rewrite-reference'), true);
  assert.match(form.all().find(node => node.props?.className === 'v6-rewrite-success').props.children, /第一次作答/);
});

test('First-attempt records choose wrong fields without mutation, including revealed answers', () => {
  const form = mount({ english: true });
  const plain = value => JSON.parse(JSON.stringify(value));
  const englishWrong = Object.freeze({ spellingCorrect: false, meaningCorrect: true, correct: false });
  const meaningWrong = Object.freeze({ spellingCorrect: true, meaningCorrect: false, correct: false });
  const revealed = Object.freeze({ spellingCorrect: true, meaningCorrect: true, correct: false, revealed: true });
  assert.deepEqual(plain(form.ctx.v6RewriteParts('dual', englishWrong)), { english: true, meaning: false });
  assert.deepEqual(plain(form.ctx.v6RewriteParts('dual', meaningWrong)), { english: false, meaning: true });
  assert.deepEqual(plain(form.ctx.v6RewriteParts('dual', revealed)), { english: true, meaning: true });
  assert.equal(englishWrong.correct, false);
  assert.equal(meaningWrong.correct, false);
  assert.equal(revealed.correct, false);
});

console.log(`PASS ${passed} focused v6.1 correction regressions`);
