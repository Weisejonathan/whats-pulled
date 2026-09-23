# Detector 03: one card, multiple views

The review object represents a card. Captured frames are immutable evidence attached
to it. POST accepts a unique frame/retry `id`, a browser `sessionId` and a presentation
`trackId`; the response contains the canonical review observation ID. Clients must
upsert by that returned ID, not assume it equals the uploaded frame ID.

## Recognition

- Incomplete local readings receive up to five attempts on a stable presentation,
  with a bounded additional allowance for substantially sharper images. Sampling
  continues during OCR and upload backpressure, so disappearance is still observed.
- Continuous appearance plus agreeing read fields supports grouping. Neither a
  name nor a perceptual hash identifies an unnumbered physical copy after removal.
- Printed first/last names must be spatially neighboring. Visible names from
  overlapping cards prevent assigning an otherwise unassociated serial.
- Name and serial crops retain their own original image URL and dimensions when
  a later frame becomes the group's cover image.
- Sideways images get an evidence-validated orientation retry. Serial regions on
  reliably located cards are read even when the general text detector missed them.
- Checklist print runs can resolve two actually read denominators only when their
  numerators agree and exactly one denominator is supported. Raw disagreement and
  an explicit note remain available; no digit is generated from catalog metadata.
- Color is a hint from two agreeing foil regions. Chrome layouts use two patches
  in the upper foil corner, excluding the green branding and clothing. A whole
  uncropped card needs verified logo/name/certification positions before this
  shortcut is accepted. Color can suggest matching catalog parallel labels,
  but never fills the individual serial or selects a card.

## Storage and approval

`detector_observations` remains the canonical review row; new
`detector_observation_frames` retains captured evidence and retry mappings.
`detector_group_identities` maps an owner-scoped catalog variant + full serial to
its canonical row. Ingestion uses a transaction and an owner advisory lock.

Unknown fields can be completed by later frames. Contradictory known names,
serials or variants split instead of overwriting. Explicitly selected, manually
edited and approved fields are protected. The original prediction remains intact.

Additional sightings of an approved card do not publish another pull. Existing
approval row locks, revision checks and physical-copy uniqueness remain active.
An operator can explicitly combine compatible pending duplicates into a pending
or approved target. The source is retained as an alias, not deleted. Tombstones
prevent late responses from restoring obsolete review tiles.

Automatic AI waits for a brief pause in evidence updates, uses the latest revision,
and is capped at two requests per card. A stale result never replaces current
evidence or an approval. Upload, AI and recognition do not stop the live video.

## Deployment

Apply only `drizzle/0010_detector_card_groups.sql`, not the historical migration
sequence. The production Vercel prebuild runs `scripts/migrate-detector-groups.mjs`
against its configured database. It checks the existing detector approval schema,
uses a schema advisory lock and a transaction, and stops deployment on failure.
The migration is additive and safe to rerun; it does not backfill or delete old
observations, cards or pulls. Local builds skip remote migration.

## Verification and limits

- `tests/detector-grouping.test.ts` executes the real ingestion, merge and approval
  SQL in PGlite, including repeated migration, five views/one card, retry identity,
  owner isolation, conflicting copies, manual protection and one approved pull.
- Tracker/review tests cover disappearance during OCR/backpressure, late responses,
  stale AI revisions, upload limits and merged-entry tombstones.
- `scripts/verify-detector-groups.mjs` runs real browser OCR five times and checks
  one track, one review card, field crops and one approval. Persistence/paid AI are
  mocked in this UI test; SQL is verified separately.
- Existing browser checks cover webcam/screen replay, offline recovery, live-video
  continuity, delayed AI, responsive layout and approval revision handling.

Saved stream stills are development examples, not an independent video accuracy
evaluation. Some names/serials remain unreadable. Reliable localization of heavily
overlapped cards still needs a specialized detector and labeled real-stream data;
no such trained model is included in this release. Color stays unknown when its
image regions cannot be established safely. Two indistinguishable unnumbered
copies cannot be physically distinguished from appearance alone after removal.
