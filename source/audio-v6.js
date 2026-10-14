/* v6 playback recovery. Keep the v5 names/preferences for existing libraries. */
const V5_AUDIO_KEY = 'listen-write-audio-source-v5';
const V5_AUDIO_SOURCES = ['device', 'dictionary-us', 'dictionary-uk'];
const V5_AUDIO_CACHE = new Map();
const V5_AUDIO_FAILURES = new Map();

function v5InitialAudioState() {
  return { speaking: false, loading: false, phase: 'idle', actualSource: '', notice: '',
    recording: null, recordingsUsed: [], retryAvailable: false, tapToPlay: false, deviceAvailable: false };
}

function v5AudioSourceLabel(source) {
  return source === 'dictionary-us' ? '在线词典 · 美式录音'
    : source === 'dictionary-uk' ? '在线词典 · 英式录音'
    : source === 'device-zh' ? '设备中文语音'
    : source === 'device-en' ? '设备英语语音'
    : source === 'other-recording' ? '其他收录录音' : '设备语音';
}

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
  cache = V5_AUDIO_CACHE, failures = V5_AUDIO_FAILURES, now = () => Date.now(), cooldown = 30000,
  requestTimeout = 5000, startTimeout = 5000, playbackTimeout = 30000,
  nativeStartTimeout = 5000 }) {
  let generation = 0;
  let request = null;
  let media = null;
  let deadline = null;
  let requestDeadline = null;
  let pendingReject = null;
  let lastRequest = null;
  let state = v5InitialAudioState();

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
    if (clearRecording === true) lastRequest = null;
    update({ speaking: false, loading: false, phase: state.phase === 'idle' ? 'idle' : 'stopped',
      ...(clearRecording === true ? { notice: '', recording: null, actualSource: '', retryAvailable: false,
        tapToPlay: false, deviceAvailable: false } : {}) });
  }

  function clearError() {
    getNative().clearError();
    update({ notice: '' });
  }

  async function speak(sourceValue, text, language, rate, onEnd, onError, voice = 'auto', options = {}) {
    cancel(true);
    getNative().clearError();
    const current = generation;
    const source = v5AudioSource(sourceValue);
    const english = /^en(?:-|$)/i.test(language || '');
    const word = v5AudioWord(text);
    const accent = source === 'dictionary-uk' ? 'uk' : 'us';
    const failureKey = `${source}:${word}`;
    lastRequest = { source, text, language, rate, voice };
    let delivered = false;
    const deliver = callback => {
      if (generation !== current || delivered) return;
      delivered = true;
      callback?.();
    };
    const native = (notice = '') => {
      if (generation !== current) return;
      stopMedia();
      update({ speaking: false, loading: false, phase: 'starting',
        actualSource: english ? 'device-en' : /^zh(?:-|$)/i.test(language || '') ? 'device-zh' : 'device',
        notice: notice ? `${notice}正在尝试设备英语发音。` : '', recording: null,
        retryAvailable: Boolean(notice && word && english && source !== 'device'), tapToPlay: false,
        deviceAvailable: Boolean(notice) });
      const fallbackLanguage = source === 'device' || !english ? language : accent === 'uk' ? 'en-GB' : 'en-US';
      let nativeActive = true;
      let nativeStarted = false;
      const nativeFailure = message => {
        if (generation !== current || delivered || !nativeActive) return;
        nativeActive = false;
        clearDeadline();
        // Some engines fire an error synchronously from cancel(); make it inert first.
        getNative().cancel();
        update({ speaking: false, loading: false, phase: 'error',
          notice: `${notice}${message}`, deviceAvailable: true });
        deliver(onError);
      };
      deadline = setTimer(() => nativeFailure('设备语音没有响应，请点“用设备语音播放”重试，并检查设备音量和语音设置。'), nativeStartTimeout);
      try { getNative().speak(text, fallbackLanguage, rate, () => {
        if (generation !== current || delivered || !nativeActive) return;
        nativeActive = false;
        clearDeadline();
        update({ speaking: false, loading: false, phase: 'ended', deviceAvailable: Boolean(notice) });
        deliver(onEnd);
      }, () => nativeFailure('设备语音未能播放，请点“用设备语音播放”重试，并检查设备音量和语音设置。'),
      source === 'device' || !english ? voice : 'auto', () => {
        if (generation !== current || delivered || !nativeActive || nativeStarted) return;
        nativeStarted = true;
        clearDeadline();
        update({ speaking: true, phase: 'playing',
          notice: notice ? `${notice}已改用设备英语发音。` : '', deviceAvailable: false });
        deadline = setTimer(() => nativeFailure('设备语音未能正常结束，请点“用设备语音播放”重试。'),
          Math.max(playbackTimeout, String(text).length * 1000 / Math.max(Number(rate) || 1, 0.1) + 15000));
      }); } catch (_) { nativeFailure('设备语音未能启动，请点“用设备语音播放”重试。'); }
    };
    if (source === 'device' || !english) { native(); return; }
    if (!word) { native('这个内容暂不支持词典录音。'); return; }
    const fail = notice => {
      if (generation !== current) return;
      for (const [key, value] of failures) if (value.until <= now()) failures.delete(key);
      if (!failures.has(failureKey) && failures.size >= 120) failures.delete(failures.keys().next().value);
      failures.set(failureKey, { until: now() + cooldown, notice });
      native(notice);
    };
    const previousFailure = failures.get(failureKey);
    if (!options.force && previousFailure && previousFailure.until > now()) {
      native(previousFailure.notice);
      return;
    }
    // Expired failures and network retries refresh metadata. Gesture retries keep it
    // so audio.play() can run directly in the click handler without another await.
    if (options.force || previousFailure) {
      failures.delete(failureKey);
      cache.delete(word);
    }
    update({ loading: true, phase: 'loading', actualSource: source, notice: '', recording: null,
      deviceAvailable: true });

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
      fail('在线录音暂时不可用。');
      return;
    }
    if (generation !== current) return;
    const recording = recordings.find(item => item.accent === accent);
    if (!recording) {
      fail(`没有找到可用的${accent === 'uk' ? '英式' : '美式'}录音。`);
      return;
    }
    const fallback = error => {
      if (generation !== current || delivered || media !== audio) return;
      if (error?.name === 'NotAllowedError') {
        stopMedia();
        // The resource is ready, but the browser requires a new direct tap.
        // This is not a network outage, so do not discard it or start a cooldown.
        update({ speaking: false, loading: false, phase: 'blocked', retryAvailable: true,
          tapToPlay: true, deviceAvailable: true,
          notice: '浏览器需要你点按后才能播放。请点“点击播放在线录音”，也可以改用设备语音。' });
        deliver(onError);
        return;
      }
      fail('这段录音未能播放。');
    };
    let audio;
    try {
      audio = makeAudio();
      media = audio;
      audio.preload = 'none';
      audio.src = recording.audio;
      audio.playbackRate = Math.max(0.5, Math.min(1.5, Number(rate) || 1));
      audio.preservesPitch = true;
      let started = false;
      audio.onplaying = () => {
        if (generation !== current || delivered || media !== audio || started) return;
        started = true;
        clearDeadline();
        const recordingsUsed = state.recordingsUsed.some(item => item.audio === recording.audio)
          ? state.recordingsUsed : [...state.recordingsUsed, recording];
        failures.delete(failureKey);
        update({ speaking: true, loading: false, phase: 'playing', actualSource: source,
          notice: '', recording, recordingsUsed, retryAvailable: false, tapToPlay: false, deviceAvailable: false });
        deadline = setTimer(fallback, playbackTimeout);
      };
      audio.onended = () => {
        if (generation !== current || media !== audio) return;
        clearDeadline();
        update({ speaking: false, loading: false, phase: 'ended', notice: '' });
        deliver(onEnd);
      };
      audio.onerror = fallback;
      update({ speaking: false, loading: true, phase: 'starting', notice: '', recording: null });
      deadline = setTimer(fallback, startTimeout);
      const playback = audio.play();
      if (playback && typeof playback.catch === 'function') playback.catch(fallback);
    } catch (error) {
      if (error?.name === 'NotAllowedError' && audio) fallback(error);
      else fail('这段录音未能播放。');
    }
  }
  function retry() {
    if (!state.retryAvailable || !lastRequest) return;
    const { source, text, language, rate, voice } = lastRequest;
    // A manual replay must not repeat a paper sequence's completion/advance callback.
    return speak(source, text, language, rate, undefined, undefined, voice, { force: !state.tapToPlay });
  }
  function playDevice() {
    if (!lastRequest || !state.deviceAvailable) return;
    const { source, text, language, rate, voice } = lastRequest;
    const english = /^en(?:-|$)/i.test(language || '');
    const fallbackLanguage = source === 'device' || !english ? language
      : source === 'dictionary-uk' ? 'en-GB' : 'en-US';
    // No fetch, timer or await precedes speak(): this remains in the user's gesture.
    return speak('device', text, fallbackLanguage, rate, undefined, undefined,
      source === 'device' || !english ? voice : 'auto');
  }
  function externalStart() {
    cancel(true);
    getNative().clearError();
    update({ phase: 'starting', actualSource: 'other-recording' });
    return generation;
  }
  function externalPlaying(token) {
    if (token === generation && state.actualSource === 'other-recording')
      update({ speaking: true, phase: 'playing' });
  }
  function externalEnd(token, failed = false, paused = false) {
    if (token === generation && state.actualSource === 'other-recording')
      update({ speaking: false, phase: failed ? 'error' : paused ? 'stopped' : 'ended' });
  }
  return { speak, cancel, clearError, retry, playDevice, externalStart, externalPlaying, externalEnd, getState: () => state };
}

