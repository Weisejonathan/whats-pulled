import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UploadRetry } from '../lib/detector/upload-retry';
test('retained uploads retry with backoff, stop after three attempts and recover on reconnect', () => {
 const retries = new UploadRetry();
 assert.equal(retries.ready('a', 0), true);
 retries.start('a', 0); assert.equal(retries.ready('a', 4999), false); assert.equal(retries.ready('a', 5000), true);
 retries.start('a', 5000); assert.equal(retries.ready('a', 19999), false); assert.equal(retries.ready('a', 20000), true);
 retries.start('a', 20000); assert.equal(retries.ready('a', 100000), false);
 assert.equal(retries.ready('b', 0), true);
 retries.online(); assert.equal(retries.ready('a', 100001), true);
 retries.start('a', 100001); retries.done('a'); assert.equal(retries.ready('a', 100002), true);
});
