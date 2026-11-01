import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import visit from '../netlify/functions/visit.mjs';
const origin = 'https://khadra-t.netlify.app';
process.env.CONTEXT = 'production';
process.env.TELEGRAM_BOT_TOKEN = 'fake-test-token';
process.env.TELEGRAM_CHAT_ID = '123';
let sent = 0;
globalThis.fetch = async (url, options) => {
  sent++;
  assert.equal(JSON.parse(options.body).chat_id, '123');
  assert.ok(!options.body.includes('fake-test-token'));
  return Response.json({ ok: true });
};
const req = (extra = {}, method = 'POST', url = origin) => new Request(url + '/.netlify/functions/visit', {
  method, headers: { origin, 'x-khadra-visit': '1', ...extra }
});
assert.equal((await visit(req({}, 'GET'))).status, 405);
assert.equal((await visit(req({origin: 'https://evil.example'}))).status, 403);
assert.equal((await visit(req({'x-khadra-visit': ''}))).status, 403);
assert.equal((await visit(req({}, 'POST', 'https://preview.netlify.app'))).status, 403);
assert.equal(sent, 0);
const response = await visit(req());
assert.equal(response.status, 204);
assert.equal(sent, 1);
const cookie = response.headers.get('set-cookie');
assert.ok(cookie.includes('HttpOnly'));
assert.ok(!cookie.includes('fake-test-token'));
await visit(req({cookie}));
assert.equal(sent, 1, 'reload suppressed by server cookie');
await visit(req({cookie: cookie.replace(/=\d+\./, '=1.')}));
assert.equal(sent, 2, 'invalid cookie does not pass verification');
process.env.CONTEXT = 'deploy-preview';
await visit(req());
assert.equal(sent, 2, 'preview sends nothing');
process.env.CONTEXT = 'production';
delete process.env.TELEGRAM_BOT_TOKEN;
assert.equal((await visit(req())).status, 503);
process.env.TELEGRAM_BOT_TOKEN = 'fake-test-token';
globalThis.fetch = async () => { throw Error('network failure'); };
assert.equal((await visit(req())).status, 502);
globalThis.fetch = async () => Response.json({ok: false}, {status: 429});
assert.equal((await visit(req())).status, 502);

const source = readFileSync(new URL('../visit-notification.js', import.meta.url), 'utf8');
let calls = 0;
const saved = new Map();
function run({host = origin, denied = false, hidden = false, offline = false} = {}) {
  const listeners = {};
  const document = {visibilityState: hidden ? 'hidden' : 'visible', addEventListener: (n,f) => listeners[n] = f};
  vm.runInNewContext(source, {
    location: {origin: host}, document, navigator: {}, Date, AbortSignal,
    localStorage: {getItem: k => { if(denied) throw Error(); return saved.get(k); }, setItem: (k,v) => saved.set(k,v)},
    fetch: async () => { calls++; if(offline) throw Error(); return new Response(null,{status:204}); }
  });
  return {document, listeners};
}
run(); run();
assert.equal(calls, 1, 'reload suppressed by client');
saved.clear(); run({host:'https://preview.netlify.app'});
assert.equal(calls, 1);
const tab = run({hidden: true}); assert.equal(calls, 1);
tab.document.visibilityState = 'visible'; tab.listeners.visibilitychange(); tab.listeners.visibilitychange();
assert.equal(calls, 2);
saved.clear();run({denied:true, offline:true});
assert.equal(calls, 3, 'storage/network failures do not throw into app');
saved.set('khadra-t:visit-notification:v1', String(Date.now()-31*60*1000));run();
assert.equal(calls, 4, 'new visit after 30 minutes');
console.log('PASS: method/origin checks, server cookie, preview exclusion, missing secrets, Telegram/network failure, client reload/visibility/expiry/storage failure.');