function v5UseSpeech(source = 'device') {
  const native = bg();
  const nativeRef = (0, G.useRef)(native);
  nativeRef.current = native;
  const [state, setState] = (0, G.useState)(v5InitialAudioState);
  const controller = (0, G.useRef)(null);
  if (!controller.current) controller.current = v5CreateAudioController({
    getNative: () => nativeRef.current,
    fetcher: (...arguments_) => fetch(...arguments_),
    makeAudio: () => new Audio(), onState: setState
  });
  const cancel = (0, G.useCallback)(() => controller.current.cancel(), []);
  const clearError = (0, G.useCallback)(() => controller.current.clearError(), []);
  const retry = (0, G.useCallback)(() => controller.current.retry(), []);
  const playDevice = (0, G.useCallback)(() => controller.current.playDevice(), []);
  const externalStart = (0, G.useCallback)(() => controller.current.externalStart(), []);
  const externalPlaying = (0, G.useCallback)(token => controller.current.externalPlaying(token), []);
  const externalEnd = (0, G.useCallback)((token, failed, paused) => controller.current.externalEnd(token, failed, paused), []);
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
    speaking: state.speaking || state.loading || state.phase === 'starting',
    speak, cancel, clearError, retry, playDevice, externalStart, externalPlaying, externalEnd,
    sourceLabel: v5AudioSourceLabel(source) };
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
        ? '播放时仅查询当前英文单词，不发送中文释义、你的答案或整份词库。加载超时会尝试设备语音；若浏览器限制播放，请按提示点按播放。'
        : '使用设备提供的声音；是否需要联网取决于所选音色。中文播报始终使用设备语音。' }),
      online && (0, y.jsx)('p', { className: 'v5-audio-accent-note',
        children: '英文口音以所选录音资源为准；设备英语音色用于设备播放，录音回退时自动选择英语声音。' })
    ]
  });
}

