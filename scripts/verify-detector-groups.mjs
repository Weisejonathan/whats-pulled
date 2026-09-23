import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Real browser OCR and client tracking; mock persistence/AI here. The companion
// detector-grouping.test.ts executes the actual PostgreSQL ingestion/approval SQL.
const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
const base = process.env.DETECTOR_BASE_URL || "http://127.0.0.1:3024";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const set = { id: "11111111-1111-4111-8111-111111111111", name: "Test checklist", year: 2025 };
  const groups = new Map(), requests = [], actions = [];
  await page.route("**/api/detector/catalog**", route => route.fulfill({ json: { sets: [set], players: manifest.map(item => item.expected.playerName), printRuns: [5, 50] } }));
  await page.route("**/api/detector/observations", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { observations: [...groups.values()], merged: [], isAdmin: false } });
    const body = route.request().postDataJSON(); requests.push(body);
    assert.match(body.sessionId, /^[a-f0-9-]{36}$/); assert.match(body.trackId, /^[a-f0-9-]{36}$/);
    const key = `${body.sessionId}:${body.trackId}`, before = groups.get(key);
    const match = { cardId: "22222222-2222-4222-8222-222222222222", ...body.suggestion, cardName: "Test variant", serialNumber: "/5", cardUrl: "/cards/test", score: 1, evidence: ["Player", "Print run"], missing: [], conflicts: [] };
    const fieldEvidence = Object.fromEntries([["name", body.suggestion.playerName], ["serial", body.suggestion.limitation]].map(([field, value]) => [field, { value, source: "read", imageUrl: body.imageDataUrl, proof: body.proof?.[field], proofImage: body.proofImage }]));
    const item = { id: before?.id || body.id, revision: (before?.revision || 0) + 1, status: "pending", selectedCardId: null,
      imageUrl: body.imageDataUrl, thumbnailUrl: body.imageDataUrl, capturedAt: body.capturedAt,
      payload: { ...body, group: { seenCount: (before?.payload.group.seenCount || 0) + 1 }, evidence: fieldEvidence, matches: [match] } };
    groups.set(key, item); await route.fulfill({ json: { observation: item } });
  });
  await page.route("**/api/detector/observations/*", async route => {
    const body = route.request().postDataJSON(); actions.push(body);
    const entry = [...groups.entries()].find(([, item]) => route.request().url().endsWith(item.id));
    const item = entry[1]; assert.equal(body.revision, item.revision);
    if (body.action === "merge") {
      const target = [...groups.values()].find(row => row.id === body.targetId);
      assert.equal(body.targetRevision, target.revision);
      target.payload.group.seenCount += item.payload.group.seenCount;
      target.revision++; groups.delete(entry[0]);
      return route.fulfill({ json: { observation: target } });
    }
    if (body.action === "select") item.selectedCardId = body.cardId;
    else if (body.action === "approve") item.status = "approved";
    else throw new Error("Unexpected mutation");
    item.revision++; await route.fulfill({ json: { observation: item } });
  });
  await page.goto(base + "/stream-detector");
  await page.getByLabel("Set and year").selectOption(set.id);
  await page.getByText("Settings & help", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Use AI/ }).uncheck();
  const upload = page.locator("input[type=file]");
  const articles = page.locator(".detector-review-item");
  for (let i = 1; i <= 5; i++) {
    await page.waitForFunction(() => !document.querySelector('input[type=file]').disabled, {}, { timeout: 90000 });
    await upload.setInputFiles(manifest[0].image);
    await articles.getByText(`${i} views · one card · one approval`, { exact: true }).waitFor();
    assert.equal(await articles.count(), 1, "Repeated views must not create extra review cards");
  }
  assert.equal(requests.length, 5);
  assert.equal(new Set(requests.map(item => item.trackId)).size, 1);
  assert.equal(await articles.getByRole("img", { name: "Serial proof crop" }).count(), 1);
  await page.getByLabel("Pulled by", { exact: true }).fill("Browser verification");
  assert.equal(await page.getByRole("button", { name: "Approve", exact: true }).count(), 1);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByText("Approved — pull saved.", { exact: true }).waitFor();
  assert.deepEqual(actions.map(item => item.action), ["select", "approve"]);
  await page.getByLabel("Filter review queue").selectOption("all");
  await page.screenshot({ path: "/tmp/detector-v3-group-desktop.png", fullPage: true });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await articles.last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/detector-v3-group-mobile.png", fullPage: false });
  const original = [...groups.values()][0];
  const legacy = { ...original, id: "44444444-4444-4444-8444-444444444444", status: "pending", selectedCardId: null, revision: 1,
    payload: { ...original.payload, group: { seenCount: 1 } } };
  groups.set("legacy", legacy);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.detector-review-item').length === 2);
  const duplicate = articles.filter({ has: page.getByRole("button", { name: "Approve", exact: true }) });
  await duplicate.getByText("Combine duplicate", { exact: true }).click();
  await duplicate.getByLabel("Existing card").selectOption(original.id);
  await duplicate.getByRole("button", { name: "Combine into one card", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.detector-review-item').length === 1);
  assert.equal(actions.filter(item => item.action === "approve").length, 1, "Merge into approved card must not publish again");
  assert.equal(original.payload.group.seenCount, 6);
  assert.deepEqual(errors, []);
  console.log("PASS: five real OCR uploads, one track, one review card, field proof crops and one approval; responsive with no browser errors. Persistence mocked; SQL separately verified.");
} finally { await browser.close(); }
