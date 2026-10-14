/* v6 integrates the same saved preferences with all keyboard practice directions. */
function V6PracticeSetting({ cue, paper, enabled, onChange }) {
  const meaning = cue === 'meaning' || cue === 'dual';
  return (0, y.jsxs)(y.Fragment, { children: [
    meaning && (0, y.jsxs)('div', { className: 'v5-dual-notice', children: [
      (0, y.jsx)('strong', { children: cue === 'dual' ? '听英文，写英文和中文' : '听英文，写出一种中文意思' }),
      (0, y.jsx)('p', { children: paper
        ? (cue === 'dual' ? '在纸上或草稿纸写出英文和一种完整中文意思，结束后自行核对。' : '在纸上或草稿纸写出一种完整中文意思，结束后自行核对。')
        : (cue === 'dual' ? '两项都要填写；英文和一种完整中文意思都正确，才算这一词正确。' : '答出词库中的任意一种完整中文意思即可。') }),
      (0, y.jsxs)('details', { className: 'v5-grading-details', children: [
        (0, y.jsx)('summary', { children: paper ? '核对说明' : '判分说明' }),
        (0, y.jsx)('p', { children: '中文的“的／地”不区分。例如“认真地”和“认真的”都可匹配；“得”仍按原字核对。' }),
        (0, y.jsx)('p', { children: '中文可答词库中的任意一种完整释义；如果填写多种意思，每一种都需要匹配。同义表达可在分组中补充。' })
      ] })
    ] }),
    !paper && (0, y.jsxs)('div', { className: 'v3-rewrite-setting', children: [
      (0, y.jsxs)('label', { className: 'v3-rewrite-option', children: [
        (0, y.jsx)('input', { type: 'checkbox', checked: enabled, 'aria-label': '答错后再写一遍',
          'aria-describedby': 'rewrite-setting-description', onChange: event => onChange(event.target.checked) }),
        (0, y.jsx)('span', { children: '答错后再写一遍' }),
        (0, y.jsx)('small', { children: '错词巩固' })
      ] }),
      (0, y.jsx)('p', { id: 'rewrite-setting-description', children: cue === 'dual'
        ? '英文错就重写英文，中文错就重写中文；两项都错则都要重写。查看答案后也需重写，成绩按首次作答计算。'
        : cue === 'meaning' ? '答错或查看答案后，再写对一种中文意思才能继续。成绩按首次作答计算。'
        : '答错或查看答案后，再写对英文拼写才能继续。成绩按首次作答计算。' })
    ] })
  ] });
}

function v6PracticeTitle(cue, checked, record, rewrite, complete) {
  if (!checked) return cue === 'dual' ? '听英文，写英文和中文意思'
    : cue === 'meaning' ? '听英文，写出一种中文意思'
    : cue === 'chinese' ? '听中文释义，写出对应的英文' : '听一听，写出你听到的单词';
  if (record?.correct) return cue === 'dual' ? '英文和中文都正确！' : cue === 'meaning' ? '意思正确！' : '拼写正确！';
  if (!rewrite) return '对照正确答案，再记一次';
  if (complete) return '已经写对，继续练习';
  const parts = v6RewriteParts(cue, record);
  return parts.english && parts.meaning ? '再写一遍英文和中文意思'
    : parts.meaning ? '再写一遍，记住中文意思' : '再写一遍，记住英文拼写';
}
