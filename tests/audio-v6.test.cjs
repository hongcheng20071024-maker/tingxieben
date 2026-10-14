'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = new Map();
const jsx = (type, props) => ({ type, ...props });
const context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout,
  y: { jsx, jsxs: jsx },
  localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../source/audio-v6.js'), 'utf8') +
  '\nglobalThis.audio = { v5AudioWord, v5AudioUrl, v5RecordingCandidates, v5ReadAudioPreference, v5SaveAudioPreference, v5CreateAudioController, V5AudioStatus, V5AudioCredits };', context);
const { v5AudioWord, v5AudioUrl, v5RecordingCandidates, v5ReadAudioPreference, v5SaveAudioPreference, v5CreateAudioController, V5AudioStatus, V5AudioCredits } = context.audio;
const passed = [];
function pass(name) { passed.push(name); }
const recording = (word = 'hello', accent = 'us') => ({
  audio: `https://api.dictionaryapi.dev/media/pronunciations/en/${word}-${accent}.mp3`,
  sourceUrl: `https://commons.wikimedia.org/wiki/File:En-${accent}-${word}.ogg`,
  license: { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' }
});
const payload = (word = 'hello', accents = ['us', 'uk']) => [{ word, phonetics: accents.map(accent => recording(word, accent)) }];
const response = body => ({ ok: true, json: async () => body });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness({ fetcher = async () => response(payload()), audioReject = false, audioThrows = false,
  audioErrorName = '', nativeThrows = false, cancelNativeError = false,
  cache = new Map(), failures = new Map() } = {}) {
  const states = [], fetches = [], spoken = [], audios = [], timers = new Map();
  let nativeCancelled = 0, nativeErrorsCleared = 0, nextTimer = 0, clock = 1000;
  class FakeAudio {
    constructor() { this.paused = true; this.pauseCalls = 0; this.playCalls = 0; audios.push(this); }
    play() {
      this.playCalls += 1;
      if (audioThrows) { const error = new Error('play throws'); if (audioErrorName) error.name = audioErrorName; throw error; }
      if (typeof audioReject === 'function' ? audioReject(audios.length) : audioReject) { const error = new Error('play rejected'); if (audioErrorName) error.name = audioErrorName; return Promise.reject(error); }
      this.paused = false;
      return Promise.resolve();
    }
    pause() { this.paused = true; this.pauseCalls += 1; }
    removeAttribute(key) { if (key === 'src') this.src = ''; }
    load() {}
  }
  const native = { cancel: () => { nativeCancelled += 1; if (cancelNativeError) spoken.at(-1)?.[4]?.(); }, clearError: () => { nativeErrorsCleared += 1; },
    speak: (...arguments_) => { spoken.push(arguments_); if (nativeThrows) throw new Error('native failed'); } };
  const controller = v5CreateAudioController({ getNative: () => native,
    fetcher: (...arguments_) => { fetches.push(arguments_); return fetcher(...arguments_); },
    makeAudio: () => new FakeAudio(), onState: state => states.push({ ...state }), cache, failures, now: () => clock,
    setTimer: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimer: id => timers.delete(id) });
  return { controller, states, fetches, spoken, audios, timers, cache, failures,
    advance: milliseconds => { clock += milliseconds; },
    get nativeCancelled() { return nativeCancelled; },
    get nativeErrorsCleared() { return nativeErrorsCleared; },
    fire(ms) { const item = [...timers.entries()].find(([, value]) => value.ms === ms); assert.ok(item, `timer ${ms} exists`); timers.delete(item[0]); item[1].callback(); } };
}

(async () => {
  assert.equal(v5ReadAudioPreference(), 'device');
  v5SaveAudioPreference('dictionary-us');
  assert.equal(v5ReadAudioPreference(), 'dictionary-us');
  v5SaveAudioPreference('malicious');
  assert.equal(v5ReadAudioPreference(), 'dictionary-us');
  data.set('listen-write-audio-source-v5', 'unknown');
  assert.equal(v5ReadAudioPreference(), 'device');
  context.localStorage = { getItem() { throw new Error('storage disabled'); }, setItem() { throw new Error('storage disabled'); } };
  assert.equal(v5ReadAudioPreference(), 'device');
  assert.doesNotThrow(() => v5SaveAudioPreference('dictionary-uk'));
  pass('source preference, invalid stored value and unavailable storage');

  assert.equal(v5AudioWord('  ＨＥＬＬＯ  '), 'hello');
  assert.equal(v5AudioWord('don’t'), "don't");
  assert.equal(v5AudioWord('look   after'), 'look after');
  assert.equal(v5AudioWord('中文'), '');
  assert.equal(v5AudioWord('hello?'), '');
  assert.equal(v5AudioWord('a'.repeat(81)), '');
  pass('English request validation and normalized word');

  assert.equal(v5AudioUrl('https://api.dictionaryapi.dev/media/pronunciations/en/hello-us.mp3', 'api.dictionaryapi.dev', '/media/pronunciations/en/'), recording().audio);
  for (const url of ['http://api.dictionaryapi.dev/media/pronunciations/en/a.mp3',
    'https://api.dictionaryapi.dev.evil.test/media/pronunciations/en/a.mp3',
    'https://user@api.dictionaryapi.dev/media/pronunciations/en/a.mp3',
    'https://api.dictionaryapi.dev:8443/media/pronunciations/en/a.mp3',
    'https://api.dictionaryapi.dev/other/a.mp3', 'javascript:alert(1)'])
    assert.equal(v5AudioUrl(url, 'api.dictionaryapi.dev', '/media/pronunciations/en/'), '');
  pass('audio/source URL validation excludes untrusted hosts and credentials');

  const both = v5RecordingCandidates(payload(), 'HELLO');
  assert.equal(both.length, 2);
  assert.equal(both[0].accent, 'us');
  assert.equal(both[1].accent, 'uk');
  assert.equal(v5RecordingCandidates(payload('wrong'), 'hello').length, 0);
  const duplicate = payload(); duplicate[0].phonetics.push(recording());
  assert.equal(v5RecordingCandidates(duplicate, 'hello').length, 2);
  for (const changed of [{ audio: 'https://other.test/hello-us.mp3' },
    { sourceUrl: 'https://other.test/hello' }, { license: { name: 'unknown', url: 'https://other.test/license' } },
    { audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/hello-au.mp3' }])
    assert.equal(v5RecordingCandidates([{ word: 'hello', phonetics: [{ ...recording(), ...changed }] }], 'hello').length, 0);
  const gb = [{ word: 'hello', phonetics: [recording('hello', 'gb')] }];
  assert.equal(v5RecordingCandidates(gb, 'hello')[0].accent, 'uk');
  pass('recordings require exact word, trusted credit, matching US/UK and no duplicates');

  {
    const h = harness();
    const work = h.controller.speak('device', 'hello', 'en-US', 0.8, null, null, 'chosen');
    assert.equal(h.spoken.length, 1, 'device begins synchronously for a user gesture');
    await work;
    assert.equal(h.fetches.length, 0);
    assert.equal(h.spoken[0][5], 'chosen');
    assert.equal(h.spoken[0][2], 0.8);
    assert.equal(h.controller.getState().phase, 'starting');
    assert.equal(h.controller.getState().actualSource, 'device-en');
    assert.equal(h.controller.getState().speaking, false);
    h.spoken[0][6]();
    assert.equal(h.controller.getState().phase, 'playing');
    h.spoken[0][3]();
    assert.equal(h.controller.getState().phase, 'ended');
    pass('device source speaks synchronously and never queries dictionary');
  }
  {
    const h = harness();
    await h.controller.speak('dictionary-us', '你好', 'zh-CN', 0.7, null, null, 'chinese');
    assert.equal(h.fetches.length, 0);
    assert.equal(h.spoken[0][1], 'zh-CN');
    assert.equal(h.spoken[0][5], 'chinese');
    assert.equal(h.controller.getState().actualSource, 'device-zh');
    h.spoken[0][6]();
    const rendered = JSON.stringify(V5AudioStatus({ speech: { ...h.controller.getState(), sourceLabel: '在线词典 · 美式录音' } }));
    assert.match(rendered, /设备中文语音 · 正在播放/);
    assert.equal(rendered.includes('在线词典'), false);
    pass('Chinese uses selected device voice even with an online English source');
  }
  {
    const h = harness({ fetcher: async () => response(payload("don't")) });
    await h.controller.speak('dictionary-us', "don't", 'en-US', 0.7);
    assert.equal(h.fetches.length, 1);
    assert.equal(h.fetches[0][0], 'https://api.dictionaryapi.dev/api/v2/entries/en/don%27t');
    assert.equal(h.fetches[0][1].credentials, 'omit');
    assert.equal(h.fetches[0][1].referrerPolicy, 'no-referrer');
    assert.equal(Object.keys(h.fetches[0][1]).sort().join(','), 'credentials,referrerPolicy,signal');
    assert.equal(h.audios[0].playbackRate, 0.7);
    assert.equal(h.audios[0].preservesPitch, true);
    h.controller.cancel();
    pass('online sends only the encoded word and uses pitch-preserving slow playback');
  }
  {
    const h = harness(); let ended = 0;
    await h.controller.speak('dictionary-us', 'hello', 'en-GB', 1, () => { ended += 1; });
    assert.equal(h.spoken.length, 0);
    assert.match(h.audios[0].src, /hello-us\.mp3$/);
    assert.equal(h.controller.getState().loading, true);
    assert.equal(h.controller.getState().recording, null, 'media has not started, so there is no heard credit');
    assert.equal(h.controller.getState().speaking, false);
    assert.equal(h.controller.getState().phase, 'starting');
    h.audios[0].onplaying();
    assert.equal(h.controller.getState().loading, false);
    assert.equal(h.controller.getState().speaking, true);
    assert.equal(h.controller.getState().recording.accent, 'us');
    assert.equal(h.controller.getState().phase, 'playing');
    h.audios[0].onended(); h.audios[0].onended();
    assert.equal(ended, 1);
    assert.equal(h.controller.getState().speaking, false);
    assert.equal(h.controller.getState().phase, 'ended');
    h.audios[0].onplaying();
    assert.equal(h.controller.getState().phase, 'ended', 'late playing after completion cannot resurrect playback');
    assert.equal(h.timers.size, 0);
    await h.controller.speak('dictionary-uk', 'hello', 'en-US', 1);
    assert.match(h.audios[1].src, /hello-uk\.mp3$/);
    assert.equal(h.fetches.length, 1, 'one tab reuses exact-word metadata for the other accent');
    h.controller.cancel();
    pass('US/UK source overrides device accent, caches metadata and completes once');
  }
  {
    const h = harness({ fetcher: async () => response(payload('hello', ['uk'])) });
    await h.controller.speak('dictionary-us', 'hello', 'en-GB', 1, null, null, 'wrong-accent-voice');
    assert.equal(h.audios.length, 0);
    assert.equal(h.spoken.length, 1);
    assert.equal(h.spoken[0][1], 'en-US');
    assert.equal(h.spoken[0][5], 'auto');
    assert.match(h.controller.getState().notice, /没有找到可用的美式录音/);
    pass('missing selected accent falls back honestly without substituting another recording');
  }
  {
    const h = harness({ fetcher: async () => ({ ok: false, json: async () => payload() }) });
    await h.controller.speak('dictionary-uk', 'hello', 'en-US', 1);
    assert.equal(h.spoken[0][1], 'en-GB');
    assert.match(h.controller.getState().notice, /在线录音暂时不可用/);
    assert.equal(h.cache.size, 0);
    assert.equal(h.failures.size, 1);
    await h.controller.speak('dictionary-uk', 'hello', 'en-US', 1);
    assert.equal(h.fetches.length, 1, 'failure cooldown skips repeat lookup');
    assert.equal(h.spoken.length, 2);
    assert.equal(h.controller.getState().retryAvailable, true);
    pass('failed request uses device fallback and short cooldown skips repeat lookup');
  }
  {
    const wait = deferred(); const h = harness({ fetcher: () => wait.promise });
    const work = h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    h.fire(5000); await work;
    assert.equal(h.fetches[0][1].signal.aborted, true);
    assert.equal(h.spoken.length, 1);
    wait.resolve(response(payload())); await settle();
    assert.equal(h.audios.length, 0, 'late network response must never start audio');
    assert.equal(h.spoken.length, 1);
    assert.equal(h.cache.size, 0);
    pass('timeout falls back even when fetch ignores abort and late results stay silent');
  }
  {
    const wait = deferred(); const h = harness({ fetcher: () => wait.promise }); let ended = 0;
    const work = h.controller.speak('dictionary-us', 'hello', 'en-US', 1, () => ended++);
    h.controller.cancel(); await work;
    assert.equal(h.fetches[0][1].signal.aborted, true);
    assert.equal(h.timers.size, 0);
    wait.resolve(response(payload())); await settle();
    assert.equal(h.spoken.length, 0);
    assert.equal(h.audios.length, 0);
    assert.equal(ended, 0);
    assert.equal(h.controller.getState().loading, false);
    assert.equal(h.controller.getState().phase, 'stopped');
    assert.equal(h.failures.size, 0, 'cancel is never treated as a lookup failure');
    pass('cancel during lookup aborts and never falls back or calls completion');
  }
  {
    const first = deferred(); const h = harness({ fetcher: url => url.endsWith('/hello') ? first.promise : Promise.resolve(response(payload('bank'))) });
    const old = h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    await h.controller.speak('dictionary-uk', 'bank', 'en-US', 1);
    first.resolve(response(payload())); await old; await settle();
    assert.equal(h.audios.length, 1);
    assert.match(h.audios[0].src, /bank-uk\.mp3$/);
    assert.equal(h.cache.has('hello'), false);
    h.controller.cancel();
    pass('rapidly switching word/source suppresses stale audio and cache writes');
  }
  for (const audioOptions of [{ audioReject: true }, { audioThrows: true }]) {
    const h = harness(audioOptions); let ended = 0;
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1, () => ended++); await settle();
    assert.equal(h.spoken.length, 1);
    assert.equal(h.audios[0].paused, true);
    assert.match(h.controller.getState().notice, /这段录音未能播放/);
    assert.equal(h.controller.getState().recording, null);
    h.spoken[0][3](); h.spoken[0][3](); assert.equal(ended, 1);
    pass(audioOptions.audioReject ? 'generic media rejection falls back and completes once' : 'synchronous media error falls back and cleans up');
  }
  {
    const h = harness();
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    h.fire(5000);
    assert.equal(h.spoken.length, 1);
    assert.equal(h.audios[0].onplaying, null);
    assert.equal(h.audios[0].paused, true);
    pass('recording load/start timeout clears media before device fallback');
  }
  {
    const h = harness();
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    h.audios[0].onplaying(); h.fire(30000);
    assert.equal(h.spoken.length, 1);
    assert.equal(h.audios[0].paused, true);
    pass('a recording that never finishes cannot stall paper dictation');
  }
  {
    const h = harness(); let ended = 0;
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1, () => ended++);
    const staleEnd = h.audios[0].onended, staleError = h.audios[0].onerror;
    h.controller.cancel(); staleEnd(); staleError();
    assert.equal(ended, 0);
    assert.equal(h.spoken.length, 0);
    assert.equal(h.audios[0].paused, true);
    assert.equal(h.audios[0].src, '');
    assert.equal(h.timers.size, 0);
    assert.equal(h.controller.getState().recording, null, 'cancel before onplaying cannot credit unheard media');
    assert.equal(h.controller.getState().phase, 'stopped');
    pass('cancel before media starts suppresses stale events and never credits unheard audio');
  }
  {
    const h = harness();
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    h.audios[0].onplaying();
    h.controller.cancel();
    const speech = { ...h.controller.getState(), sourceLabel: '在线词典 · 美式录音' };
    assert.ok(speech.recording, 'grading preserves the heard recording metadata');
    const hidden = JSON.stringify(V5AudioStatus({ speech }));
    assert.equal(hidden.includes('wikimedia.org'), false);
    assert.equal(hidden.includes('hello'), false, 'ungraded status cannot reveal the word via URL');
    const revealed = JSON.stringify(V5AudioStatus({ speech, showCredits: true }));
    assert.equal(revealed.includes('wikimedia.org'), true);
    assert.equal(revealed.includes('creativecommons.org'), true);
    h.controller.cancel(true);
    assert.equal(h.controller.getState().recording, null, 'switching resource clears old credit');
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    await h.controller.speak('device', 'bank', 'en-US', 1);
    assert.equal(h.controller.getState().recording, null, 'new playback clears previous word metadata');
    pass('grading keeps attribution; ungraded status hides URLs; new playback clears old credit');
  }
  {
    const h = harness({ fetcher: async url => response(payload(decodeURIComponent(url.split('/').pop()))) });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(h.controller.getState().recordingsUsed.length, 0, 'loading does not count as a played recording');
    assert.equal(V5AudioCredits({ speech: h.controller.getState() }), null);
    h.audios[0].onplaying(); h.audios[0].onplaying();
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    h.audios[1].onplaying();
    assert.equal(h.controller.getState().recordingsUsed.length, 1, 'repeats share one credit');
    await h.controller.speak('dictionary-uk', 'bank', 'en-US', 1);
    h.audios[2].onplaying(); h.controller.cancel();
    const credits = h.controller.getState().recordingsUsed;
    assert.equal(credits.length, 2);
    assert.equal(credits[0].accent, 'us');
    assert.equal(credits[1].accent, 'uk');
    const rendered = JSON.stringify(V5AudioCredits({ speech: h.controller.getState() }));
    assert.equal(rendered.includes('En-us-hello'), true);
    assert.equal(rendered.includes('En-uk-bank'), true);
    pass('paper-round credits include every actually played recording and deduplicate repeats');
  }
  {
    const h = harness();
    await h.controller.speak('dictionary-us', 'hello?', 'en-US', 1);
    assert.equal(h.fetches.length, 0);
    assert.equal(h.spoken.length, 1);
    h.controller.clearError(); assert.equal(h.controller.getState().notice, '');
    pass('unsupported content is spoken locally without a network query');
  }
  {
    const cache = new Map(Array.from({ length: 120 }, (_, i) => [`word-${i}`, []]));
    const h = harness({ cache });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(cache.size, 120);
    assert.equal(cache.has('word-0'), false);
    assert.equal(cache.has('hello'), true);
    h.controller.cancel();
    pass('recording metadata cache is bounded to 120 words in memory');
  }
  {
    let available = false;
    const h = harness({ fetcher: async () => response(available ? payload() : []) });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 0.6);
    assert.equal(h.fetches.length, 1);
    assert.equal(h.spoken.length, 2);
    assert.equal(h.spoken[1][2], 0.6, 'cooldown still respects current slow playback');
    available = true;
    await h.controller.retry();
    assert.equal(h.fetches.length, 2);
    assert.equal(h.audios.length, 1);
    assert.equal(h.audios[0].playbackRate, 0.6);
    h.audios[0].onplaying();
    assert.equal(h.failures.size, 0);
    assert.equal(h.controller.getState().retryAvailable, false);
    pass('missing word cooldown skips lookup while explicit retry recovers with current playback rate');
  }
  {
    const h = harness({ fetcher: async () => response([]) });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    h.advance(29999);
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(h.fetches.length, 1);
    h.advance(1);
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(h.fetches.length, 2, 'exact cooldown expiry permits fresh lookup');
    await h.controller.speak('dictionary-uk', 'hello', 'en-US', 1);
    assert.equal(h.fetches.length, 3, 'the other resource has an independent cooldown');
    pass('cooldown expires after thirty seconds and is scoped to word and resource');
  }
  {
    let usAvailable = false;
    const h = harness({ fetcher: async () => response(payload('hello', usAvailable ? ['us', 'uk'] : ['uk'])) });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(h.fetches.length, 1);
    usAvailable = true;
    h.advance(30000);
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(h.fetches.length, 2, 'expired missing-accent result does not reuse incomplete metadata forever');
    assert.match(h.audios[0].src, /hello-us\.mp3$/);
    h.controller.cancel();
    pass('expired missing-accent result refreshes previously successful metadata');
  }
  {
    const failures = new Map(Array.from({ length: 120 }, (_, i) => [`dictionary-us:word${i}`, { until: 31000, notice: 'missing' }]));
    const h = harness({ failures, fetcher: async () => response([]) });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(failures.size, 120);
    assert.equal(failures.has('dictionary-us:word0'), false);
    assert.equal(failures.has('dictionary-us:hello'), true);
    pass('failure cooldown memory is bounded to 120 word-resource entries');
  }
  {
    const h = harness({ audioReject: true });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1); await settle();
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1); await settle();
    assert.equal(h.audios.length, 1, 'replay during cooldown avoids another failing media request');
    assert.equal(h.spoken.length, 2);
    await h.controller.retry(); await settle();
    assert.equal(h.audios.length, 2, 'a new user gesture may retry blocked media');
    assert.equal(h.fetches.length, 2);
    pass('media playback failures use cooldown and permit explicit recovery attempt');
  }
  {
    const h = harness({ fetcher: async () => response([]) }); let advanced = 0;
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1, () => advanced++);
    h.spoken[0][3]();
    assert.equal(advanced, 1);
    await h.controller.retry();
    h.spoken[1][6](); h.spoken[1][3]();
    assert.equal(advanced, 1, 'manual retry must not duplicate paper advancement callbacks');
    const visible = JSON.stringify(V5AudioStatus({ speech: { ...h.controller.getState(), retry: h.controller.retry, sourceLabel: '在线词典 · 美式录音' } }));
    assert.match(visible, /重试在线录音/);
    const hidden = JSON.stringify(V5AudioStatus({ speech: { ...h.controller.getState(), retry: h.controller.retry }, allowRetry: false }));
    assert.equal(hidden.includes('重试在线录音'), false);
    pass('manual retry never repeats automatic progression and can be hidden during paper playback');
  }
  {
    const h = harness(); let ended = 0;
    await h.controller.speak('device', 'hello', 'en-US', 1, () => ended++);
    const oldStart = h.spoken[0][6], oldEnd = h.spoken[0][3];
    h.controller.cancel(); oldStart(); oldEnd();
    assert.equal(h.controller.getState().phase, 'stopped');
    assert.equal(ended, 0);
    await h.controller.speak('device', 'bank', 'en-US', 1, null, () => ended++);
    h.spoken[1][4]();
    assert.equal(h.controller.getState().phase, 'error');
    assert.equal(ended, 1);
    pass('native start/end/error lifecycle is truthful and canceled callbacks stay inert');
  }
  {
    const wait = deferred(); const h = harness({ fetcher: () => wait.promise });
    const lookup = h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    const token = h.controller.externalStart();
    assert.equal(h.fetches[0][1].signal.aborted, true);
    assert.equal(h.controller.getState().phase, 'starting');
    assert.equal(h.controller.getState().actualSource, 'other-recording');
    h.controller.externalPlaying(token);
    assert.equal(h.controller.getState().phase, 'playing');
    h.controller.externalEnd(token);
    assert.equal(h.controller.getState().phase, 'ended');
    wait.resolve(response(payload())); await lookup; await settle();
    assert.equal(h.audios.length, 0);
    assert.equal(h.spoken.length, 0);
    assert.equal(h.failures.size, 0);
    await h.controller.speak('device', 'bank', 'en-US', 1);
    h.controller.externalPlaying(token); h.controller.externalEnd(token, true);
    assert.equal(h.controller.getState().actualSource, 'device-en');
    assert.equal(h.controller.getState().phase, 'starting');
    pass('other-recording takeover cancels pending work and stale external events cannot replace new source state');
  }
  {
    const h = harness();
    const token = h.controller.externalStart();
    assert.equal(h.nativeErrorsCleared, 1, 'new external playback clears stale device error');
    h.controller.externalPlaying(token);
    h.controller.externalEnd(token, false, true);
    assert.equal(h.controller.getState().phase, 'stopped');
    assert.equal(h.controller.getState().speaking, false);
    const resumedToken = h.controller.externalStart();
    h.controller.externalPlaying(resumedToken);
    h.controller.externalEnd(token, false, true);
    assert.equal(h.controller.getState().phase, 'playing', 'pause from the old audio cannot stop the resumed source');
    h.controller.externalEnd(resumedToken);
    assert.equal(h.controller.getState().phase, 'ended');
    pass('external pause is stopped, resume has a fresh token and stale native errors are cleared');
  }
  {
    const h = harness();
    const token = h.controller.externalStart();
    h.controller.externalEnd(token, true);
    assert.equal(h.controller.getState().phase, 'error');
    h.controller.cancel(true);
    assert.equal(h.controller.getState().retryAvailable, false);
    assert.equal(h.controller.retry(), undefined);
    pass('external playback error is visible and source reset invalidates manual retry');
  }
  {
    const h = harness(); let ended = 0, failed = 0;
    await h.controller.speak('device', 'hello', 'en-US', 1, () => ended++, () => failed++);
    const lateStart = h.spoken[0][6], lateEnd = h.spoken[0][3], lateError = h.spoken[0][4];
    h.fire(5000);
    assert.equal(h.controller.getState().phase, 'error');
    assert.equal(h.controller.getState().loading, false);
    assert.equal(h.controller.getState().speaking, false);
    assert.match(h.controller.getState().notice, /设备语音没有响应/);
    assert.equal(h.controller.getState().deviceAvailable, true);
    assert.equal(ended, 0); assert.equal(failed, 1);
    lateStart(); lateEnd(); lateError();
    assert.equal(h.controller.getState().phase, 'error');
    assert.equal(ended, 0); assert.equal(failed, 1);
    assert.equal(h.timers.size, 0);
    pass('silent native engine stops after five seconds; late native events cannot revive or advance it');
  }
  {
    const h = harness({ cancelNativeError: true }); let failed = 0;
    await h.controller.speak('device', 'hello', 'en-US', 1, null, () => failed++);
    h.fire(5000);
    assert.equal(failed, 1);
    assert.equal(h.controller.getState().phase, 'error');
    assert.equal(h.timers.size, 0);
    pass('native watchdog remains safe when cancel synchronously emits an error');
  }
  {
    const h = harness({ nativeThrows: true }); let failed = 0;
    await h.controller.speak('device', 'hello', 'en-US', 1, null, () => failed++);
    assert.equal(failed, 1);
    assert.equal(h.controller.getState().phase, 'error');
    assert.match(h.controller.getState().notice, /未能启动/);
    assert.equal(h.timers.size, 0);
    pass('synchronous native speak exception is a visible recoverable error');
  }
  {
    const wait = deferred(); const h = harness({ fetcher: () => wait.promise }); let ended = 0, failed = 0;
    const work = h.controller.speak('dictionary-us', 'hello', 'en-US', 1, () => ended++, () => failed++);
    h.fire(5000); await work;
    assert.equal(h.controller.getState().phase, 'starting');
    assert.match(h.controller.getState().notice, /正在尝试设备英语发音/);
    assert.equal(h.controller.getState().notice.includes('已改用'), false, 'an unstarted voice must not be described as playing');
    h.fire(5000);
    assert.equal(h.controller.getState().phase, 'error');
    assert.equal(h.controller.getState().loading, false);
    assert.equal(ended, 0); assert.equal(failed, 1);
    wait.resolve(response(payload())); await settle();
    assert.equal(h.audios.length, 0);
    pass('network timeout plus silent fallback reaches error within ten seconds and never advances paper practice');
  }
  {
    const h = harness({ audioReject: n => n === 1, audioErrorName: 'NotAllowedError' }); let ended = 0, failed = 0;
    await h.controller.speak('dictionary-uk', 'hello', 'en-GB', 0.6, () => ended++, () => failed++); await settle();
    assert.equal(h.controller.getState().phase, 'blocked');
    assert.equal(h.controller.getState().loading, false);
    assert.equal(h.controller.getState().speaking, false);
    assert.equal(h.controller.getState().tapToPlay, true);
    assert.equal(h.spoken.length, 0, 'gesture block does not attempt another gestureless API');
    assert.equal(h.failures.size, 0, 'gesture block is not an outage');
    assert.equal(ended, 0); assert.equal(failed, 1);
    const rendered = JSON.stringify(V5AudioStatus({ speech: { ...h.controller.getState(), retry: h.controller.retry, playDevice: h.controller.playDevice } }));
    assert.match(rendered, /点击播放在线录音/); assert.match(rendered, /用设备语音播放/);
    const retry = h.controller.retry();
    assert.equal(h.audios.length, 2, 'retry creates audio before leaving the click call stack');
    assert.equal(h.audios[1].playCalls, 1);
    assert.equal(h.fetches.length, 1, 'known recording is not needlessly re-requested');
    assert.equal(h.audios[1].playbackRate, 0.6);
    await retry; h.audios[1].onplaying(); h.audios[1].onended();
    assert.equal(h.controller.getState().phase, 'ended');
    assert.equal(ended, 0, 'manual rescue does not advance the old paper callback');
    pass('NotAllowedError offers a direct tap retry that synchronously plays cached metadata');
  }
  {
    const h = harness({ audioThrows: true, audioErrorName: 'NotAllowedError' });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    assert.equal(h.controller.getState().phase, 'blocked');
    assert.equal(h.spoken.length, 0);
    assert.equal(h.failures.size, 0);
    assert.equal(h.timers.size, 0);
    pass('synchronous NotAllowedError offers the same direct tap recovery');
  }
  {
    const wait = deferred(); const h = harness({ fetcher: () => wait.promise }); let ended = 0, failed = 0;
    const lookup = h.controller.speak('dictionary-uk', 'hello', 'en-US', 0.65, () => ended++, () => failed++, 'custom');
    assert.equal(h.controller.getState().deviceAvailable, true);
    const device = h.controller.playDevice();
    assert.equal(h.spoken.length, 1, 'device rescue begins in the same click call stack');
    assert.equal(h.spoken[0][1], 'en-GB'); assert.equal(h.spoken[0][2], 0.65); assert.equal(h.spoken[0][5], 'auto');
    assert.equal(h.fetches[0][1].signal.aborted, true);
    await device; await lookup; wait.resolve(response(payload())); await settle();
    h.spoken[0][6](); h.spoken[0][3]();
    assert.equal(h.controller.getState().phase, 'ended');
    assert.equal(h.audios.length, 0); assert.equal(ended, 0); assert.equal(failed, 0);
    assert.equal(h.failures.size, 0);
    pass('device rescue can immediately bypass a hanging lookup, preserves accent/rate and ignores late work');
  }
  {
    const h = harness(); let ended = 0, failed = 0;
    await h.controller.speak('device', '你好', 'zh-CN', 0.7, () => ended++, () => failed++, 'Chinese voice');
    h.fire(5000);
    const retry = h.controller.playDevice();
    assert.equal(h.spoken.length, 2);
    assert.equal(h.spoken[1][1], 'zh-CN'); assert.equal(h.spoken[1][5], 'Chinese voice');
    await retry; h.spoken[1][6](); h.spoken[1][3]();
    assert.equal(ended, 0); assert.equal(failed, 1);
    assert.equal(h.timers.size, 0);
    pass('device recovery preserves Chinese voice settings and never repeats old sequence callbacks');
  }
  {
    const h = harness(); let failed = 0;
    await h.controller.speak('device', 'hello', 'en-US', 1, null, () => failed++);
    h.spoken[0][6](); const firstTimer = [...h.timers.keys()][0];
    h.spoken[0][6](); assert.deepEqual([...h.timers.keys()], [firstTimer]);
    h.fire(30000);
    assert.equal(failed, 1); assert.equal(h.controller.getState().phase, 'error');
    assert.equal(h.timers.size, 0);
    pass('native playback watchdog is not extended by duplicate start events');
  }
  {
    const h = harness();
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1);
    h.audios[0].onplaying(); const firstTimer = [...h.timers.keys()][0];
    h.audios[0].onplaying(); assert.deepEqual([...h.timers.keys()], [firstTimer]);
    h.controller.cancel(true);
    assert.equal(h.controller.getState().deviceAvailable, false);
    assert.equal(h.controller.getState().tapToPlay, false);
    assert.equal(h.controller.playDevice(), undefined);
    assert.equal(h.timers.size, 0);
    pass('duplicate media playing does not postpone watchdog; source reset clears rescue actions');
  }
  {
    const h = harness({ audioReject: true, audioErrorName: 'NotAllowedError' });
    await h.controller.speak('dictionary-us', 'hello', 'en-US', 1); await settle();
    const hidden = JSON.stringify(V5AudioStatus({ speech: { ...h.controller.getState(), retry: h.controller.retry, playDevice: h.controller.playDevice }, allowRetry: false }));
    assert.equal(hidden.includes('"type":"button"'), false, 'paper sequence may hide standalone replay actions');
    assert.match(hidden, /等待你点按播放/);
    assert.match(hidden, /本页的重听或继续播放按钮/);
    assert.equal(hidden.includes('请点“点击播放在线录音”'), false);
    pass('paper mode can hide standalone recovery buttons while retaining truthful blocked status');
  }
  console.log(JSON.stringify({ success: true, checks: passed.length, passed }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

