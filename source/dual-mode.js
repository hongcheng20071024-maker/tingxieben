/* v5 combines spelling with one complete Chinese sense. Native G/y/Si/Wa are retained. */
const V5_CUE_KEY = 'listen-write-cue-v5';
function v5ReadCuePreference() {
  try {
    const cue = localStorage.getItem(V5_CUE_KEY);
    if (['english', 'chinese', 'meaning', 'dual'].includes(cue)) return cue;
  } catch (_) { /* A blocked store does not prevent practice. */ }
  return v4ReadCuePreference();
}
function v5SaveCuePreference(cue) {
  if (!['english', 'chinese', 'meaning', 'dual'].includes(cue)) return;
  try { localStorage.setItem(V5_CUE_KEY, cue); } catch (_) {}
}
function v5CueHasMeaning(cue) { return cue === 'meaning' || cue === 'dual'; }
function v5GradeDual(english, chinese, word, revealed = false) {
  const spellingCorrect = !revealed && Wa(english) === Wa(word.word);
  const meaningCorrect = !revealed && v4CheckMeaning(chinese, word.meaning);
  return {
    answer: revealed ? '未作答 / 查看答案' : english.trim(),
    meaningAnswer: revealed ? '未作答 / 查看答案' : chinese.trim(),
    spellingCorrect, meaningCorrect, correct: spellingCorrect && meaningCorrect,
    revealed: !!revealed
  };
}
function V5DualSetting({ paper, enabled, onChange }) {
  return (0, y.jsxs)(y.Fragment, { children: [
    (0, y.jsxs)('div', { className: 'v5-dual-notice', children: [
      (0, y.jsx)('strong', { children: '听英文，写英文和中文' }),
      (0, y.jsx)('p', { children: paper
        ? '在纸上或草稿纸写出英文和一种完整中文意思，结束后自行核对。'
        : '两项都要填写；英文拼写和一种完整中文意思都正确，才算这一词正确。' }),
      (0, y.jsxs)('details', { className: 'v5-grading-details', children: [
        (0, y.jsx)('summary', { children: paper ? '核对说明' : '判分说明' }),
        (0, y.jsx)('p', { children: '中文可答词库中的任意一种完整释义；如果填写多种意思，每一种都需要匹配。' }),
        (0, y.jsx)('p', { children: '例如 bank → bank + 银行。词库也包含“河岸”时，写“河岸”也可以。同义表达可在分组中补充。' })
      ] })
    ] }),
    !paper && (0, y.jsxs)('div', { className: 'v3-rewrite-setting', children: [
      (0, y.jsxs)('label', { className: 'v3-rewrite-option', children: [
        (0, y.jsx)('input', { type: 'checkbox', checked: enabled, 'aria-label': '英文拼写错后再写一遍',
          'aria-describedby': 'rewrite-setting-description', onChange: event => onChange(event.target.checked) }),
        (0, y.jsx)('span', { children: '英文拼写错后再写一遍' }),
        (0, y.jsx)('small', { children: '错词巩固' })
      ] }),
      (0, y.jsx)('p', { id: 'rewrite-setting-description', children: '拼写错或查看答案后，写对才能继续；仅中文错无需重写。按首次作答计分。' })
    ] })
  ] });
}
function V5DualInstruction() {
  return (0, y.jsx)('p', { id: 'dual-answer-description', className: 'v5-dual-instruction',
    children: '英文拼写和中文意思都要填写。中文答出词库中的任意一种完整意思即可。' });
}
function V5ChineseInput({ inputRef, value, onChange, disabled, composing, lastField }) {
  return (0, y.jsxs)(y.Fragment, { children: [
    (0, y.jsx)('label', { className: 'v5-answer-label', htmlFor: 'meaning-answer', children: '输入中文意思' }),
    (0, y.jsx)(Si, { ref: inputRef, id: 'meaning-answer', className: 'answer-input v5-meaning-input',
      autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'none', spellCheck: false,
      lang: 'zh-CN', inputMode: 'text', enterKeyHint: 'done',
      'aria-describedby': 'dual-answer-description', placeholder: '写出任意一种中文意思',
      value, disabled, onChange: event => onChange(event.target.value),
      onFocus: () => { lastField.current = 'meaning'; },
      onCompositionStart: () => { composing.current = true; },
      onCompositionEnd: () => { composing.current = false; },
      onBlur: () => { composing.current = false; },
      onKeyDown: event => {
        if (event.key === 'Enter' && (composing.current || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
      }
    })
  ] });
}
function v5DualPartStatus(record, part) {
  if (record?.revealed) return '已查看答案';
  if (part === 'english') return record?.spellingCorrect ? '正确' : '拼写不正确';
  return record?.meaningCorrect ? '正确' : '未匹配词库释义';
}
function V5DualVerdict({ record }) {
  return (0, y.jsxs)('div', { className: 'v5-dual-verdict', children: [
    [['english', '英文拼写', record?.spellingCorrect], ['meaning', '中文意思', record?.meaningCorrect]]
      .map(([part, label, correct]) => (0, y.jsx)('p', {
        'data-part': part, 'data-correct': !!correct, className: correct ? 'v5-part-correct' : 'v5-part-incorrect',
        children: label + '：' + v5DualPartStatus(record, part)
      }, part)),
    record && !record.meaningCorrect && !record.revealed && (0, y.jsx)('p', {
      className: 'v5-meaning-help', children: '请对照词库中的完整释义；同义表达可在分组中补充。'
    })
  ] });
}
function V5DualAnswers({ record, compact = false }) {
  if (!record) return null;
  return (0, y.jsxs)('div', { className: 'v5-dual-answers', children: [
    (0, y.jsxs)('small', { 'data-part': 'english', className: record.spellingCorrect ? 'v5-part-correct' : 'v5-part-incorrect',
      children: [!compact && (0, y.jsx)('span', { className: 'v5-answer-status', children: '英文拼写：' + v5DualPartStatus(record, 'english') + ' · ' }), '你的英文：', record.answer] }),
    (0, y.jsxs)('small', { 'data-part': 'meaning', className: record.meaningCorrect ? 'v5-part-correct' : 'v5-part-incorrect',
      children: [!compact && (0, y.jsx)('span', { className: 'v5-answer-status', children: '中文意思：' + v5DualPartStatus(record, 'meaning') + ' · ' }), '你的中文：', record.meaningAnswer] })
  ] });
}
function V5DualTotals({ records, total }) {
  return (0, y.jsxs)('p', { className: 'v5-dual-totals', children: [
    '英文拼写 ', records.filter(record => record.spellingCorrect).length, ' / ', total,
    ' · 中文意思 ', records.filter(record => record.meaningCorrect).length, ' / ', total,
    '；重写仅用于巩固，成绩按首次作答计算。'
  ] });
}