function V5AudioStatus({ speech, showCredits = false, allowRetry = true }) {
  const credit = showCredits && speech.recording;
  const phase = speech.phase || 'idle';
  const sourceLabel = speech.actualSource ? v5AudioSourceLabel(speech.actualSource) : speech.sourceLabel;
  const notice = !allowRetry && speech.notice && (phase === 'blocked' || phase === 'error')
    ? '播放已暂停，请使用本页的重听或继续播放按钮重试。' : speech.notice;
  const phaseLabel = phase === 'loading' ? '正在查询录音…' : phase === 'starting' ? '正在准备播放…'
    : phase === 'playing' ? '正在播放' : phase === 'ended' ? '播放结束'
    : phase === 'stopped' ? '已停止' : phase === 'blocked' ? '等待你点按播放'
    : phase === 'error' ? '未能播放，请重听' : '等待播放';
  if (phase === 'idle' && !speech.notice && !credit && speech.sourceLabel === '设备语音') return null;
  return (0, y.jsxs)('div', { className: 'v5-audio-status', children: [
    (0, y.jsx)('p', { role: 'status', children: `${sourceLabel} · ${phaseLabel}` }),
    notice && (0, y.jsx)('p', { className: 'v5-audio-notice', children: notice }),
    allowRetry && speech.retryAvailable && speech.retry && (0, y.jsx)('button', {
      type: 'button', className: 'v5-audio-retry', onClick: speech.retry,
      children: speech.tapToPlay ? '点击播放在线录音' : '重试在线录音' }),
    allowRetry && speech.deviceAvailable && speech.playDevice && (0, y.jsx)('button', {
      type: 'button', className: 'v5-audio-retry v6-audio-device', onClick: speech.playDevice,
      children: '用设备语音播放' }),
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
