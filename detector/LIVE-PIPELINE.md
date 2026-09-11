# Live card detector

Camera/OBS and screen capture use `app/detector/detector-workspace.tsx`.
This pipeline replaces the live workspace's unconditional cloud recognition with
local visual extraction. The advanced Tesseract tools, Instagram detector, Python OBS demo and mock sender
have been removed. Legacy endpoints return HTTP 410. Only the unified review queue
can publish detected cards; historical records remain intact.

## Runtime

1. Select the checklist before capture. Warm a dedicated browser worker with
   PaddleOCR JS 0.4.2: `PP-OCRv6_tiny_det` + `PP-OCRv6_small_rec`, ONNX WASM,
   one thread. Model files are fetched from the official distribution and cached
   by URL in CacheStorage. Images are processed locally during this stage.
2. Sample the focus area every 120 ms. Require three stable, usable samples and
   choose the sharpest. Never accumulate an inference backlog. A witnessed removal
   re-arms recognition for another visually identical copy; one corrupt frame does
   not. Full original captures remain the review proof.
3. MediaPipe Hand Landmarker provides supporting evidence for card selection.
   OpenCV combines closed convex borders with a color-hull candidate, ranks card
   proportions over plastic sleeves, and applies a perspective transform. A hand
   supports a boundary only when it extends outside and touches that boundary,
   reducing confusion with hands printed on the card. Hand detection is optional:
   cards without a visible hand can still be read. This is not a trained card
   corner detector, and multiple overlapping cards remain a difficult case.
4. Read scene text on the rectified card. If needed, re-read numeric crops,
   a magnified name/certification band, or original pixels within the detected
   card. Only actual image readings may recover a slash: `37150` never becomes
   `37/50` by a textual guess. Names require the full printed catalog name.
5. Resolve name, individual serial and autograph evidence separately. Conflicting
   readings remain unknown. OCR line scores are quality signals, not calibrated
   identity probabilities. A second frame from the same stable burst can replace
   an incomplete first reading while retaining its complete proof; identities
   from two frames are never spliced together.
6. Display the local result immediately. A 1,700 ms recognition budget terminates
   the actual worker on timeout, then reinitializes it. A slow/unavailable reader
   falls back to reviewable captures. Initialization has a separate 90-second
   limit and is excluded from warm inference timings.
7. Automatic AI review only runs for incomplete, conflicting or weaker readings,
   with at most one provider request in flight. Other cards keep processing.
   Manual AI results are cached against the observation revision and applied only
   through “Use AI suggestion”; they do not overwrite the operator's draft.
   AI omissions preserve local evidence, and explicit disagreements require review.
8. IndexedDB retains captures until upload succeeds. Public checklist snapshots
   have a seven-day local cache, so an already-prepared browser can keep capturing
   when catalog/storage endpoints fail. Browser storage eviction or a first-ever
   offline start can still prevent model loading. Approval, revisions and database
   duplicate protections remain required before a capture becomes a published pull.

## Autograph scope

The local signature check is a conservative **blue-ink heuristic**, not a trained
signature classifier or authenticity detector. It requires a legible autograph
certification label plus a spatially associated connected pen-like stroke pattern.
Tests reject certification text alone, solid blue boxes and rectangular borders.
Black ink, unsigned cards, illegible certification and uncertain patterns produce
`null` (unknown), not a fabricated yes/no. Printed signature facsimiles may pass
this visual test. General signed/unsigned accuracy therefore still requires a
representative labeled dataset, including these negative and difficult cases.

## Measured results — 2026-09-11

On an Apple M5 Pro, Chrome 153, using the actual browser worker:

| Dataset | Exact name + individual serial + autograph | Warm p50 | Warm p95 |
| --- | --- | --- | --- |
| Two supplied images × four conditions × five repeats | 40/40 | 688 ms | 766 ms |

Conditions: original, 1080-pixel JPEG at quality 45, 6-degree rotation, and
brightness 0.7. Amanda Anisimova `1/5` and Flavio Cobolli `37/50` both returned
visible autograph evidence in every condition. Initial model preparation took
7,855 ms. The raw readings and configuration are in
[`benchmarks/example-cards.json`](benchmarks/example-cards.json).

These are **eight development inputs repeated five times**, not 40 independent
cards or held-out accuracy validation. Both inputs helped select models and tune
preprocessing. No real hand-held stream clips or unsigned real cards were supplied.
The results must not be generalized into an all-cards or all-hardware guarantee.

A browser integration test also exercised the actual screen-capture sampling path
using a canvas-backed video stream: first and second card appeared with correct
name/serial after 1,792 ms and 1,334 ms respectively, including sampling and UI
work. These are two single-run measurements, not an end-to-end p95. The test verifies
exactly one observation per stable presentation, local upload recognition, no
unnecessary AI call, one delayed manual AI request, no stale-result overwrite,
offline catalog reuse and capture recovery after reload. Catalog, storage and paid
AI endpoints were mocked; the OCR, hand model, geometry and browser UI were real.

TypeScript and the Next.js production build pass. The automated suite currently
has 42 passing tests, including real OpenCV,
worker cancellation, field conflicts, signature negatives, catalog caching and
PostgreSQL approval/revision/duplicate behavior. Production database writes and
paid provider responses are not exercised by the browser harness.

## Reproduce

`npm run dev` and `npm run build` prepare the self-hosted worker/WASM assets through
pre-scripts. Generated `public/detector-runtime` is ignored by Git; builds must run
`npm run build` (or explicitly run `npm run detector:runtime` before `next build`).
The ML code is kept out of the initial React bundle and runs off the UI thread.
Use a secure context (HTTPS or localhost) and a browser supporting module workers,
WebAssembly, OffscreenCanvas and the requested capture API. The tested browser is
Chrome; Safari/mobile support and performance have not been validated.

Create a manifest with your own files:

```json
[
  { "image": "/absolute/path/card.webp", "expected": {
    "playerName": "Amanda Anisimova", "limitation": "1/5", "isAutographed": true
  } }
]
```

```sh
npm test
npm run detector:benchmark -- --manifest /path/cards.json --augment --runs 5 --strict
node scripts/verify-detector-browser.mjs /path/two-cards.json
```

Start the app before browser benchmarks. Benchmark `--base-url` selects a different
origin; `--output` selects the JSON report. `--strict` requires all labeled fields
to match and warm p95 <= 2,000 ms. The integration harness expects two complete,
confident signed examples and supports `DETECTOR_BASE_URL`. These scripts never
call paid AI or write production observations.

## Validation still needed

Use held-out recordings from actual breaking sessions, including different sets,
foil reflections, sleeves, black signatures, unsigned cards, occluded names,
multiple cards, motion blur and repeated copies. Include a complete checklist,
not just the expected players, when measuring identity ambiguity. Measure exact
full-name and numerator/denominator accuracy, signature precision/recall and
abstention separately from latency. Measure end-to-end p50/p95 from the first
readable frame on the intended streaming hardware. A trained corner/card model
and a dedicated signature-presence classifier can then be evaluated against this
reproducible baseline rather than substituted without evidence.

## Primary runtime documentation

- [PaddleOCR JS SDK](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js/packages/core)
- [PaddleOCR browser deployment](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/cross_platform/browser.en.md)
- [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
