# Detector 03: one card, multiple views

The review object represents a card. Captured frames are immutable evidence attached
to it. POST accepts a unique frame/retry `id`, a browser `sessionId` and a presentation
`trackId`; the response contains the canonical review observation ID. Clients must
upsert by that returned ID, not assume it equals the uploaded frame ID.

## Recognition

- A bounded exact-pixel cache skips unchanged screenshots before OCR and upload.
  Saved responses and merge aliases point these repeats at the same review card.
- Incomplete local readings receive up to five attempts on a stable presentation,
  with a bounded additional allowance for substantially sharper images. Sampling
  continues during OCR and upload backpressure, so disappearance is still observed.
- A continuous presentation does not expire after twelve seconds. Only the first
  proof, new fields, materially improved quality, or up to two complementary
  incomplete views need uploading. A unique compatible track can be reacquired
  after a transient unrelated view, within the same presentation.
  New fields include the first supported color hint and checklist number.
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
  but never fills the individual serial or selects a card. The color hint retains
  its own source frame even when another frame supplies the sharper cover image.

## Storage and approval

`detector_observations` remains the canonical review row; new
`detector_observation_frames` retains captured evidence and retry mappings.
`detector_group_identities` maps an owner-scoped catalog variant + full serial to
its canonical row. Ingestion uses a transaction and an owner advisory lock.

Unknown fields can be completed by later frames. Contradictory known names,
serials or variants in different images split instead of overwriting. Identical
pixels map to one review card even if OCR disagrees; conflicting readings block
approval until the operator saves corrected details. The server computes its own
normalized image SHA256 and reuses existing image storage when available. Explicitly selected, manually
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

Apply `drizzle/0010_detector_card_groups.sql` and
`drizzle/0011_detector_exact_images.sql`, not the historical migration sequence. The production Vercel prebuild runs `scripts/migrate-detector-groups.mjs`
against its configured database. It checks the existing detector approval schema,
uses a schema advisory lock and a transaction, and stops deployment on failure.
The migration is additive and safe to rerun. It indexes hashes from historical
content-addressed proof URLs; a matching upload can combine existing pending
duplicates while retaining their evidence and aliases. It does not delete cards
or pulls. Local builds skip remote migration.

## Verification and limits

- `tests/detector-grouping.test.ts` executes the real ingestion, merge and approval
  SQL in PGlite, including repeated migration, five views/one card, retry identity,
  owner isolation, conflicting copies, manual protection and one approved pull.
- Tracker/review tests cover disappearance during OCR/backpressure, late responses,
  stale AI revisions, upload limits and merged-entry tombstones.
- `tests/detector-exact-images.test.ts` verifies server-computed image identity,
  cross-session duplicates, conflicting readings, concurrent uploads, owner
  isolation and repair of historical duplicate rows in real SQL.
- `scripts/verify-detector-groups.mjs` submits the same screenshot five times and
  checks that real browser OCR produces only one upload and one review card, with
  field crops and one approval. Persistence/paid AI are
  mocked in this UI test; SQL is verified separately.
- Existing browser checks cover webcam/screen replay, offline recovery, live-video
  continuity, delayed AI, responsive layout and approval revision handling.

Saved stream stills are development examples, not an independent video accuracy
evaluation. Some names/serials remain unreadable. Reliable localization of heavily
overlapped cards still needs a specialized detector and labeled real-stream data;
no such trained model is included in this release. Color stays unknown when its
image regions cannot be established safely. Two indistinguishable unnumbered
copies cannot be physically distinguished from appearance alone after removal.
