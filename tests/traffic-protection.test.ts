import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import robots from "../app/robots";
import { proxy } from "../proxy";

test("known high-volume AI crawlers are rejected before page rendering", () => {
  for (const userAgent of [
    "Mozilla/5.0 (compatible; GPTBot/1.4)",
    "Mozilla/5.0 (compatible; meta-externalagent/1.1)",
    "Mozilla/5.0 (compatible; Amazonbot/0.1)",
  ]) {
    const response = proxy(
      new NextRequest("https://www.whatspulled.com/login", {
        headers: { "user-agent": userAgent },
      }),
    );

    assert.equal(response?.status, 403);
    assert.equal(response?.headers.get("x-robots-tag"), "noindex, nofollow");
  }
});

test("normal visitors bypass crawler protection", () => {
  const response = proxy(
    new NextRequest("https://www.whatspulled.com/login", {
      headers: { "user-agent": "Mozilla/5.0 Safari/605.1.15" },
    }),
  );

  assert.equal(response, undefined);
});

test("robots metadata disallows expensive private routes and AI crawlers", () => {
  const metadata = robots();
  const rules = Array.isArray(metadata.rules) ? metadata.rules : [metadata.rules];
  const aiRule = rules.find((rule) =>
    Array.isArray(rule.userAgent) && rule.userAgent.includes("GPTBot"),
  );
  const generalRule = rules.find((rule) => rule.userAgent === "*");

  assert.equal(aiRule?.disallow, "/");
  assert.ok(Array.isArray(generalRule?.disallow));
  assert.ok(generalRule?.disallow.includes("/login"));
  assert.ok(generalRule?.disallow.includes("/api/"));
});
