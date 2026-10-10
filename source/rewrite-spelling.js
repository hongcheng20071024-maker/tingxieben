/* v3 native React components. The build places these in the existing app bundle.
 * G/y are that bundle's React/JSX runtime; Wa is its spelling normalizer.
 * Correction never changes the original attempt, score, word library or audio.
 */
const V3_REWRITE_KEY = 'listen-write-rewrite-wrong-v3';

function v3ReadRewritePreference() {
  try { return JSON.parse(localStorage.getItem(V3_REWRITE_KEY)) !== false; }
  catch (_) { return true; }
}

function v3SaveRewritePreference(enabled) {
  try { localStorage.setItem(V3_REWRITE_KEY, JSON.stringify(enabled)); }
  catch (_) { /* The selected option still works for the current page. */ }
}

function V3RewriteSetting({ enabled, mode, onChange }) {
  return (0, y.jsxs)('div', { className: 'v3-rewrite-setting', children: [
    (0, y.jsxs)('label', { className: 'v3-rewrite-option', children: [
      (0, y.jsx)('input', { type: 'checkbox', checked: enabled,
        'aria-label': '答错后再写一遍',
        onChange: event => onChange(event.target.checked),
        'aria-describedby': 'rewrite-setting-description' }),
      (0, y.jsx)('span', { children: '答错后再写一遍' }),
      (0, y.jsx)('small', { children: '错词巩固' })
    ] }),
    (0, y.jsx)('p', { id: 'rewrite-setting-description', children: mode === 'paper'
      ? '用于键盘听写；纸笔听写仍在本轮结束后自行核对。'
      : '答错或查看答案后，重新拼写正确才能继续。成绩按第一次作答计算。' })
  ] });
}

function V3RewriteSpelling({ word, onComplete }) {
  const [text, setText] = (0, G.useState)('');
  const [error, setError] = (0, G.useState)('');
  const [finished, setFinished] = (0, G.useState)(false);
  const input = (0, G.useRef)(null);
  const composing = (0, G.useRef)(false);
  const completed = (0, G.useRef)(false);

  (0, G.useEffect)(() => { input.current?.focus(); }, []);

  function check() {
    if (completed.current || composing.current || !text.trim()) return;
    if (Wa(text) !== Wa(word)) {
      setError('还没写对，请对照正确拼写再试一次。');
      input.current?.focus();
      return;
    }
    completed.current = true;
    setFinished(true);
    setError('');
    onComplete();
  }

  return (0, y.jsxs)('section', {
    className: 'v3-rewrite-card' + (finished ? ' is-complete' : ''),
    'aria-label': '错词重新拼写', children: [
      (0, y.jsxs)('div', { className: 'v3-rewrite-heading', children: [
        (0, y.jsx)('strong', { children: finished ? '这次写对了' : '再写一遍' }),
        (0, y.jsx)('span', { children: '巩固拼写' })
      ] }),
      finished
        ? (0, y.jsx)('p', { className: 'v3-rewrite-success', role: 'status',
          children: '已完成重写，可以继续。这个词仍会留在本轮错词中。' })
        : (0, y.jsxs)(y.Fragment, { children: [
          (0, y.jsx)('p', { id: 'rewrite-description',
            children: '对照上方正确单词，完整拼写一次。' }),
          (0, y.jsx)('label', { className: 'sr-only', htmlFor: 'rewrite-answer',
            children: '再写一次英文拼写' }),
          (0, y.jsx)(Si, { ref: input, id: 'rewrite-answer',
            className: 'answer-input v3-rewrite-input', value: text,
            autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none',
            spellCheck: false, lang: 'en', inputMode: 'text', enterKeyHint: 'done',
            placeholder: '重新输入正确拼写', maxLength: 200,
            'aria-describedby': 'rewrite-description' + (error ? ' rewrite-error' : ''),
            'aria-invalid': !!error,
            onChange: event => { setText(event.target.value); setError(''); },
            onCompositionStart: () => { composing.current = true; },
            onCompositionEnd: () => { composing.current = false; },
            onKeyDown: event => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (event.repeat || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
              check();
            }
          }),
          error && (0, y.jsx)('p', { className: 'v3-rewrite-error', id: 'rewrite-error',
            role: 'alert', children: error }),
          (0, y.jsxs)(me, { type: 'button', className: 'v3-rewrite-submit',
            'aria-label': '确认重写',
            disabled: !text.trim(), onClick: check, children: [
              '确认重写', (0, y.jsx)('span', { className: 'key-hint', children: 'Enter' })
            ] })
        ] })
    ]
  });
}
