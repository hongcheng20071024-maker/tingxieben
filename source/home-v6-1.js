/* v6.1 home: original Ag owns every library and practice setting.
 * Only visual expansion and keyboard visibility are local state here.
 */
function v61HomeInfo({ settings, groups, selected, words, missing, busy, loading, loadError }) {
  const count = groups.filter(group => selected.includes(group.id)).length;
  const needsMeaning = settings.cue === 'chinese' || v5CueHasMeaning(settings.cue);
  const missingCount = needsMeaning ? missing.length : 0;
  const direction = settings.cue === 'dual' ? '听英文 · 写英文和中文'
    : settings.cue === 'meaning' ? '听英文 · 写中文'
    : settings.cue === 'chinese' ? '听中文 · 写英文' : '听英文 · 写英文';
  const source = settings.cue === 'chinese' ? '设备中文语音'
    : settings.audioSource === 'dictionary-us' ? '在线美式录音'
    : settings.audioSource === 'dictionary-uk' ? '在线英式录音' : '设备语音';
  const rewrite = settings.mode === 'paper' ? '纸笔 · 自行核对'
    : settings.rewriteWrong ? '错词重写已开启' : '错词重写已关闭';
  const reason = loading ? '正在读取词库，请稍候。'
    : loadError ? '词库尚未加载，请重新加载后开始。'
    : busy ? '正在处理词库，请稍候。'
    : !count ? '先勾选一个或多个单词分组。'
    : !words.length ? '所选分组还没有单词，请编辑分组加入单词。'
    : missingCount ? `有 ${missingCount} 个词需补充中文释义，补全后再开始。` : '';
  return { count, total: words.length, missingCount, direction, source, rewrite, reason,
    meaningValidation: v5CueHasMeaning(settings.cue) };
}

function V61HomeSummary({ info, words, missing }) {
  return (0, y.jsxs)('div', { className: 'v61-home-summary', 'aria-label': '本轮练习摘要',
    'aria-live': 'polite', children: [
      (0, y.jsxs)('div', { className: 'v61-summary-top', children: [
        (0, y.jsx)('strong', { children: `${info.count} 组 · ${info.total} 个不重复单词` }),
        (0, y.jsx)('span', { children: info.rewrite })
      ] }),
      (0, y.jsxs)('p', { children: [info.direction, ' · ', info.source] }),
      info.missingCount > 0 && (0, y.jsx)('p', { className: 'v61-summary-warning', children:
        `${info.missingCount} 个词需补充${info.meaningValidation ? '可用于判分的' : ''}中文释义：${missing.slice(0, 3).map(word => word.word).join('、')}${info.missingCount > 3 ? '…' : ''}。本轮需全部补全后才能开始。` })
    ] });
}

function V61PracticeSetting({ cue, paper, enabled, onChange }) {
  const chinese = cue === 'meaning' || cue === 'dual';
  return (0, y.jsxs)('div', { className: 'v61-common-options', children: [
    !paper && (0, y.jsxs)('label', { className: 'v3-rewrite-option', children: [
      (0, y.jsx)('input', { type: 'checkbox', checked: enabled,
        'aria-label': '答错后再写一遍', 'aria-describedby': 'rewrite-setting-description',
        onChange: event => onChange(event.target.checked) }),
      (0, y.jsx)('span', { children: '答错后再写一遍' })
    ] }),
    (0, y.jsx)('p', { id: 'rewrite-setting-description', children: paper
      ? '在纸上或草稿纸作答，结束后自行核对。'
      : !enabled ? '按第一次作答计分，答后可直接继续。'
      : cue === 'dual' ? '只重写答错的项，成绩按第一次作答计算。'
      : '答错或查看答案后，写对再继续；成绩按第一次作答计算。' }),
    chinese && (0, y.jsxs)('details', { className: 'v61-grading-rules', children: [
      (0, y.jsx)('summary', { children: paper ? '核对说明' : '判分说明' }),
      (0, y.jsx)('p', { children: cue === 'dual'
        ? '英文拼写和一种完整中文意思都正确，才算这一词正确。'
        : '答出词库中的任意一种完整中文意思即可。' }),
      (0, y.jsx)('p', { children: '中文的“的／地”不区分；“得”仍按原字核对。填写多种意思时，每一种都需要匹配。同义表达可在分组中补充。' })
    ] })
  ] });
}

