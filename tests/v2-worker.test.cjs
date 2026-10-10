/* Node 标准库测试：离线更新、隔离缓存、安装失败，不需要额外依赖。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../v2/sw.js'), 'utf8');
const scope = 'https://example.test/tingxieben/v2/';
const prefix = 'tingxieben-v2:' + encodeURIComponent(scope) + ':';

function response(text, url = scope + 'index.html') {
  return { ok: true, type: 'basic', url, text, clone() { return response(text, url); } };
}

function harness({ failedInstall = false } = {}) {
  const listeners = {}, storage = new Map(), deleted = [], addCalls = [];
  let claimed = 0, skipped = 0, calls = 0;
  let failAssets = failedInstall;
  let network = async request => response('latest', typeof request === 'string' ? request : request.url);
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const cache = storage.get(name);
      return {
        async addAll(assets) {
          addCalls.push([...assets]);
          if (failAssets) throw new Error('Missing core asset');
          assets.forEach(asset => cache.set(new URL(asset, scope).href, response('installed')));
        },
        async match(key) { return cache.get(typeof key === 'string' ? key : key.url); },
        async put(key, value) { cache.set(typeof key === 'string' ? key : key.url, value); }
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { deleted.push(name); return storage.delete(name); }
  };
  const self = {
    registration: { scope },
    addEventListener(name, callback) { listeners[name] = callback; },
    clients: { async claim() { claimed++; } },
    skipWaiting() { skipped++; }
  };
  vm.runInNewContext(code, { self, caches, URL, Set, Promise, fetch: (...args) => { calls++; return network(...args); } });
  async function run(name, request) {
    const pending = [];
    let result, intercepted = false;
    listeners[name]({ request, waitUntil(promise) { pending.push(promise); },
      respondWith(promise) { intercepted = true; result = promise; } });
    const value = result ? await result : undefined;
    await Promise.all(pending);
    return { intercepted, value };
  }
  return { run, storage, deleted, addCalls, setNetwork(value) { network = value; },
    setAssetFailure(value) { failAssets = value; },
    get claimed() { return claimed; }, get skipped() { return skipped; }, get calls() { return calls; } };
}

const request = (url, mode = 'navigate', method = 'GET') => ({ url, mode, method });

(async () => {
  const app = harness();
  await app.run('install');
  assert.equal(app.skipped, 0, 'Must not activate during a current session');
  const current = [...app.storage.keys()][0];
  const unrelated = 'tingxieben-v2:' + encodeURIComponent('https://example.test/other/v2/') + ':old';
  app.storage.set(prefix + 'old', new Map());
  app.storage.set('tingxieben-v1', new Map());
  app.storage.set(unrelated, new Map());
  await app.run('activate');
  assert.deepEqual(app.deleted, [prefix + 'old']);
  assert.ok(app.storage.has('tingxieben-v1') && app.storage.has(unrelated));
  assert.equal(app.claimed, 1);

  const latest = await app.run('fetch', request(scope));
  assert.equal(latest.value.text, 'latest', 'Navigation must refresh HTML through network');
  app.setNetwork(async () => { throw new Error('Offline'); });
  const offline = await app.run('fetch', request(scope + '?review=1'));
  assert.equal(offline.value.text, 'latest', 'Offline navigation must fall back to newest saved HTML');
  const icon = await app.run('fetch', request(scope + 'icon-192.png', 'cors'));
  assert.equal(icon.value.text, 'installed');
  const calls = app.calls;
  for (const req of [
    request('https://api.dictionaryapi.dev/api/v2/entries/en/apple', 'cors'),
    request('https://example.test/tingxieben/index.html'),
    request(scope + 'private-api', 'cors'),
    request(scope, 'navigate', 'POST')
  ]) assert.equal((await app.run('fetch', req)).intercepted, false);
  assert.equal(app.calls, calls);
  assert.ok(app.storage.has(current));

  // 原版 v1 的首次激活会删除其他版本缓存，模拟删除整个 v2 缓存。
  app.storage.delete(current);
  app.setNetwork(async req => response('recovered-latest', typeof req === 'string' ? req : req.url));
  await app.run('fetch', request(scope));
  const repairs = app.addCalls.length;
  assert.equal(repairs, 2, 'Installation plus one missing-assets repair');
  assert.ok(!app.addCalls.at(-1).includes(scope + 'index.html'), 'Repair must not overwrite latest navigation HTML');
  await app.run('fetch', request(scope));
  assert.equal(app.addCalls.length, repairs, 'Complete caches must not re-download core assets');
  app.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal((await app.run('fetch', request(scope))).value.text, 'recovered-latest');
  for (const name of ['manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    assert.equal((await app.run('fetch', request(scope + name, 'cors'))).value.text, 'installed');
  }
  assert.equal((await app.run('fetch', request(scope, 'cors'))).value.text, 'installed');

  app.storage.delete(current);
  app.setAssetFailure(true);
  app.setNetwork(async req => response('available-html', req.url));
  assert.equal((await app.run('fetch', request(scope))).value.text, 'available-html',
    'Failed asset repair must not fail a successful HTML navigation');
  app.setNetwork(async () => { throw new Error('Offline'); });
  assert.equal((await app.run('fetch', request(scope))).value.text, 'available-html',
    'Latest HTML remains saved even if other assets could not be repaired');

  const failed = harness({ failedInstall: true });
  await assert.rejects(failed.run('install'), /Missing core asset/);
  assert.equal(failed.storage.size, 0, 'Incomplete cache must not survive failed installation');
  assert.equal(failed.skipped, 0);
  console.log('v2 worker: isolated cleanup, network update, offline fallback, external/API bypass, failed install, no forced activation and missing-cache repair all passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
