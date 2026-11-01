import assert from 'node:assert/strict';
import visit from '../netlify/functions/visit.mjs';
process.env.TELEGRAM_BOT_TOKEN = 'test-secret';
process.env.TELEGRAM_CHAT_ID = '123';
const messages = [];
globalThis.fetch = async (_, options) => { messages.push(JSON.parse(options.body).text); return Response.json({ok:true}); };
const request = cookie => new Request('https://khadra-t.netlify.app/.netlify/functions/visit', {
 method:'POST', headers:{origin:'https://khadra-t.netlify.app', 'x-khadra-visit':'1', cookie:cookie || ''}
});
const context = {ip:'192.0.2.5', geo:{country:{name:'Saudi Arabia'}, subdivision:{name:'Eastern Province'}, city:'Al Ahsa',latitude:25.4,longitude:49.6}};
const first = await visit(request(), context);
const cookies = first.headers.getSetCookie();
const identity = cookies.find(x=>x.startsWith('__Host-khadra-visitor=')).split(';')[0];
const suppression = cookies.find(x=>x.startsWith('__Host-khadra-visit=')).split(';')[0];
const id = messages[0].match(/رقم المتصفح: (\d{14})/)[1];
assert.ok(messages[0].includes('أول زيارة'));
assert.ok(messages[0].includes('Saudi Arabia، Eastern Province، Al Ahsa'));
assert.ok(!messages[0].includes(context.ip));
assert.ok(!messages[0].includes('25.4'));
await visit(request(identity), context); // Simulates a return after short-lived visit cookie expires.
assert.ok(messages[1].includes(id));
assert.ok(messages[1].includes('زيارة متكررة'));
await visit(request(identity+'; '+suppression), context);
assert.equal(messages.length,2,'reload suppressed');
await visit(request(identity.replace(/\.([a-f0-9])/,'.z')), {});
assert.ok(messages[2].includes('أول زيارة'));
assert.ok(messages[2].includes('غير متاح'));
assert.ok(!messages[2].includes(id));
await visit(request(), context);
assert.ok(!messages[3].includes(id),'another browser gets another ID');
assert.equal(cookies.length,2,'both cookies independently returned');
console.log('PASS: stable signed numeric ID, returning label, distinct browser, tamper rejection, coarse geo, missing geo, no IP/coordinates, reload suppression, two cookies.');