function V61StartDock({ info, hidden, startButton }) {
  const dock = (0, G.useRef)(null);
  (0, G.useEffect)(() => {
    const element = dock.current;
    const shell = element?.closest('.app-shell');
    if (!element || !shell) return;
    const update = () => shell.style.setProperty('--v61-dock-height', `${Math.ceil(element.getBoundingClientRect().height)}px`);
    shell.setAttribute('data-v61-home', 'true');
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      shell.removeAttribute('data-v61-home');
      shell.style.removeProperty('--v61-dock-height');
    };
  }, []);
  return (0, y.jsxs)('div', { ref: dock, className: 'v61-start-dock', 'data-hidden': !!hidden,
    'aria-label': '开始练习', children: [
      (0, y.jsxs)('div', { className: 'v61-dock-summary', children: [
        (0, y.jsx)('strong', { children: `${info.count} 组 · ${info.total} 词` }),
        (0, y.jsx)('span', { children: info.direction }),
        (0, y.jsx)('small', { children: `${info.rewrite} · ${info.source}` })
      ] }),
      info.reason && (0, y.jsx)('p', { id: 'v61-start-reason', className: 'v61-start-reason',
        role: 'status', children: info.reason }),
      startButton
    ] });
}

function V61GroupList({ count, children }) {
  const [expanded, setExpanded] = (0, G.useState)(false);
  return (0, y.jsxs)('div', { className: 'v61-group-container', children: [
    (0, y.jsx)('div', { id: 'v61-group-list', className: 'group-list',
      'data-expanded': expanded, children }),
    count > 3 && (0, y.jsxs)('div', { className: 'v61-group-list-footer', children: [
      (0, y.jsx)('span', { children: `共 ${count} 组，可在列表内滚动` }),
      (0, y.jsx)('button', { type: 'button', className: 'text-action',
        'aria-expanded': expanded, 'aria-controls': 'v61-group-list',
        onClick: () => setExpanded(value => !value), children: expanded ? '收起列表' : '展开列表' })
    ] })
  ] });
}

