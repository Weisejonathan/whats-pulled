import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base = process.env.DETECTOR_BASE_URL || 'http://127.0.0.1:3019';
const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
const proof = 'data:image/webp;base64,' + (await readFile(manifest[0].image)).toString('base64');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 const set = { id: '11111111-1111-4111-8111-111111111111', name: 'Topps Chrome Tennis 2025', year: 2025 };
 const match = { cardId: '22222222-2222-4222-8222-222222222222', playerName: 'Amanda Anisimova', cardName: 'Chrome Autographs Red', parallel: 'Red', serialNumber: '/5', cardNumber: 1, imageUrl: proof, cardUrl: '/cards/test', evidence: ['Player', 'Set', 'Print run'], missing: [], conflicts: [], score: .8 };
 let item = { id: '33333333-3333-4333-8333-333333333333', revision: 0, status: 'pending', selectedCardId: null, imageUrl: proof, thumbnailUrl: proof, capturedAt: new Date().toISOString(), payload: { suggestion: { ...manifest[0].expected, setId: set.id, setName: set.name }, matches: [match], notes: 'Check visible proof.' } };
 const actions = [];
 let releaseAi;
 await page.route("**/api/detector/vision", async r => { await new Promise(resolve => { releaseAi = resolve; }); await r.fulfill({ json: { suggestion: {}, notes: "Delayed test result" } }); });
 await page.route('**/api/detector/catalog**', r => r.fulfill({ json: { sets: [set], players: manifest.map(x => x.expected.playerName) } }));
 await page.route('**/api/detector/observations', r => r.fulfill({ json: { observations: [item], isAdmin: false } }));
 await page.route('**/api/detector/observations/*', async r => {
  const body = r.request().postDataJSON(); actions.push(body);
  assert.equal(body.revision, item.revision);
  if (body.action === 'select') item = { ...item, selectedCardId: body.cardId, revision: item.revision + 1 };
  else if (body.action === 'approve') { assert.equal(item.selectedCardId, match.cardId); item = { ...item, status: 'approved', revision: item.revision + 1 }; }
  else throw new Error('Unexpected action');
  await r.fulfill({ json: { observation: item } });
 });
 await page.goto(base + '/stream-detector');
 await page.getByRole('heading', { name: 'Amanda Anisimova', exact: true }).waitFor();
 for (const field of ['Full name', 'Serial / numbering', 'Checklist number', 'Autograph']) assert.equal(await page.getByRole('region', { name: 'Latest local recognition' }).getByText(field, { exact: true }).isVisible(), true);
 assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled(), true);
 await page.getByLabel('Pulled by', { exact: true }).fill('Browser test');
 assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isEnabled(), true);
 const url = page.url();
 await page.getByRole('button', { name: 'Webcam', exact: true }).click();
 await page.getByRole('combobox', { name: /^Camera/ }).waitFor();
 assert.equal(page.url(), url, 'Source switch must not navigate or lose the queue');
 await page.getByRole('button', { name: 'Stream / screen', exact: true }).click();
 await page.screenshot({ path: '/tmp/detector-v2-desktop.png', fullPage: true });
 for (const width of [390, 768, 1440]) {
  await page.setViewportSize({ width, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No horizontal overflow at ' + width);
 }
 await page.setViewportSize({ width: 390, height: 844 });
 await page.screenshot({ path: '/tmp/detector-v2-mobile.png', fullPage: true });
 await page.getByRole('button', { name: 'AI review', exact: true }).click();
 await page.getByText('AI review is running for one frame. Local suggestions are already available.', { exact: true }).waitFor();
 assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isEnabled(), true, 'AI must not block approval of saved evidence');
 await page.getByRole('button', { name: 'Approve', exact: true }).click();
 await page.getByText('Approved — pull saved.', { exact: true }).waitFor();
 while (!releaseAi) await new Promise(resolve => setTimeout(resolve, 20));
 releaseAi();
 assert.deepEqual(actions.map(a => a.action), ['select', 'approve']);
 assert.equal(actions[1].revision, 1, 'Approve must use the selected revision');
 // Multiple matches cannot silently select the first candidate.
 item = { ...item, revision: item.revision + 1, status: 'pending', selectedCardId: null, payload: { ...item.payload, matches: [match, { ...match, cardId: '44444444-4444-4444-8444-444444444444', parallel: 'Another variant' }] } };
 await page.getByRole('button', { name: 'Refresh', exact: true }).click();
 await page.getByRole('radio').first().waitFor();
 assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled(), true);
 // A unique catalog match cannot replace the unreadable individual copy.
 item = { ...item, revision: item.revision + 1, payload: { ...item.payload, matches: [match], suggestion: { ...item.payload.suggestion, limitation: '/5' } } };
 await page.getByRole('button', { name: 'Refresh', exact: true }).click();
 await page.getByText('Enter the full serial in Correct details before approving.', { exact: true }).waitFor();
 assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled(), true);
 assert.deepEqual(errors, []);
 console.log('PASS: source switch without navigation, responsive layout, one-click approval with correct revisions, ambiguous and incomplete cards blocked; no browser errors.');
} finally { await browser.close(); }
