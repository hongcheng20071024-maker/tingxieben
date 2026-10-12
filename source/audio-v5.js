/* v5 pronunciation resources. G/y and bg are provided by the original bundle. */
const V5_AUDIO_KEY = 'listen-write-audio-source-v5';
const V5_AUDIO_SOURCES = ['device', 'dictionary-us', 'dictionary-uk'];
const V5_AUDIO_CACHE = new Map();

function v5AudioSource(value) {
  return V5_AUDIO_SOURCES.includes(value) ? value : 'device';
}

function v5ReadAudioPreference() {
  try { return v5AudioSource(localStorage.getItem(V5_AUDIO_KEY)); }
  catch (_) { return 'device'; }
}

function v5SaveAudioPreference(value) {
  if (!V5_AUDIO_SOURCES.includes(value)) return;
  try { localStorage.setItem(V5_AUDIO_KEY, value); }
  catch (_) { /* The current selection remains usable without storage. */ }
}

function v5AudioWord(value) {
  if (typeof value !== 'string' || value.length > 80) return '';
  const word = value.normalize('NFKC').trim().toLowerCase()
    .replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  return /^[a-z]+(?:[ '\-][a-z]+)*$/.test(word) ? word : '';
}

function v5AudioUrl(value, host, prefix) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.username &&
      !url.password && !url.port && url.pathname.startsWith(prefix) ? url.href : '';
  } catch (_) { return ''; }
}

function v5RecordingAccent(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').toLowerCase();
    if (/(?:^|[-_])us(?:[-_.]|$)/.test(name)) return 'us';
    if (/(?:^|[-_])(?:uk|gb)(?:[-_.]|$)/.test(name)) return 'uk';
  } catch (_) { /* An unknown accent must not be presented as US or UK. */ }
  return '';
}

function v5RecordingCandidates(data, word) {
  const recordings = [];
  const expected = v5AudioWord(word);
  if (!expected || !Array.isArray(data)) return recordings;
  for (const entry of data.slice(0, 32)) {
    if (v5AudioWord(entry?.word) !== expected || !Array.isArray(entry.phonetics)) continue;
    for (const phonetic of entry.phonetics.slice(0, 32)) {
      const audio = v5AudioUrl(phonetic?.audio, 'api.dictionaryapi.dev', '/media/pronunciations/en/');
      const source = v5AudioUrl(phonetic?.sourceUrl, 'commons.wikimedia.org', '/');
      const licenseUrl = v5AudioUrl(phonetic?.license?.url, 'creativecommons.org', '/licenses/') ||
        v5AudioUrl(phonetic?.license?.url, 'creativecommons.org', '/publicdomain/');
      const licenseName = typeof phonetic?.license?.name === 'string'
        ? phonetic.license.name.trim().slice(0, 80) : '';
      const accent = v5RecordingAccent(audio);
      if (!audio || !source || !licenseUrl || !licenseName || !accent || recordings.some(item => item.audio === audio)) continue;
      recordings.push({ audio, source, licenseUrl, licenseName, accent });
      if (recordings.length >= 20) return recordings;
    }
  }
  return recordings;
}

