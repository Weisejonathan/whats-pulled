import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

// Run against a production build with no DATABASE_URL or AUTH_SECRET.
const base = process.env.CACHE_TEST_URL ?? 'http://localhost:3031';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/, 'Test-only sessions must stay on localhost');
const path = '/cards/jannik-sinner-5-red-refractor';
const request = async (suffix = '', cookie = '') => {
  const response = await fetch(base + path + suffix, { headers: cookie ? { Cookie: cookie } : {} });
  return { response, html: await response.text() };
};
await request();
const cached = await request('?copy=3');
assert.equal(cached.response.status, 200);
assert.equal(cached.response.headers.get('x-nextjs-cache'), 'HIT');
assert.match(cached.response.headers.get('cache-control'), /s-maxage=3600/);
assert.match(cached.html, /Jannik Sinner/);
assert.doesNotMatch(cached.html, /Cache Test User|Logged in as/);
const token = (payload) => {
  const encoded = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000)+120 })).toString('base64url');
  return encoded + '.' + createHmac('sha256', 'local-development-secret').update(encoded).digest('base64url');
};
for (const cookie of ['wp_user_session=invalid', 'wp_admin_session=invalid']) {
  const privatePage = await request('?copy=3', cookie);
  assert.equal(privatePage.response.status, 200);
  assert.match(privatePage.response.headers.get('cache-control'), /private.*no-store/);
  assert.notEqual(privatePage.response.headers.get('x-nextjs-cache'), 'HIT');
}
const admin = await request('?copy=3', 'wp_admin_session='+token({role:'admin'}));
assert.match(admin.html, /Claim card/);
assert.match(admin.html, /Report pull/);
assert.match(admin.response.headers.get('cache-control'), /private.*no-store/);
const user = await request('?copy=3', 'wp_user_session='+token({role:'user', id:'test', displayName:'Cache Test User',email:'test@example.invalid',isAdmin:false}));
assert.match(user.html, /Cache Test User/);
assert.match(user.html, /Save favorite/);
assert.match(user.html, /Request claim/);
const publicAgain = await request('?copy=4');
assert.equal(publicAgain.response.headers.get('x-nextjs-cache'), 'HIT');
assert.doesNotMatch(publicAgain.html, /Cache Test User|Logged in as/);
const missing = await fetch(base + '/cards/does-not-exist-cache-regression');
assert.equal(missing.status, 404);
console.log('PASS: public ISR hit, shared query cache, both cookie bypasses, member/admin controls, no private data leakage, missing card 404');
