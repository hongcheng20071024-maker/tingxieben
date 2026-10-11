/* v4 native React integration. G/y belong to the original application bundle. */
const V4_CUE_KEY = 'listen-write-cue-v4';

function v4ReadCuePreference() {
  try {
    const cue = localStorage.getItem(V4_CUE_KEY);
    return ['english', 'chinese', 'meaning'].includes(cue) ? cue : 'english';
  } catch (_) { return 'english'; }
}

function v4SaveCuePreference(cue) {
  if (!['english', 'chinese', 'meaning'].includes(cue)) return;
  try { localStorage.setItem(V4_CUE_KEY, cue); }
  catch (_) { /* The current selection still works when storage is unavailable. */ }
}

function v4MissingMeanings(words) {
  return words.filter(word => !v4MeaningAlternatives(word.meaning).some(value => /[\p{Script=Han}]/u.test(value)));
}

function V4MeaningNotice({ compact = false, paper = false }) {
  if (compact) return (0, y.jsx)('p', {
    className: 'v4-meaning-instruction', id: 'meaning-answer-description',
    children: '答出词库中的任意一种完整中文意思即可。'
  });
  return (0, y.jsxs)('div', {
    className: 'v4-meaning-notice',
    children: [
      (0, y.jsx)('strong', { children: '答出一种意思即可' }),
      (0, y.jsx)('p', {
        children: paper
          ? '听英文，在纸上或草稿纸写出一种完整中文意思，结束后自行核对。'
          : '听英文，写出词库中任意一种完整中文意思即可。' }),
      (0, y.jsx)('p', {
        children: '多种释义可用分号、逗号或顿号分隔，例如“银行；河岸”。可以在分组中补充同义表达。' })
    ]
  });
}

function V4MeaningVerdict({ correct, revealed }) {
  return (0, y.jsx)('p', {
    className: 'v4-meaning-verdict',
    children: correct ? '回答正确，已匹配词库释义。'
      : revealed ? '已查看答案，本词会加入本轮错词。'
      : '未匹配到词库释义；同义表达可在分组中补充。'
  });
}
