-- An observation is now the canonical review card. Frames are immutable evidence.
-- Existing observations and approval/pull history are retained without guessing merges.
CREATE TABLE IF NOT EXISTS detector_observation_frames (
  id uuid PRIMARY KEY,
  observation_id uuid NOT NULL REFERENCES detector_observations(id),
  owner_key text NOT NULL,
  session_id uuid,
  track_id uuid,
  image_url text NOT NULL,
  thumbnail_url text NOT NULL,
  captured_at timestamptz NOT NULL,
  quality real NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detector_frames_presentation ON detector_observation_frames(owner_key, session_id, track_id);
CREATE INDEX IF NOT EXISTS detector_frames_observation ON detector_observation_frames(observation_id);
CREATE INDEX IF NOT EXISTS detector_frames_image ON detector_observation_frames(owner_key, image_url);
CREATE TABLE IF NOT EXISTS detector_group_identities (
  owner_key text NOT NULL,
  identity_key text NOT NULL,
  observation_id uuid NOT NULL REFERENCES detector_observations(id),
  PRIMARY KEY(owner_key, identity_key)
);

CREATE OR REPLACE FUNCTION detector_evidence_conflicts(a jsonb, b jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; x text; y text; sa text[]; sb text[];
BEGIN
  FOREACH k IN ARRAY ARRAY['setId', 'playerName', 'cardName', 'cardNumber'] LOOP
    x := regexp_replace(lower(coalesce(a->>k, '')), '[^a-z0-9]+', '', 'g');
    y := regexp_replace(lower(coalesce(b->>k, '')), '[^a-z0-9]+', '', 'g');
    IF x <> '' AND y <> '' AND x <> y THEN RETURN true; END IF;
  END LOOP;
  IF jsonb_typeof(a->'isAutographed') = 'boolean' AND jsonb_typeof(b->'isAutographed') = 'boolean'
     AND a->'isAutographed' <> b->'isAutographed' THEN RETURN true; END IF;
  sa := regexp_match(coalesce(a->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
  sb := regexp_match(coalesce(b->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
  IF sa IS NOT NULL AND sb IS NOT NULL AND (sa[2]::integer <> sb[2]::integer
     OR (sa[1] IS NOT NULL AND sb[1] IS NOT NULL AND sa[1]::integer <> sb[1]::integer)) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION ingest_detector_frame(
  p_id uuid, p_owner text, p_session uuid, p_track uuid, p_image text, p_thumbnail text,
  p_captured timestamptz, p_payload jsonb, p_overlay text, p_quality real, p_identity text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  target uuid; existing_owner text; candidates uuid[]; observation detector_observations;
  incoming jsonb := p_payload->'suggestion'; merged jsonb; next_payload jsonb;
  current_evidence jsonb; incoming_evidence jsonb; field_key text; evidence_key text;
  changed boolean := false; protected boolean; improved boolean; current_serial text[]; incoming_serial text[];
  group_value jsonb; next_identity text := p_identity;
BEGIN
  IF p_owner IS NULL OR p_owner = '' THEN RAISE EXCEPTION 'A browser owner is required'; END IF;
  -- Serialize ingestion for one browser, including simultaneous tabs and offline replay.
  -- The persistent frame PK and identity PK remain the final concurrency guards.
  PERFORM pg_advisory_xact_lock(hashtextextended('detector-group:' || p_owner, 0));
  SELECT observation_id, owner_key INTO target, existing_owner FROM detector_observation_frames WHERE id = p_id;
  IF FOUND THEN
    IF existing_owner <> p_owner THEN RAISE EXCEPTION 'Observation unavailable'; END IF;
    RETURN target;
  END IF;
  IF p_identity IS NOT NULL THEN
    SELECT observation_id INTO target FROM detector_group_identities WHERE owner_key = p_owner AND identity_key = p_identity;
    IF target IS NULL THEN
      -- Reuse a known legacy card without deleting or silently rewriting its history.
      SELECT o.id INTO target FROM detector_observations o
        CROSS JOIN LATERAL regexp_match(coalesce(o.payload->'suggestion'->>'limitation', ''), '^(\d{1,5})\s*[/|\\]\s*(\d{1,5})$') serial
        WHERE o.payload->>'ownerKey' = p_owner AND o.payload->>'mergedIntoId' IS NULL AND jsonb_array_length(coalesce(o.payload->'matches', '[]'::jsonb)) = 1
        AND (o.payload->'matches'->0->>'cardId') || ':' || serial[1]::integer || '/' || serial[2]::integer = p_identity
        AND NOT detector_evidence_conflicts(o.payload->'suggestion', incoming)
        ORDER BY (o.status = 'approved') DESC, o.created_at ASC LIMIT 1;
    END IF;
    IF target IS NOT NULL AND EXISTS (SELECT 1 FROM detector_observations WHERE id = target AND detector_evidence_conflicts(payload->'suggestion', incoming)) THEN
      target := NULL; next_identity := NULL;
    END IF;
  END IF;
  IF target IS NULL AND p_session IS NOT NULL AND p_track IS NOT NULL THEN
    SELECT array_agg(DISTINCT o.id) INTO candidates
      FROM detector_observation_frames f JOIN detector_observations o ON o.id = f.observation_id
      WHERE f.owner_key = p_owner AND f.session_id = p_session AND f.track_id = p_track
      AND NOT detector_evidence_conflicts(o.payload->'suggestion', incoming);
    -- An unreadable frame cannot decide between two conflicting cards in one track.
    IF cardinality(candidates) = 1 THEN target := candidates[1]; END IF;
  END IF;
  IF target IS NULL THEN
    SELECT array_agg(DISTINCT o.id) INTO candidates
      FROM detector_observation_frames f JOIN detector_observations o ON o.id = f.observation_id
      WHERE f.owner_key = p_owner AND f.image_url = p_image
      AND NOT detector_evidence_conflicts(o.payload->'suggestion', incoming);
    IF cardinality(candidates) = 1 THEN target := candidates[1]; END IF;
  END IF;
  IF target IS NULL THEN
    target := p_id;
    group_value := jsonb_build_object('sessionId', p_session, 'trackId', p_track, 'seenCount', 1,
      'firstSeenAt', p_captured, 'lastSeenAt', p_captured, 'bestFrameId', p_id, 'bestQuality', p_quality);
    INSERT INTO detector_observations(id, image_url, thumbnail_url, captured_at, payload, overlay_key)
      VALUES(target, p_image, p_thumbnail, p_captured, p_payload || jsonb_build_object('group', group_value), p_overlay);
  ELSE
    SELECT * INTO observation FROM detector_observations WHERE id = target FOR UPDATE;
    protected := observation.status <> 'pending' OR observation.selected_card_id IS NOT NULL OR observation.payload->>'nameSource' = 'manual';
    protected := coalesce(protected, false);
    next_payload := observation.payload;
    merged := observation.payload->'suggestion';
    current_evidence := coalesce(observation.payload->'evidence', '{}'::jsonb);
    IF NOT protected THEN
      FOR field_key, evidence_key IN SELECT * FROM (VALUES ('playerName','name'),('limitation','serial'),('cardName','variant'),('cardNumber','cardNumber'),('isAutographed','autograph')) AS fields(field, evidence) LOOP
        IF incoming->field_key IS NULL OR incoming->field_key = 'null'::jsonb OR incoming->>field_key = '' THEN CONTINUE; END IF;
        improved := merged->field_key IS NULL OR merged->field_key = 'null'::jsonb OR merged->>field_key = '';
        IF field_key = 'limitation' THEN
          current_serial := regexp_match(coalesce(merged->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
          incoming_serial := regexp_match(coalesce(incoming->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
          improved := improved OR (incoming_serial IS NOT NULL AND incoming_serial[1] IS NOT NULL AND (current_serial IS NULL OR current_serial[1] IS NULL));
        END IF;
        incoming_evidence := p_payload->'evidence'->evidence_key;
        IF improved THEN
          merged := jsonb_set(merged, ARRAY[field_key], incoming->field_key);
          IF incoming_evidence IS NOT NULL THEN current_evidence := jsonb_set(current_evidence, ARRAY[evidence_key], incoming_evidence); END IF;
          IF field_key = 'playerName' THEN next_payload := next_payload || jsonb_build_object('nameSource', coalesce(p_payload->>'nameSource', 'read')); END IF;
        ELSIF merged->field_key = incoming->field_key AND incoming_evidence IS NOT NULL
          AND (current_evidence->evidence_key IS NULL OR coalesce((incoming_evidence->>'quality')::real, 0) > coalesce((current_evidence->evidence_key->>'quality')::real, 0)
            OR (field_key = 'playerName' AND current_evidence->evidence_key->>'source' = 'catalog' AND incoming_evidence->>'source' = 'read')) THEN
          current_evidence := jsonb_set(current_evidence, ARRAY[evidence_key], incoming_evidence);
          IF field_key = 'playerName' THEN next_payload := next_payload || jsonb_build_object('nameSource', coalesce(p_payload->>'nameSource', 'read')); END IF;
        END IF;
      END LOOP;
      next_payload := next_payload || jsonb_build_object('suggestion', merged, 'evidence', current_evidence);
      changed := merged IS DISTINCT FROM observation.payload->'suggestion' OR current_evidence IS DISTINCT FROM coalesce(observation.payload->'evidence', '{}'::jsonb);
    END IF;
    group_value := coalesce(observation.payload->'group', jsonb_build_object('sessionId', p_session, 'trackId', p_track,
      'seenCount', 1, 'firstSeenAt', observation.captured_at, 'lastSeenAt', observation.captured_at, 'bestFrameId', observation.id, 'bestQuality', 0));
    group_value := group_value || jsonb_build_object('seenCount', (group_value->>'seenCount')::integer + 1,
      'firstSeenAt', least((group_value->>'firstSeenAt')::timestamptz, p_captured),
      'lastSeenAt', greatest((group_value->>'lastSeenAt')::timestamptz, p_captured));
    improved := NOT protected AND p_quality > coalesce((group_value->>'bestQuality')::real, 0);
    IF improved THEN
      group_value := group_value || jsonb_build_object('bestFrameId', p_id, 'bestQuality', p_quality);
      -- These image-relative summaries follow the displayed proof. Field evidence retains its own source image.
      next_payload := (next_payload - 'proof' - 'proofImage' - 'color' - 'visualFingerprint') || (p_payload - 'ownerKey' - 'suggestion' - 'originalSuggestion' - 'matches' - 'originalMatches' - 'evidence' - 'nameSource');
    END IF;
    UPDATE detector_observations SET payload = next_payload || jsonb_build_object('group', group_value),
      image_url = CASE WHEN improved THEN p_image ELSE image_url END,
      thumbnail_url = CASE WHEN improved THEN p_thumbnail ELSE thumbnail_url END,
      revision = revision + CASE WHEN changed OR improved THEN 1 ELSE 0 END, updated_at = now()
      WHERE id = target;
  END IF;
  INSERT INTO detector_observation_frames(id, observation_id, owner_key, session_id, track_id, image_url, thumbnail_url, captured_at, quality, payload)
    VALUES(p_id, target, p_owner, p_session, p_track, p_image, p_thumbnail, p_captured, p_quality, p_payload);
  IF next_identity IS NOT NULL THEN
    INSERT INTO detector_group_identities(owner_key, identity_key, observation_id) VALUES(p_owner, next_identity, target)
      ON CONFLICT (owner_key, identity_key) DO NOTHING;
  END IF;
  RETURN target;
END;
$$;

-- Explicit operator merge for old/uncertain duplicate captures. Nothing is deleted.
CREATE OR REPLACE FUNCTION merge_detector_observations(p_source uuid, p_revision integer, p_target uuid, p_target_revision integer)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  source detector_observations; target detector_observations; owner_source text; owner_target text;
  protected boolean; next_payload jsonb; merged jsonb; evidence jsonb; incoming_evidence jsonb;
  field_key text; evidence_key text; improved boolean; sa text[]; sb text[]; group_a jsonb; group_b jsonb; best_source boolean;
BEGIN
  IF p_source = p_target THEN RAISE EXCEPTION 'Choose a different review card'; END IF;
  SELECT coalesce((SELECT owner_key FROM detector_observation_frames WHERE observation_id = p_source LIMIT 1), payload->>'ownerKey') INTO owner_source
    FROM detector_observations WHERE id = p_source;
  SELECT coalesce((SELECT owner_key FROM detector_observation_frames WHERE observation_id = p_target LIMIT 1), payload->>'ownerKey') INTO owner_target
    FROM detector_observations WHERE id = p_target;
  IF owner_source IS NULL OR owner_target IS NULL OR owner_source <> owner_target THEN RAISE EXCEPTION 'Cards from different browsers cannot be merged'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('detector-group:' || owner_source, 0));
  SELECT * INTO source FROM detector_observations WHERE id = p_source FOR UPDATE;
  SELECT * INTO target FROM detector_observations WHERE id = p_target FOR UPDATE;
  IF source.payload->>'mergedIntoId' = p_target::text THEN RETURN p_target; END IF;
  IF source.status <> 'pending' OR target.status NOT IN ('pending', 'approved') OR source.payload->>'mergedIntoId' IS NOT NULL OR target.payload->>'mergedIntoId' IS NOT NULL
    OR source.revision <> p_revision OR target.revision <> p_target_revision THEN RAISE EXCEPTION 'These cards changed. Refresh before merging'; END IF;
  IF detector_evidence_conflicts(source.payload->'suggestion', target.payload->'suggestion') THEN RAISE EXCEPTION 'Conflicting names, serials or variants cannot be merged'; END IF;
  protected := target.status = 'approved' OR target.selected_card_id IS NOT NULL OR coalesce(target.payload->>'nameSource' = 'manual', false);
  next_payload := target.payload;
  merged := target.payload->'suggestion';
  evidence := coalesce(target.payload->'evidence', '{}'::jsonb);
  IF NOT protected THEN
    FOR field_key, evidence_key IN SELECT * FROM (VALUES ('playerName','name'),('limitation','serial'),('cardName','variant'),('cardNumber','cardNumber'),('isAutographed','autograph')) AS fields(field, evidence) LOOP
      IF source.payload->'suggestion'->field_key IS NULL OR source.payload->'suggestion'->field_key = 'null'::jsonb OR source.payload->'suggestion'->>field_key = '' THEN CONTINUE; END IF;
      improved := merged->field_key IS NULL OR merged->field_key = 'null'::jsonb OR merged->>field_key = '';
      IF field_key = 'limitation' THEN
        sa := regexp_match(coalesce(merged->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
        sb := regexp_match(coalesce(source.payload->'suggestion'->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
        improved := improved OR (sb IS NOT NULL AND sb[1] IS NOT NULL AND (sa IS NULL OR sa[1] IS NULL));
      END IF;
      incoming_evidence := source.payload->'evidence'->evidence_key;
      IF improved THEN
        merged := jsonb_set(merged, ARRAY[field_key], source.payload->'suggestion'->field_key);
        IF incoming_evidence IS NOT NULL THEN evidence := jsonb_set(evidence, ARRAY[evidence_key], incoming_evidence); END IF;
        IF field_key = 'playerName' THEN next_payload := next_payload || jsonb_build_object('nameSource', coalesce(source.payload->>'nameSource', 'read')); END IF;
      ELSIF merged->field_key = source.payload->'suggestion'->field_key AND incoming_evidence IS NOT NULL
        AND (evidence->evidence_key IS NULL OR coalesce((incoming_evidence->>'quality')::real, 0) > coalesce((evidence->evidence_key->>'quality')::real, 0)) THEN
        evidence := jsonb_set(evidence, ARRAY[evidence_key], incoming_evidence);
      END IF;
    END LOOP;
    next_payload := next_payload || jsonb_build_object('suggestion', merged, 'evidence', evidence);
  END IF;
  group_a := coalesce(source.payload->'group', jsonb_build_object('seenCount', 1, 'firstSeenAt', source.captured_at, 'lastSeenAt', source.captured_at, 'bestFrameId', source.id, 'bestQuality', 0));
  group_b := coalesce(target.payload->'group', jsonb_build_object('sessionId', null, 'trackId', null, 'seenCount', 1, 'firstSeenAt', target.captured_at, 'lastSeenAt', target.captured_at, 'bestFrameId', target.id, 'bestQuality', 0));
  best_source := NOT protected AND coalesce((group_a->>'bestQuality')::real, 0) > coalesce((group_b->>'bestQuality')::real, 0);
  IF best_source THEN
    group_b := group_b || jsonb_build_object('bestFrameId', group_a->'bestFrameId', 'bestQuality', group_a->'bestQuality');
    next_payload := (next_payload - 'proof' - 'proofImage' - 'color' - 'visualFingerprint') || (source.payload - 'ownerKey' - 'suggestion' - 'originalSuggestion' - 'matches' - 'originalMatches' - 'evidence' - 'nameSource' - 'group' - 'mergedIntoId');
  END IF;
  group_b := group_b || jsonb_build_object('seenCount', (group_a->>'seenCount')::integer + (group_b->>'seenCount')::integer,
    'firstSeenAt', least((group_a->>'firstSeenAt')::timestamptz, (group_b->>'firstSeenAt')::timestamptz),
    'lastSeenAt', greatest((group_a->>'lastSeenAt')::timestamptz, (group_b->>'lastSeenAt')::timestamptz));
  UPDATE detector_observations SET payload = next_payload || jsonb_build_object('group', group_b),
    image_url = CASE WHEN best_source THEN source.image_url ELSE image_url END,
    thumbnail_url = CASE WHEN best_source THEN source.thumbnail_url ELSE thumbnail_url END,
    revision = revision + 1, updated_at = now() WHERE id = p_target;
  -- Removing the obsolete selection also blocks an approval that raced the merge
  -- after its application-layer check but before the existing SQL approval lock.
  UPDATE detector_observations SET payload = payload || jsonb_build_object('mergedIntoId', p_target, 'mergedOriginalSelection', selected_card_id),
    selected_card_id = NULL, revision = revision + 1, updated_at = now() WHERE id = p_source;
  UPDATE detector_observations SET payload = payload || jsonb_build_object('mergedIntoId', p_target) WHERE payload->>'mergedIntoId' = p_source::text;
  UPDATE detector_observation_frames SET observation_id = p_target WHERE observation_id = p_source;
  UPDATE detector_group_identities SET observation_id = p_target WHERE observation_id = p_source;
  RETURN p_target;
END;
$$;
