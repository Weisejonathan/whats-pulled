import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Real local worker and UI; isolate catalog, persistence and paid AI services.
// Usage: node scripts/verify-detector-browser.mjs path/to/benchmark-manifest.json
const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.ok(manifest.length >= 2, 'Provide at least two labeled card images');
const origin = process.env.DETECTOR_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const page = await browser.newPage();
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 const set = { id: '11111111-1111-4111-8111-111111111111', name: 'Benchmark checklist', year: 2025 };
 const observations = []; let aiCalls = 0, offline = false, releaseAi;
 await page.route('**/api/detector/catalog**', route => offline ? route.abort() : route.fulfill({ json: { sets: [set], players: manifest.map(item => item.expected.playerName) } }));
 await page.route('**/api/detector/observations', async route => {
   if (offline) return route.abort();
   if (route.request().method() === 'GET') return route.fulfill({ json: { observations, isAdmin: false } });
   const body = route.request().postDataJSON();
   const item = { id: body.id, revision: 0, status: 'pending', selectedCardId: null, imageUrl: body.imageDataUrl, thumbnailUrl: body.imageDataUrl, capturedAt: body.capturedAt, payload: { ...body, matches: [] }, overlayError: null };
   observations.push(item); await route.fulfill({ json: { observation: item } });
 });
 await page.route('**/api/detector/vision', async route => {
   aiCalls++;
   await new Promise(resolve => { releaseAi = resolve; });
   await route.fulfill({ json: { suggestion: { ...manifest[0].expected, setId: set.id, setName: set.name }, detectedText: 'mock-provider', notes: 'Mock AI result', model: 'mock-provider', durationMs: 3000 } });
 });
 await page.goto(origin + '/stream-detector');
 await page.getByLabel('Set and year').selectOption(set.id);
 const upload = page.locator('input[type=file]');
 await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled, {}, { timeout: 90000 });
 const latest = page.getByRole('region', { name: 'Latest local recognition' });
 async function capture(sample) {
   await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled);
   await upload.setInputFiles(sample.image);
   await latest.getByRole('heading', { name: sample.expected.playerName, exact: true }).waitFor();
   assert.ok((await latest.innerText()).includes('Serial: ' + sample.expected.limitation));
 }
 await capture(manifest[0]);
 await page.getByRole('button', { name: 'AI review', exact: true }).first().waitFor();
 assert.equal(aiCalls, 0, 'A complete confident reading must not start paid AI');
 // Start a deliberately delayed review, then capture the next card.
 await page.getByRole('button', { name: 'AI review', exact: true }).first().click();
 await page.waitForFunction(() => document.body.textContent.includes('AI review is running'));
 await capture(manifest[1]);
 const secondText = await latest.innerText();
 while (!releaseAi) await new Promise(resolve => setTimeout(resolve, 20));
 assert.equal(aiCalls, 1, 'Only one provider request may be in flight');
 releaseAi();
 await page.getByRole('button', { name: 'Use AI suggestion', exact: true }).waitFor();
 assert.equal(await latest.innerText(), secondText, 'A delayed review must not replace the latest card');
 assert.equal(await page.getByRole('button', { name: 'Save and rematch', exact: true }).count(), 0, 'AI must not silently open or replace an edit');
 assert.equal(observations.length, 2);
 // Drive the actual screen-capture sampler with a canvas-backed video stream.
 await page.getByText('Settings & help', { exact: true }).click();
 await page.getByRole('checkbox', { name: /Use AI/ }).uncheck();
 await page.getByText('Adjust focus area', { exact: true }).click();
 for (const [label, value] of [['x', '0'], ['y', '0'], ['width', '100'], ['height', '100']]) await page.getByRole('slider', { name: label, exact: true }).fill(value);
 async function installStream() { await page.evaluate(() => {
   const canvas = Object.assign(document.createElement('canvas'), { width: 1200, height: 1600 });
   const context = canvas.getContext('2d');
   let card = null;
   const draw = () => { context.fillStyle = '#777'; context.fillRect(0, 0, canvas.width, canvas.height); if (card) context.drawImage(card, 0, 0, canvas.width, canvas.height); requestAnimationFrame(draw); };
   draw();
   window.__showCard = async source => { const image = new Image(); image.src = source; await image.decode(); card = image; };
   navigator.mediaDevices.getDisplayMedia = async () => { window.__captureStream = canvas.captureStream(15); return window.__captureStream; };
 }); }
 await installStream();
 await page.getByRole('button', { name: 'Start capture', exact: true }).click();
 const liveTimes = [];
 for (const sample of manifest.slice(0, 2)) {
   const image = 'data:image/webp;base64,' + (await readFile(sample.image)).toString('base64');
   const start = Date.now();
   await page.evaluate(source => window.__showCard(source), image);
   await latest.getByRole('heading', { name: sample.expected.playerName, exact: true }).waitFor();
   liveTimes.push(Date.now() - start);
   assert.ok((await latest.innerText()).includes('Serial: ' + sample.expected.limitation));
   await page.waitForTimeout(500);
 }
 await page.getByRole('button', { name: 'Stop capture', exact: true }).click();
 assert.equal(observations.length, 4, 'Two stable presentations must yield exactly two additional observations');
 console.log('Screen capture arrival-to-visible-result milliseconds:', liveTimes);
 // Webcam uses the same reader and changing source releases the previous track.
 await page.getByRole('button', { name: 'Webcam', exact: true }).click();
 await page.evaluate(() => { navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getDisplayMedia; });
 await page.evaluate(source => window.__showCard(source), 'data:image/webp;base64,' + (await readFile(manifest[0].image)).toString('base64'));
 await page.getByRole('button', { name: 'Start capture', exact: true }).click();
 await latest.getByRole('heading', { name: manifest[0].expected.playerName, exact: true }).waitFor();
 await page.getByRole('button', { name: 'Stream / screen', exact: true }).click();
 assert.equal(await page.evaluate(() => window.__captureStream.getVideoTracks()[0].readyState), 'ended');
 await page.getByRole('button', { name: 'Start capture', exact: true }).waitFor();
 console.log('PASS: webcam frames are read; switching source stops its track without navigation.');
 // A full recovery queue must pause sampling without terminating the live video.
 const proof = 'data:image/webp;base64,' + (await readFile(manifest[0].image)).toString('base64');
 await page.evaluate(async ({ proof, set }) => {
   const db = await new Promise((resolve, reject) => { const r = indexedDB.open('whatspulled-detector-outbox', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
   await new Promise((resolve, reject) => {
     const tx = db.transaction('frames', 'readwrite');
     for (let i = 0; i < 8; i++) tx.objectStore('frames').put({ id: crypto.randomUUID(), capturedAt: new Date().toISOString(), imageDataUrl: proof, suggestion: { setId: set.id, setName: set.name } });
     tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
   }); db.close();
 }, { proof, set });
 offline = true;
 await page.reload();
 await page.getByLabel('Set and year').selectOption(set.id);
 await page.getByRole('button', { name: 'Start capture', exact: true }).waitFor();
 await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Start capture' && !b.disabled), {}, { timeout: 90000 });
 await page.getByText('Settings & help', { exact: true }).click();
 await page.getByRole('checkbox', { name: /Use AI/ }).uncheck();
 await page.getByText('Adjust focus area', { exact: true }).click();
 for (const [label, value] of [['x', '0'], ['y', '0'], ['width', '100'], ['height', '100']]) await page.getByRole('slider', { name: label, exact: true }).fill(value);
 await installStream();
 await page.evaluate(source => window.__showCard(source), proof);
 await page.getByRole('button', { name: 'Start capture', exact: true }).click();
 await page.getByText(/Recognition paused — eight frames/).waitFor();
 const before = await page.locator('video').evaluate(video => video.currentTime);
 await page.waitForFunction(time => document.querySelector('video').currentTime > time + 1, before);
 assert.equal(await page.evaluate(() => window.__captureStream.getVideoTracks()[0].readyState), 'live');
 assert.equal(await page.getByRole('button', { name: 'Retry upload', exact: true }).count(), 8);
 await page.screenshot({ path: '/tmp/detector-live-backpressure.png', fullPage: false });
 offline = false;
 await page.evaluate(() => window.dispatchEvent(new Event('online')));
 await latest.getByRole('heading', { name: manifest[0].expected.playerName, exact: true }).waitFor();
 assert.equal(await page.evaluate(() => window.__captureStream.getVideoTracks()[0].readyState), 'live');
 await page.getByRole('button', { name: 'Stop capture', exact: true }).click();
 assert.equal(await page.evaluate(() => window.__captureStream.getVideoTracks()[0].readyState), 'ended');
 // Reconnected uploads must drain without eight manual Retry clicks.
 await page.waitForFunction(() => !document.querySelector('.detector-outbox'), {}, { timeout: 45000 });
 console.log('PASS: full outbox keeps video advancing; upload retry resumes recognition; explicit Stop releases the track.');
 // An uncertain local capture must be saved before the slow automatic AI reply.
 await page.getByRole('checkbox', { name: /Use AI/ }).check();
 const beforeAi = aiCalls, beforeSaved = observations.length;
 releaseAi = undefined;
 const blank = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 440; const x = c.getContext('2d'); x.fillStyle = '#777'; x.fillRect(0, 0, 320, 440); return c.toDataURL('image/png').split(',')[1]; });
 await upload.setInputFiles({ name: 'uncertain.png', mimeType: 'image/png', buffer: Buffer.from(blank, 'base64') });
 await page.getByText('AI review is running for one frame. Local suggestions are already available.', { exact: true }).waitFor();
 assert.equal(aiCalls, beforeAi + 1);
 assert.equal(observations.length, beforeSaved + 1, 'Persist the local capture before waiting on AI');
 const uncertainId = observations.at(-1).id;
 releaseAi();
 await page.getByRole('button', { name: 'Use AI suggestion', exact: true }).first().waitFor();
 assert.equal(observations.find(item => item.id === uncertainId).payload.suggestion.playerName || '', '', 'AI cannot silently rewrite persisted evidence');
 console.log('PASS: uncertain local evidence is saved while AI is pending; later suggestions remain opt-in.');
 // Reload with failed catalog/storage endpoints: the cached checklist and local
 // model assets must still permit capture, and the proof must remain in outbox.
 offline = true;
 await page.reload();
 await page.getByLabel('Set and year').selectOption(set.id);
 await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled, {}, { timeout: 90000 });
 await page.getByText('Settings & help', { exact: true }).click();
 await page.getByRole('checkbox', { name: /Use AI/ }).uncheck();
 await capture(manifest[0]);
 await page.getByRole('button', { name: 'Retry upload', exact: true }).waitFor();
 await page.reload();
 await page.getByRole('button', { name: 'Retry upload', exact: true }).waitFor();
 assert.deepEqual(errors, []);
 console.log('PASS: actual OCR, API skipping, one AI request, stale-review isolation, cached offline checklist and proof recovery; no browser errors.');
} finally { await browser.close(); }
