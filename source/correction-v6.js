/* V6 correction uses the first-attempt result to choose only the wrong fields.
 * G/y/Si/me/Wa are the app's React, JSX, input, button and spelling helpers.
 * Correcting an answer never mutates that result, the library or the score.
 */
function v6RewriteParts(cue, record) {
  if (!record) return { english: false, meaning: false };
  const revealed = !!record.revealed;
  if (cue === 'dual') return {
    english: revealed || !record.spellingCorrect,
    meaning: revealed || !record.meaningCorrect
  };
  if (cue === 'meaning') return { english: false, meaning: revealed || !record.correct };
  return { english: revealed || !record.correct, meaning: false };
}

function v6CheckRewrite(word, parts, answers, accepted = {}) {
  const english = !parts.english || !!accepted.english
    || (typeof answers.english === 'string' && !!answers.english.trim() && Wa(answers.english) === Wa(word.word));
  const meaning = !parts.meaning || !!accepted.meaning
    || v4CheckMeaning(answers.meaning, word.meaning);
  return { english, meaning, complete: english && meaning };
}

function V6RewriteAnswers({ word, parts, onComplete }) {
  const [answers, setAnswers] = (0, G.useState)({ english: '', meaning: '' });
  const [accepted, setAccepted] = (0, G.useState)({ english: false, meaning: false });
  const [errors, setErrors] = (0, G.useState)({});
  const [finished, setFinished] = (0, G.useState)(false);
  const englishInput = (0, G.useRef)(null);
  const meaningInput = (0, G.useRef)(null);
  const composing = (0, G.useRef)({ english: false, meaning: false });
  const completed = (0, G.useRef)(false);
  const fields = [
    { key: 'english', label: '再写一次英文拼写', placeholder: '重新输入正确拼写', ref: englishInput, lang: 'en', maxLength: 200 },
    { key: 'meaning', label: '再写一次中文意思', placeholder: '写出词库中的一种完整中文意思', ref: meaningInput, lang: 'zh-CN', maxLength: 500 }
  ].filter(field => parts[field.key]);

  (0, G.useEffect)(() => {
    (parts.english ? englishInput : meaningInput).current?.focus();
  }, []);

  function check() {
    if (completed.current || composing.current.english || composing.current.meaning) return;
    const result = v6CheckRewrite(word, parts, answers, accepted);
    setAccepted({ english: result.english, meaning: result.meaning });
    setErrors({
      english: parts.english && !result.english ? '拼写还没写对，请对照上方正确单词再试一次。' : '',
      meaning: parts.meaning && !result.meaning ? '请写出词库中的一种完整中文意思，“的”和“地”都可以。' : ''
    });
    if (result.complete) {
      completed.current = true;
      setFinished(true);
      onComplete();
    } else {
      (parts.english && !result.english ? englishInput : meaningInput).current?.focus();
    }
  }

  return (0, y.jsxs)('section', {
    className: 'v6-rewrite-card' + (finished ? ' is-complete' : ''),
    'aria-label': '错词重写', children: [
      (0, y.jsxs)('div', { className: 'v6-rewrite-heading', children: [
        (0, y.jsx)('strong', { children: finished ? '这次写对了' : '再写一遍' }),
        (0, y.jsx)('span', { children: '只巩固写错的部分' })
      ] }),
      finished
        ? (0, y.jsx)('p', { className: 'v6-rewrite-success', role: 'status',
          children: '已完成重写，可以继续。成绩仍按第一次作答计算。' })
        : (0, y.jsxs)(y.Fragment, { children: [
          (0, y.jsx)('p', { id: 'v6-rewrite-description', children: parts.meaning
            ? '对照上方答案重写。中文写出一种完整意思即可，“的”和“地”不作区分。'
            : '对照上方正确单词，完整拼写一次。' }),
          ...fields.map((field, index) => (0, y.jsxs)('div', {
            className: 'v6-rewrite-field' + (accepted[field.key] ? ' is-accepted' : ''), children: [
              (0, y.jsxs)('label', { htmlFor: 'v6-rewrite-' + field.key, children: [
                field.label,
                accepted[field.key] && (0, y.jsx)('span', { role: 'status', children: '已写对' })
              ] }),
              (0, y.jsx)(Si, {
                ref: field.ref, id: 'v6-rewrite-' + field.key,
                className: 'answer-input v6-rewrite-input', value: answers[field.key],
                readOnly: accepted[field.key], 'aria-label': field.label,
                autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false,
                lang: field.lang, inputMode: 'text', enterKeyHint: index < fields.length - 1 ? 'next' : 'done',
                placeholder: field.placeholder, maxLength: field.maxLength,
                'aria-describedby': 'v6-rewrite-description' + (errors[field.key] ? ' v6-rewrite-error-' + field.key : ''),
                'aria-invalid': !!errors[field.key],
                onChange: event => {
                  if (accepted[field.key]) return;
                  setAnswers(previous => ({ ...previous, [field.key]: event.target.value }));
                  setErrors(previous => ({ ...previous, [field.key]: '' }));
                },
                onCompositionStart: () => { composing.current[field.key] = true; },
                onCompositionEnd: () => { composing.current[field.key] = false; },
                onBlur: () => { composing.current[field.key] = false; },
                onKeyDown: event => {
                  if (event.key !== 'Enter') return;
                  event.stopPropagation();
                  if (composing.current[field.key] || event.nativeEvent?.isComposing || event.keyCode === 229) return;
                  event.preventDefault();
                  if (!event.repeat) check();
                }
              }),
              errors[field.key] && (0, y.jsx)('p', { className: 'v6-rewrite-error',
                id: 'v6-rewrite-error-' + field.key, role: 'alert', children: errors[field.key] })
            ]
          }, field.key)),
          (0, y.jsxs)(me, { type: 'button', className: 'v6-rewrite-submit',
            'aria-label': '确认重写',
            disabled: !fields.some(field => !accepted[field.key] && answers[field.key].trim()),
            onClick: check, children: [
              '确认重写', (0, y.jsx)('span', { className: 'key-hint', children: 'Enter' })
            ] }),
          (0, y.jsx)('p', { className: 'v6-rewrite-score-note', children: '重写用于巩固，不改变第一次作答的成绩。' })
        ] })
    ]
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { v6RewriteParts, v6CheckRewrite, V6RewriteAnswers };
}
