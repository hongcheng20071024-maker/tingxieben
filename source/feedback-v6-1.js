/* Answer references and correction share the session's existing speech controller. */
function V61AttemptDetails({ word, record, cue, dictionary }) {
  return (0, y.jsxs)('details', { className: 'v61-attempt-details', children: [
    (0, y.jsx)('summary', { children: '查看本次作答' }),
    (0, y.jsxs)('div', { className: 'v61-attempt-body', children: [
      cue === 'dual'
        ? (0, y.jsxs)(y.Fragment, { children: [
          (0, y.jsx)(V5DualVerdict, { record }),
          (0, y.jsx)(V5DualAnswers, { record, compact: true })
        ] })
        : (0, y.jsxs)(y.Fragment, { children: [
          cue === 'meaning' && (0, y.jsx)(V4MeaningVerdict, { correct: record?.correct, revealed: record?.revealed }),
          (0, y.jsxs)('p', { children: ['你的答案：', record?.answer] })
        ] }),
      (0, y.jsx)('p', { className: 'v61-first-score', children: '本次成绩按第一次作答计算，重写用于巩固。' }),
      dictionary
    ] })
  ] });
}

function V61Reference({ word, record, cue, onSpeak, onSlow, dictionary, correcting = false }) {
  return (0, y.jsxs)('div', {
    className: 'feedback ' + (record?.correct ? 'correct' : 'incorrect') + ' v61-reference',
    'aria-label': '参考答案', children: [
      (0, y.jsx)('p', { className: 'v61-reference-label', children: correcting ? '对照答案，再写一遍' : '参考答案' }),
      (0, y.jsx)('strong', { className: 'v61-reference-word', lang: 'en', children: word.word }),
      word.meaning && (0, y.jsxs)('div', { className: 'v61-reference-meaning', children: [
        (0, y.jsx)('span', { children: '中文释义' }),
        (0, y.jsx)('p', { children: word.meaning })
      ] }),
      cue === 'dual' && !record?.revealed && (0, y.jsxs)('p', {
        className: 'v61-part-summary', role: 'status', children: [
          (0, y.jsx)('span', { className: record?.spellingCorrect ? 'is-right' : '', children: '首次英文' + (record?.spellingCorrect ? '正确' : '未通过') }),
          (0, y.jsx)('span', { className: record?.meaningCorrect ? 'is-right' : '', children: '首次中文' + (record?.meaningCorrect ? '正确' : '未通过') })
        ]
      }),
      (0, y.jsxs)('div', { className: 'feedback-audio', children: [
        (0, y.jsxs)(me, { variant: 'outline', type: 'button', onClick: onSpeak,
          children: [(0, y.jsx)(lo, { size: 16 }), '听英文发音'] }),
        (0, y.jsx)(me, { variant: 'ghost', type: 'button', onClick: onSlow, children: '慢速英文' })
      ] }),
      (0, y.jsx)(V61AttemptDetails, { word, record, cue, dictionary })
    ]
  });
}
