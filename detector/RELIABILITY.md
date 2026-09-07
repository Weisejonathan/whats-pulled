# Detector review workflow

Both `/detector` (camera/OBS) and `/stream-detector` (screen capture) use the same capture and review engine. Admin sign-in is required. Select the catalog set/year, focus on one foreground card, and enter the breaker before confirming a pull.

1. Local image comparison identifies stable presentations and selects a sharp frame. Conservative quadrilateral detection can rectify perspective; if uncertain the full focus area is kept.
2. The frame is written to a device-local IndexedDB outbox before recognition. At most eight frames are queued for sequential inference; capture pauses if the queue is full. Failed uploads can be retried without producing a second observation.
3. Vision reads each field independently. Missing details remain unknown. The returned model score does not authorize publication. Requests are authenticated and limited to 20/minute and 400/hour across the project.
4. Images are optimized and stored in Vercel Blob; PostgreSQL stores URLs, evidence, original predictions and review decisions. Existing images are not migrated or deleted.
5. Correcting a field clears the selected card and rematches. Select an exact compatible candidate, check the full copy/print-run serial and confirm. PostgreSQL serializes approvals; the stable observation ID is the idempotency key.
6. Overlay delivery is separate and retryable. Withdrawing a pull rejects its report and overlay event; it retains proof/history and does not overwrite catalog images.

## Deployment

Apply `drizzle/0007_detector_reliability.sql` **once in a transaction**, before deploying the new routes. It is additive; it does not rewrite or delete legacy rows. The legacy migration history is incomplete (some schema changes were performed out of band), so do not replay every old migration on production. Verify the current schema and apply only the new migration.

Required environment variables: existing database/auth/OpenAI settings and `BLOB_READ_WRITE_TOKEN` (or supported Blob OIDC configuration). `OPENAI_VISION_MODEL` remains configurable. Production credentials must not be copied into previews.

## Tests and measured evaluation

`npm test` exercises matching ambiguity, contradictory fields, copy validation, frame stability, perspective math and PostgreSQL approval/retraction functions against an isolated PGlite database. No production records or paid inference are used.

Export the review queue and run `npm run detector:eval -- export.json`. The report compares original readings with human-corrected labels, and reports per-field accuracy, supported-suggestion precision, latency and token counts. It never calls an AI provider.

Before changing the model or enabling more automation, build a separately labelled video holdout covering normal cards, similar parallels, autographs, glare, blur, rotated cards, background cards and fast transitions. Group train/development/holdout by complete break session, not adjacent frames. Label every shown card, its exact catalog ID, copy number, visible interval and a no-card state. Report false positives, missed cards, duplicates, latency and actual provider cost. Do not claim video recall from the review queue alone, and do not tune thresholds on the holdout.

The Python companion remains a camera/OBS transport prototype. Its geometric score is frame confidence, not player identification. Its placeholder labels must not be treated as verified pulls.

Legacy OBS API submissions now enter the studio as pending events. They do not bypass human confirmation, and embedded frame images are also moved to Blob. The advanced Instagram utility processes up to two media images per request; submit further media separately.