function V61PracticePanel(props) {
  const { settings: r, change: N, speech: g, modalOpen, startButton, sampleButton } = props;
  const info = v61HomeInfo(props);
  const [keyboardOpen, setKeyboardOpen] = (0, G.useState)(false);
  (0, G.useEffect)(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const update = () => {
      const active = document.activeElement;
      const editing = active && (active.matches('input:not([type=checkbox]):not([type=radio]),textarea') || active.isContentEditable);
      setKeyboardOpen(!!editing && window.innerHeight - viewport.height > 140);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    viewport.addEventListener('resize', schedule);
    window.addEventListener('resize', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, []);
  return (0, y.jsxs)('section', { className: 'practice-panel v61-practice-panel', children: [
    (0, y.jsxs)('div', { className: 'panel-title', children: [
      (0, y.jsxs)('div', { children: [(0, y.jsx)(bn, { size: 21 }), (0, y.jsx)('h2', { children: '开始一次听写' })] }),
      (0, y.jsx)('span', { className: 'pill', children: '专注练习' })
    ] }),
    (0, y.jsx)(V61HomeSummary, { info, words: props.words, missing: props.missing }),
    (0, y.jsx)(V61StartDock, { info, hidden: modalOpen || keyboardOpen, startButton }),
    (0, y.jsx)(yR, { className: 'mode-grid', value: r.mode, onValueChange: value => N('mode', value),
      'aria-label': '听写方式', children: ['keyboard', 'paper'].map(mode => (0, y.jsxs)('label', {
        className: 'mode-card ' + (r.mode === mode ? 'selected' : ''), children: [
          (0, y.jsxs)('div', { className: 'mode-top', children: [
            mode === 'keyboard' ? (0, y.jsx)(Zu, {}) : (0, y.jsx)(Po, {}),
            (0, y.jsx)(CR, { value: mode, 'aria-label': mode === 'keyboard' ? '键盘听写' : '纸笔听写' })
          ] }),
          (0, y.jsx)('strong', { children: mode === 'keyboard' ? '键盘听写' : '纸笔听写' }),
          (0, y.jsx)('span', { children: mode === 'paper' ? '连续播放，最后对答案'
            : r.cue === 'dual' ? '输入英文和中文，分别批改' : r.cue === 'meaning' ? '输入中文意思，即时批改' : '输入拼写，即时批改' })
        ] }, mode)) }),
    (0, y.jsx)('div', { className: 'settings v61-cue-setting', children: (0, y.jsx)(Ir, {
      label: '朗读内容', value: r.cue, change: value => N('cue', value), items: [
        ['english', '英文发音'], ['chinese', '中文释义 → 写英文'],
        ['meaning', '英文发音 → 写中文意思'], ['dual', '英文发音 → 写英文和中文']
      ] }) }),
    (0, y.jsx)(V61PracticeSetting, { cue: r.cue, paper: r.mode === 'paper', enabled: r.rewriteWrong,
      onChange: value => { v3SaveRewritePreference(value); N('rewriteWrong', value); } }),
    (0, y.jsxs)('details', { className: 'v61-more-settings', children: [
      (0, y.jsx)('summary', { children: '更多设置' }),
      (0, y.jsxs)('div', { className: 'settings', children: [
        (0, y.jsx)(Ir, { label: '语速', value: r.rate, change: value => N('rate', value),
          items: [['0.65', '慢速'], ['0.9', '正常'], ['1.1', '稍快']] }),
        r.mode === 'paper' && (0, y.jsxs)(y.Fragment, { children: [
          (0, y.jsx)(Ir, { label: '书写间隔', value: r.gap, change: value => N('gap', value),
            items: [['5', '5 秒'], ['8', '8 秒'], ['12', '12 秒'], ['20', '20 秒']] }),
          (0, y.jsx)(Ir, { label: '每词朗读', value: r.repeat, change: value => N('repeat', value),
            items: [['1', '1 遍'], ['2', '2 遍'], ['3', '3 遍']] })
        ] })
      ] }),
      (0, y.jsx)(V5AudioSetting, { source: r.audioSource,
        onChange: value => { g.cancel(); N('audioSource', value); },
        onPreview: () => g.speak('hello', r.accent, Number(r.rate), void 0, void 0, r.englishVoice) }),
      r.cue === 'chinese' && (0, y.jsx)('div', { className: 'voice-previews', children:
        (0, y.jsxs)('button', { type: 'button', className: 'text-action',
          onClick: () => g.speak('你好', 'zh-CN', Number(r.rate), void 0, void 0, r.chineseVoice),
          children: [(0, y.jsx)(lo, { size: 16 }), '试听中文'] }) }),
      (0, y.jsxs)('details', { className: 'voice-resources v5-advanced-voice', children: [
        (0, y.jsx)('summary', { children: '更多发音设置' }),
        (0, y.jsxs)('div', { className: 'settings', children: [
          (0, y.jsx)(Ir, { label: '自动选择时的英语口音', value: r.accent, change: value => N('accent', value),
            items: [['en-US', '美式优先'], ['en-GB', '英式优先']] }),
          (0, y.jsx)(Ir, { label: '英文音色', value: r.englishVoice || 'auto',
            change: value => { g.cancel(); N('englishVoice', value); }, items: em(g.voices, 'en', r.englishVoice) }),
          r.cue === 'chinese' && (0, y.jsx)(Ir, { label: '中文音色', value: r.chineseVoice || 'auto',
            change: value => { g.cancel(); N('chineseVoice', value); }, items: em(g.voices, 'zh', r.chineseVoice) })
        ] }),
        (0, y.jsx)('p', { children: '设备英语音色用于设备发音。在线录音以所选资源为准，回退时自动选择对应口音的设备声音；中文始终使用设备中文音色。' }),
        (0, y.jsx)('p', { children: '系统下载的声音以列表实际显示为准；标记“联网”的声音需要网络。' }),
        (0, y.jsxs)('div', { className: 'voice-resource-links', children: [
          (0, y.jsx)('a', { href: 'https://support.apple.com/en-gb/111798', target: '_blank', rel: 'noopener noreferrer', children: 'iPad / iPhone 添加声音 ↗' }),
          (0, y.jsx)('a', { href: 'https://support.microsoft.com/en-us/accessibility/windows/narrator/appendix-a-supported-languages-and-voices', target: '_blank', rel: 'noopener noreferrer', children: 'Windows 添加声音 ↗' })
        ] })
      ] }),
      (0, y.jsx)('div', { className: 'setting-row', children: (0, y.jsxs)('label', {
        className: 'check-label', children: [
          (0, y.jsx)(cf, { checked: r.random, onCheckedChange: value => N('random', value === true) }), '打乱顺序'
        ] }) })
    ] }),
    (0, y.jsx)(V5AudioStatus, { speech: g, showCredits: true }),
    g.error && (0, y.jsx)('p', { className: 'inline-error', role: 'alert', children: g.error }),
    (0, y.jsx)('p', { className: 'quiet-note', children: sampleButton })
  ] });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { v61HomeInfo };