/* Dependency injection keeps cancellation, stale responses and fallback testable. */
function v5CreateAudioController({ getNative, fetcher, makeAudio, onState,
  setTimer = setTimeout, clearTimer = clearTimeout, makeAbort = () => new AbortController(),
  cache = V5_AUDIO_CACHE, requestTimeout = 6000, startTimeout = 6000, playbackTimeout = 30000 }) {
  let generation = 0;
  let request = null;
  let media = null;
  let deadline = null;
  let requestDeadline = null;
  let pendingReject = null;
  let state = { speaking: false, loading: false, notice: '', recording: null, recordingsUsed: [] };

  const update = values => { state = { ...state, ...values }; onState?.(state); };
  const clearDeadline = () => { if (deadline !== null) clearTimer(deadline); deadline = null; };
  const clearRequestDeadline = () => {
    if (requestDeadline !== null) clearTimer(requestDeadline);
    requestDeadline = null;
  };
  const stopMedia = () => {
    clearDeadline();
    if (!media) return;
    const audio = media;
    media = null;
    audio.onplaying = null;
    audio.onended = null;
    audio.onerror = null;
    try { audio.pause(); audio.removeAttribute?.('src'); audio.load?.(); }
    catch (_) { /* Cleanup must not interfere with leaving a practice round. */ }
  };
  function cancel(clearRecording = false) {
    generation += 1;
    request?.abort();
    request = null;
    clearRequestDeadline();
    if (pendingReject) pendingReject(new Error('cancelled'));
    pendingReject = null;
    stopMedia();
    getNative().cancel();
    // Grading stops playback, but keeps the heard recording's credit available.
    // A new playback or source selection clears it before another word is loaded.
    update({ speaking: false, loading: false,
      ...(clearRecording === true ? { notice: '', recording: null } : {}) });
  }

  function clearError() {
    getNative().clearError();
    update({ notice: '' });
  }

  async function speak(sourceValue, text, language, rate, onEnd, onError, voice = 'auto') {
    cancel(true);
    getNative().clearError();
    const current = generation;
    const source = v5AudioSource(sourceValue);
    const english = /^en(?:-|$)/i.test(language || '');
    const word = v5AudioWord(text);
    const accent = source === 'dictionary-uk' ? 'uk' : 'us';
    let delivered = false;
    const deliver = callback => {
      if (generation !== current || delivered) return;
      delivered = true;
      callback?.();
    };
    const native = (notice = '') => {
      if (generation !== current) return;
      stopMedia();
      update({ speaking: false, loading: false, notice, recording: null });
      const fallbackLanguage = source === 'device' || !english ? language : accent === 'uk' ? 'en-GB' : 'en-US';
      getNative().speak(text, fallbackLanguage, rate, () => deliver(onEnd), () => deliver(onError),
        source === 'device' || !english ? voice : 'auto');
    };
    if (source === 'device' || !english) { native(); return; }
    if (!word) { native('这个内容暂不支持词典录音，已改用设备英语发音。'); return; }
    update({ loading: true, notice: '', recording: null });

    let recordings;
    try {
      if (cache.has(word)) recordings = cache.get(word);
      else {
        const abort = makeAbort();
        request = abort;
        const timeout = new Promise((_, reject) => {
          pendingReject = reject;
          requestDeadline = setTimer(() => {
            abort.abort();
            reject(new Error('timeout'));
          }, requestTimeout);
        });
        const lookup = (async () => {
          const response = await fetcher(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word).replace(/'/g, '%27')}`,
            { signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (!response.ok) throw new Error('request failed');
          return v5RecordingCandidates(await response.json(), word);
        })();
        recordings = await Promise.race([lookup, timeout]);
        if (generation !== current) return;
        clearRequestDeadline();
        pendingReject = null;
        request = null;
        // Only successful, exact-word recording metadata is kept in this tab's memory.
        if (recordings.length) {
          if (cache.size >= 120) cache.delete(cache.keys().next().value);
          cache.set(word, recordings);
        }
      }
    } catch (_) {
      if (generation !== current) return;
      clearRequestDeadline();
      pendingReject = null;
      request = null;
      native('在线录音暂时不可用，已改用设备英语发音；可点击“重听”重试。');
      return;
    }
    if (generation !== current) return;
    const recording = recordings.find(item => item.accent === accent);
    if (!recording) {
      native(`没有找到可用的${accent === 'uk' ? '英式' : '美式'}录音，已改用设备英语发音。`);
      return;
    }
    const fallback = () => {
      if (generation !== current || delivered || media !== audio) return;
      native('这段录音未能播放，已改用设备英语发音；可点击“重听”重试。');
    };
    let audio;
    try {
      audio = makeAudio();
      media = audio;
      audio.preload = 'none';
      audio.src = recording.audio;
      audio.playbackRate = Math.max(0.5, Math.min(1.5, Number(rate) || 1));
      audio.preservesPitch = true;
      audio.onplaying = () => {
        if (generation !== current || media !== audio) return;
        clearDeadline();
        const recordingsUsed = state.recordingsUsed.some(item => item.audio === recording.audio)
          ? state.recordingsUsed : [...state.recordingsUsed, recording];
        update({ speaking: true, loading: false, notice: '', recording, recordingsUsed });
        deadline = setTimer(fallback, playbackTimeout);
      };
      audio.onended = () => {
        if (generation !== current || media !== audio) return;
        clearDeadline();
        update({ speaking: false, loading: false, notice: '', recording });
        deliver(onEnd);
      };
      audio.onerror = fallback;
      update({ speaking: true, loading: true, notice: '', recording });
      deadline = setTimer(fallback, startTimeout);
      const playback = audio.play();
      if (playback && typeof playback.catch === 'function') playback.catch(fallback);
    } catch (_) {
      native('这段录音未能播放，已改用设备英语发音；可点击“重听”重试。');
    }
  }
  return { speak, cancel, clearError, getState: () => state };
}

function v5UseSpeech(source = 'device') {
  const native = bg();
  const nativeRef = (0, G.useRef)(native);
  nativeRef.current = native;
  const [state, setState] = (0, G.useState)({ speaking: false, loading: false, notice: '', recording: null, recordingsUsed: [] });
  const controller = (0, G.useRef)(null);
  if (!controller.current) controller.current = v5CreateAudioController({
    getNative: () => nativeRef.current,
    fetcher: (...arguments_) => fetch(...arguments_),
    makeAudio: () => new Audio(), onState: setState
  });
  const cancel = (0, G.useCallback)(() => controller.current.cancel(), []);
  const clearError = (0, G.useCallback)(() => controller.current.clearError(), []);
  const speak = (0, G.useCallback)((...arguments_) => controller.current.speak(source, ...arguments_), [source]);
  (0, G.useEffect)(() => { controller.current.cancel(true); }, [source]);
  (0, G.useEffect)(() => {
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', cancel);
      cancel();
    };
  }, [cancel]);
  return { ...native, ...state, error: state.recording && !state.notice ? '' : native.error,
    speaking: native.speaking || state.speaking || state.loading,
    speak, cancel, clearError, sourceLabel: source === 'dictionary-us' ? '在线词典 · 美式录音'
      : source === 'dictionary-uk' ? '在线词典 · 英式录音' : '设备语音' };
}

function V5AudioSetting({ source, onChange, onPreview }) {
  const online = v5AudioSource(source) !== 'device';
  return (0, y.jsxs)('section', {
    className: 'v5-audio-setting', 'aria-label': '发音资源设置',
    children: [
      (0, y.jsx)('label', { htmlFor: 'v5-audio-source', children: '发音资源' }),
      (0, y.jsxs)('div', { className: 'v5-audio-setting-row', children: [
        (0, y.jsxs)('select', { id: 'v5-audio-source', value: v5AudioSource(source),
          'aria-describedby': 'v5-audio-description', onChange: event => onChange(event.target.value),
          children: [
            (0, y.jsx)('option', { value: 'device', children: '设备语音（系统音色）' }),
            (0, y.jsx)('option', { value: 'dictionary-us', children: '在线词典 · 美式录音' }),
            (0, y.jsx)('option', { value: 'dictionary-uk', children: '在线词典 · 英式录音' })
          ] }),
        onPreview && (0, y.jsx)('button', { type: 'button', className: 'v5-audio-preview', onClick: onPreview,
          children: '试听发音资源' })
      ] }),
      (0, y.jsx)('p', { id: 'v5-audio-description', children: online
        ? '播放时仅查询当前英文单词，不发送中文释义、你的答案或整份词库；需要联网，缺少录音时改用设备语音。'
        : '使用设备提供的声音；是否需要联网取决于所选音色。中文播报始终使用设备语音。' }),
      online && (0, y.jsx)('p', { className: 'v5-audio-accent-note',
        children: '英文口音以所选录音资源为准；设备英语音色用于设备播放，录音回退时自动选择英语声音。' })
    ]
  });
}

function V5AudioStatus({ speech, showCredits = false }) {
  const credit = showCredits && speech.recording;
  if (!speech.loading && !speech.notice && !credit && speech.sourceLabel === '设备语音') return null;
  return (0, y.jsxs)('div', { className: 'v5-audio-status', children: [
    (0, y.jsx)('p', { role: 'status', children: speech.loading ? '正在加载在线录音…'
      : speech.notice || (speech.recording ? `${speech.sourceLabel} · 本词录音已就绪` : `${speech.sourceLabel} · 等待播放`) }),
    credit && (0, y.jsxs)('p', { className: 'v5-audio-credit', children: [
      (0, y.jsx)('a', { href: credit.source, target: '_blank', rel: 'noopener noreferrer', children: '录音来源与作者' }),
      ' · ', (0, y.jsx)('a', { href: credit.licenseUrl, target: '_blank', rel: 'noopener noreferrer', children: credit.licenseName }),
      ' · ', (0, y.jsx)('a', { href: 'https://dictionaryapi.dev/', target: '_blank', rel: 'noopener noreferrer', children: 'Free Dictionary API' })
    ] })
  ] });
}

/* Render only after revealing the paper round; file URLs can contain answers. */
function V5AudioCredits({ speech }) {
  const recordings = speech.recordingsUsed || [];
  if (!recordings.length) return null;
  return (0, y.jsxs)('details', { className: 'v5-audio-credits', children: [
    (0, y.jsx)('summary', { children: `发音来源与授权（${recordings.length} 条录音）` }),
    (0, y.jsx)('p', { children: '本轮实际播放的词典录音。来源页面包含录音作者和详细授权。' }),
    (0, y.jsx)('ol', { children: recordings.map(recording => (0, y.jsxs)('li', {
      children: [
        (0, y.jsx)('a', { href: recording.source, target: '_blank', rel: 'noopener noreferrer',
          children: `${recording.accent === 'uk' ? '英式' : '美式'}录音 · 来源与作者` }),
        ' · ', (0, y.jsx)('a', { href: recording.licenseUrl, target: '_blank', rel: 'noopener noreferrer',
          children: recording.licenseName })
      ]
    }, recording.audio)) }),
    (0, y.jsx)('a', { href: 'https://dictionaryapi.dev/', target: '_blank', rel: 'noopener noreferrer',
      children: '录音查询：Free Dictionary API' })
  ] });
}
