import test from "node:test";
import assert from "node:assert/strict";
import { canManageObservation, isDetectorWriteRequest } from "../lib/detector/access-policy";

test("public visitors can review their own browser entries without an account", () => {
  assert.equal(canManageObservation({ isAdmin: false, ownerKey: "browser-a" }, "browser-a"), true);
});
test("public visitors cannot change other browsers or legacy admin entries", () => {
  const visitor = { isAdmin: false, ownerKey: "browser-a" };
  for (const owner of ["browser-b", null, undefined, ""]) assert.equal(canManageObservation(visitor, owner), false);
  assert.equal(canManageObservation({ isAdmin: false, ownerKey: null }, null), false);
});
test("admins retain access to both legacy and visitor review entries", () => {
  for (const owner of ["browser-a", undefined]) assert.equal(canManageObservation({ isAdmin: true, ownerKey: null }, owner), true);
});
test("public detector writes reject cross-origin requests and form submissions", () => {
  const request = (origin: string, type: string) => new Request("https://whatspulled.com/api/detector/observations", { method: "POST", headers: { origin, "content-type": type } });
  assert.equal(isDetectorWriteRequest(request("https://whatspulled.com", "application/json")), true);
  assert.equal(isDetectorWriteRequest(request("https://unrelated.example", "application/json")), false);
  assert.equal(isDetectorWriteRequest(request("https://whatspulled.com", "text/plain")), false);
  assert.equal(isDetectorWriteRequest(request("https://whatspulled.com", "application/x-www-form-urlencoded")), false);
});
