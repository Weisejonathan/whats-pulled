# Detector 02

Webcam and screen sharing now use the same page and reader. Switching source
releases the previous track without navigation or losing the review queue.
Local results appear immediately and are saved before optional AI review starts.
AI results remain revision-bound suggestions requiring an explicit edit.

A single visible catalog candidate can be approved with one click. This sends the
existing select request, then approves its returned revision. Multiple candidates
still require selection. Missing individual serials and breaker names block the
button; the server independently verifies ownership, revision, serial and duplicate
pulls. Failed uploads remain in IndexedDB. A full outbox pauses sampling, not video.

## Performance check — 2026-09-22

Chrome 153 on the development Mac; two user-provided card images, each tested as
original, compressed JPEG, six-degree rotation and dimmed image, three runs each.
The same benchmark and source images were used before and after the change.

| Warm worker metric | Before | Detector 02 |
| --- | ---: | ---: |
| Median | 641 ms | 490 ms |
| p95 | 729 ms | 687 ms |
| Full name + full serial + autograph correct | 24/24 | 24/24 |

The worker uses single-line recognition batches to reduce padding across text
lines of different lengths. Detection resolution stays at 960. Reducing it to
832 was rejected after the rotated Cobolli sample lost its serial reading.
Live sampling uses 80 ms instead of 120 ms with the same three-frame stability
requirement. Model preparation starts on mount. Local-only capture no longer
encodes unused AI detail crops. The two synthetic live presentations produced
visible results at approximately 1.3 seconds. This limited fixture set is not an
accuracy guarantee or a benchmark of the user's YouTube stream.

## Verification

- `tsx --test tests/*.test.ts`: access, matching, real PostgreSQL approval,
  duplicate prevention, worker deadlines, frame tracking and storage tests.
- `node scripts/verify-detector-browser.mjs /path/to/manifest.json`: real OCR,
  canvas-backed stream/webcam, delayed AI, outbox backpressure and offline recovery.
- `node scripts/verify-detector-v2.mjs /path/to/manifest.json`: source switching,
  one-click approval with returned revision, ambiguous/partial-serial blocking,
  responsive layouts at 390, 768 and 1440 px.
- `tsx scripts/benchmark-live-detector.ts --manifest /path/to/manifest.json
  --base-url http://127.0.0.1:3019 --runs 3 --augment --strict --output results.json`

Browser scripts mock catalog, storage and AI responses and never publish real
pulls. The database test separately exercises the approval transaction in PGlite.
