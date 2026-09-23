-- Exact uploaded pixels identify one review decision, even if OCR disagrees.
ALTER TABLE detector_observation_frames ADD COLUMN IF NOT EXISTS image_hash text;
CREATE INDEX IF NOT EXISTS detector_frames_exact_image ON detector_observation_frames(owner_key, image_hash);

CREATE OR REPLACE FUNCTION detector_url_image_hash(image_url text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (regexp_match(image_url, '/detector/([a-f0-9]{64})\.webp(?:\?.*)?$'))[1]
$$;
UPDATE detector_observation_frames SET image_hash = detector_url_image_hash(image_url)
  WHERE image_hash IS NULL AND detector_url_image_hash(image_url) IS NOT NULL;

CREATE OR REPLACE FUNCTION detector_conflicting_fields(a jsonb, b jsonb) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; result text[] := ARRAY[]::text[]; x text; y text; sa text[]; sb text[];
BEGIN
  FOREACH k IN ARRAY ARRAY['setId', 'playerName', 'cardName', 'cardNumber'] LOOP
    x := regexp_replace(lower(coalesce(a->>k, '')), '[^a-z0-9]+', '', 'g');
    y := regexp_replace(lower(coalesce(b->>k, '')), '[^a-z0-9]+', '', 'g');
    IF x <> '' AND y <> '' AND x <> y THEN result := array_append(result, CASE k WHEN 'playerName' THEN 'name' WHEN 'cardName' THEN 'variant' ELSE k END); END IF;
  END LOOP;
  IF jsonb_typeof(a->'isAutographed') = 'boolean' AND jsonb_typeof(b->'isAutographed') = 'boolean' AND a->'isAutographed' <> b->'isAutographed' THEN result := array_append(result, 'autograph'); END IF;
  sa := regexp_match(coalesce(a->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
  sb := regexp_match(coalesce(b->>'limitation', ''), '^(\d{1,5})?\s*[/|\\]\s*(\d{1,5})$');
  IF sa IS NOT NULL AND sb IS NOT NULL AND (sa[2]::integer <> sb[2]::integer OR (sa[1] IS NOT NULL AND sb[1] IS NOT NULL AND sa[1]::integer <> sb[1]::integer)) THEN result := array_append(result, 'serial'); END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION flag_detector_image_conflict(p_target uuid, incoming jsonb, p_frame uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE target detector_observations; fields text[]; flag jsonb; needs_review boolean;
BEGIN
  SELECT * INTO target FROM detector_observations WHERE id = p_target FOR UPDATE;
  fields := detector_conflicting_fields(target.payload->'suggestion', incoming);
  IF cardinality(fields) = 0 THEN RETURN; END IF;
  needs_review := target.status = 'pending' AND coalesce(target.payload->>'nameSource', '') <> 'manual';
  flag := jsonb_build_object('needsReview', needs_review,
    'fields', (SELECT jsonb_agg(DISTINCT v) FROM (SELECT unnest(fields) v UNION ALL SELECT jsonb_array_elements_text(coalesce(target.payload->'duplicateConflict'->'fields','[]'::jsonb))) values_seen),
    'frameIds', (SELECT jsonb_agg(v) FROM (SELECT DISTINCT v FROM (SELECT p_frame::text v UNION ALL SELECT jsonb_array_elements_text(coalesce(target.payload->'duplicateConflict'->'frameIds','[]'::jsonb))) ids LIMIT 64) bounded));
  UPDATE detector_observations SET payload = payload || jsonb_build_object('duplicateConflict', flag),
    revision = revision + CASE WHEN needs_review AND (flag - 'frameIds') IS DISTINCT FROM ((payload->'duplicateConflict') - 'frameIds') THEN 1 ELSE 0 END,
    updated_at = now() WHERE id = p_target;
END;
$$;

CREATE OR REPLACE FUNCTION merge_detector_exact_image(p_source uuid, p_target uuid, p_owner text, p_hash text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE source detector_observations; target detector_observations; group_a jsonb; group_b jsonb;
BEGIN
  IF p_source = p_target THEN RETURN; END IF;
  SELECT * INTO source FROM detector_observations WHERE id = p_source FOR UPDATE;
  SELECT * INTO target FROM detector_observations WHERE id = p_target FOR UPDATE;
  IF source.status <> 'pending' OR source.payload->>'mergedIntoId' IS NOT NULL THEN RETURN; END IF;
  IF NOT coalesce((source.payload->>'ownerKey' = p_owner OR EXISTS(SELECT 1 FROM detector_observation_frames WHERE observation_id = p_source AND owner_key = p_owner)), false)
    OR NOT coalesce((target.payload->>'ownerKey' = p_owner OR EXISTS(SELECT 1 FROM detector_observation_frames WHERE observation_id = p_target AND owner_key = p_owner)), false) THEN RAISE EXCEPTION 'Observation unavailable'; END IF;
  IF NOT coalesce((detector_url_image_hash(source.image_url) = p_hash OR source.payload->>'serverImageHash' = p_hash OR EXISTS(SELECT 1 FROM detector_observation_frames WHERE observation_id = p_source AND owner_key = p_owner AND image_hash = p_hash)), false)
    OR NOT coalesce((detector_url_image_hash(target.image_url) = p_hash OR target.payload->>'serverImageHash' = p_hash OR EXISTS(SELECT 1 FROM detector_observation_frames WHERE observation_id = p_target AND owner_key = p_owner AND image_hash = p_hash)), false) THEN RAISE EXCEPTION 'Only identical image evidence can be combined automatically'; END IF;
  IF NOT detector_evidence_conflicts(source.payload->'suggestion', target.payload->'suggestion') AND target.status IN ('pending','approved') THEN
    PERFORM merge_detector_observations(p_source, source.revision, p_target, target.revision);
    RETURN;
  END IF;
  -- Contradictory OCR from identical pixels is retained as a conflict, never a new pull.
  PERFORM flag_detector_image_conflict(p_target, source.payload->'suggestion', p_source);
  SELECT * INTO target FROM detector_observations WHERE id = p_target;
  group_a := coalesce(source.payload->'group', jsonb_build_object('seenCount',1,'firstSeenAt',source.captured_at,'lastSeenAt',source.captured_at));
  group_b := coalesce(target.payload->'group', jsonb_build_object('sessionId',null,'trackId',null,'seenCount',1,'firstSeenAt',target.captured_at,'lastSeenAt',target.captured_at,'bestFrameId',target.id,'bestQuality',0));
  group_b := group_b || jsonb_build_object('seenCount',(group_a->>'seenCount')::integer+(group_b->>'seenCount')::integer,
    'firstSeenAt',least((group_a->>'firstSeenAt')::timestamptz,(group_b->>'firstSeenAt')::timestamptz),
    'lastSeenAt',greatest((group_a->>'lastSeenAt')::timestamptz,(group_b->>'lastSeenAt')::timestamptz));
  UPDATE detector_observations SET payload = payload || jsonb_build_object('group',group_b),
    revision = revision + CASE WHEN status = 'pending' THEN 1 ELSE 0 END, updated_at = now() WHERE id = p_target;
  UPDATE detector_observations SET payload = payload || jsonb_build_object('mergedIntoId',p_target,'mergedOriginalSelection',selected_card_id),
    selected_card_id = NULL, revision = revision + 1, updated_at = now() WHERE id = p_source;
  UPDATE detector_observations SET payload = payload || jsonb_build_object('mergedIntoId',p_target) WHERE payload->>'mergedIntoId' = p_source::text;
  UPDATE detector_observation_frames SET observation_id = p_target WHERE observation_id = p_source;
  DELETE FROM detector_group_identities WHERE observation_id = p_source;
END;
$$;

CREATE OR REPLACE FUNCTION ingest_detector_frame_exact(
  p_id uuid, p_owner text, p_session uuid, p_track uuid, p_image text, p_thumbnail text,
  p_captured timestamptz, p_payload jsonb, p_overlay text, p_quality real, p_identity text, p_hash text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE target uuid; existing_owner text; duplicate record; selected detector_observations; conflict boolean;
  working_payload jsonb; working_quality real; result uuid;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_owner IS NULL OR p_owner = '' THEN RAISE EXCEPTION 'Verified image identity is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('detector-group:' || p_owner, 0));
  SELECT observation_id, owner_key INTO target, existing_owner FROM detector_observation_frames WHERE id = p_id;
  IF FOUND THEN
    IF existing_owner <> p_owner THEN RAISE EXCEPTION 'Observation unavailable'; END IF;
    RETURN target;
  END IF;
  SELECT o.id INTO target FROM detector_observations o
    WHERE o.payload->>'mergedIntoId' IS NULL
      AND (o.payload->>'ownerKey' = p_owner OR EXISTS(SELECT 1 FROM detector_observation_frames f WHERE f.observation_id=o.id AND f.owner_key=p_owner))
      AND (o.payload->>'serverImageHash'=p_hash OR detector_url_image_hash(o.image_url)=p_hash
        OR EXISTS(SELECT 1 FROM detector_observation_frames f WHERE f.observation_id=o.id AND f.owner_key=p_owner AND f.image_hash=p_hash))
    ORDER BY (o.status='approved') DESC, (o.payload->>'nameSource'='manual') DESC NULLS LAST,
      (o.selected_card_id IS NOT NULL) DESC, o.created_at, o.id LIMIT 1;
  IF target IS NOT NULL THEN
    -- Repair only other pending rows carrying this exact same owner's image.
    FOR duplicate IN SELECT o.id FROM detector_observations o WHERE o.id<>target AND o.status='pending' AND o.payload->>'mergedIntoId' IS NULL
      AND (o.payload->>'ownerKey'=p_owner OR EXISTS(SELECT 1 FROM detector_observation_frames f WHERE f.observation_id=o.id AND f.owner_key=p_owner))
      AND (o.payload->>'serverImageHash'=p_hash OR detector_url_image_hash(o.image_url)=p_hash
        OR EXISTS(SELECT 1 FROM detector_observation_frames f WHERE f.observation_id=o.id AND f.owner_key=p_owner AND f.image_hash=p_hash))
      ORDER BY o.created_at LIMIT 100 LOOP
      PERFORM merge_detector_exact_image(duplicate.id,target,p_owner,p_hash);
    END LOOP;
    SELECT * INTO selected FROM detector_observations WHERE id=target FOR UPDATE;
    conflict := detector_evidence_conflicts(selected.payload->'suggestion',p_payload->'suggestion');
    working_payload := p_payload; working_quality := p_quality;
    IF conflict THEN
      -- Reuse existing trusted fields for aggregation; restore the incoming raw reading below.
      working_payload := p_payload || jsonb_build_object('suggestion',selected.payload->'suggestion','evidence',coalesce(selected.payload->'evidence','{}'::jsonb),'nameSource',selected.payload->'nameSource');
      working_quality := 0;
    END IF;
    INSERT INTO detector_group_identities(owner_key,identity_key,observation_id) VALUES(p_owner,'image:'||p_hash,target)
      ON CONFLICT(owner_key,identity_key) DO UPDATE SET observation_id=excluded.observation_id;
    result := ingest_detector_frame(p_id,p_owner,p_session,p_track,p_image,p_thumbnail,p_captured,working_payload,p_overlay,working_quality,'image:'||p_hash);
    IF conflict THEN PERFORM flag_detector_image_conflict(result,p_payload->'suggestion',p_id); END IF;
  ELSE
    result := ingest_detector_frame(p_id,p_owner,p_session,p_track,p_image,p_thumbnail,p_captured,p_payload,p_overlay,p_quality,p_identity);
  END IF;
  UPDATE detector_observation_frames SET image_hash=p_hash,payload=p_payload WHERE id=p_id;
  UPDATE detector_observations SET payload=payload||jsonb_build_object('serverImageHash',p_hash) WHERE id=result AND image_url=p_image;
  RETURN result;
END;
$$;

-- The final SQL approval gate also rejects unresolved exact-image OCR conflicts.
CREATE OR REPLACE FUNCTION approve_detector_observation(observation_id uuid, expected_revision integer, reported_by text)
RETURNS detector_observations LANGUAGE plpgsql AS $$
DECLARE
  observation detector_observations;
  selected cards;
  numbering text[];
  copy integer;
  total integer;
  new_pull_id uuid;
BEGIN
  SELECT * INTO observation FROM detector_observations WHERE id = observation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Observation not found'; END IF;
  IF observation.status = 'approved' THEN RETURN observation; END IF;
  IF observation.payload->>'mergedIntoId' IS NOT NULL OR coalesce((observation.payload->'duplicateConflict'->>'needsReview')::boolean, false) THEN
    RAISE EXCEPTION 'Conflicting or merged image evidence requires manual review';
  END IF;
  IF observation.revision <> expected_revision OR observation.status <> 'pending' THEN
    RAISE EXCEPTION 'This observation changed. Reload it before approving';
  END IF;
  IF length(trim(coalesce(reported_by, ''))) = 0 THEN RAISE EXCEPTION 'Pulled by is required'; END IF;
  SELECT * INTO selected FROM cards WHERE id = observation.selected_card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select a catalog card first'; END IF;
  total := coalesce(selected.print_run, (regexp_match(selected.serial_number, '/\s*(\d+)\s*$'))[1]::integer);
  numbering := regexp_match(trim(observation.payload->'suggestion'->>'limitation'), '^(\d{1,5})?\s*/\s*(\d{1,5})$');
  IF numbering IS NULL OR total IS NULL OR numbering[2]::integer <> total THEN
    RAISE EXCEPTION 'Serial print run does not match selected card';
  END IF;
  copy := coalesce(numbering[1]::integer, CASE WHEN total = 1 THEN 1 ELSE NULL END);
  IF copy IS NULL OR copy < 1 OR copy > total THEN RAISE EXCEPTION 'Individual copy number is required and must be within the print run'; END IF;
  IF EXISTS (SELECT 1 FROM pull_reports WHERE card_id = selected.id AND copy_number = copy AND verification_status IN ('pending', 'verified'))
     OR EXISTS (SELECT 1 FROM claims WHERE card_id = selected.id AND copy_number = copy AND verification_status IN ('pending', 'verified')) THEN
    RAISE EXCEPTION 'This copy is already pulled, claimed or reserved';
  END IF;
  INSERT INTO pull_reports(card_id, copy_number, external_ref, pulled_at, proof_url, reported_by_name, verification_status)
    VALUES(selected.id, copy, 'detector:' || observation.id, observation.captured_at, observation.image_url, trim(reported_by), 'verified')
    RETURNING id INTO new_pull_id;
  -- Do not overwrite the catalog image with a particular owner's proof image.
  UPDATE cards SET status = CASE WHEN status = 'open' THEN 'pulled'::card_status ELSE status END, updated_at = now() WHERE id = selected.id;
  UPDATE detector_observations SET status = 'approved', pull_report_id = new_pull_id, pulled_by = trim(reported_by), revision = revision + 1, updated_at = now()
    WHERE id = observation.id RETURNING * INTO observation;
  RETURN observation;
END;
$$;

-- Refresh aggregation helpers for databases that already applied migration0010.
CREATE OR REPLACE FUNCTION detector_merge_color(current_payload jsonb, incoming_payload jsonb, p_frame uuid, p_image text, p_thumbnail text, p_captured timestamptz)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE evidence jsonb;
BEGIN
  IF coalesce(incoming_payload->'color'->>'label','unknown') = 'unknown' THEN RETURN current_payload; END IF;
  IF coalesce(current_payload->'color'->>'label','unknown') <> 'unknown' AND
    (current_payload->'color'->>'label' <> incoming_payload->'color'->>'label' OR coalesce((incoming_payload->'color'->>'support')::real,0) <= coalesce((current_payload->'color'->>'support')::real,0)) THEN RETURN current_payload; END IF;
  evidence := coalesce(current_payload->'evidence','{}'::jsonb) || jsonb_build_object('color',
    coalesce(incoming_payload->'evidence'->'color',jsonb_build_object('frameId',p_frame,'imageUrl',p_image,'thumbnailUrl',p_thumbnail,
      'capturedAt',p_captured,'value',incoming_payload->'color'->>'label','source','visual','quality',coalesce((incoming_payload->'color'->>'support')::real,0)*100,'proofImage',incoming_payload->'proofImage')));
  RETURN current_payload || jsonb_build_object('color',incoming_payload->'color','evidence',evidence);
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
  group_value jsonb; color_payload jsonb; next_identity text := p_identity;
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
      next_payload := (next_payload - 'proof' - 'proofImage' - 'visualFingerprint') || (p_payload - 'ownerKey' - 'suggestion' - 'originalSuggestion' - 'matches' - 'originalMatches' - 'evidence' - 'nameSource' - 'color');
    END IF;
    IF NOT protected THEN
      color_payload := detector_merge_color(next_payload,p_payload,p_id,p_image,p_thumbnail,p_captured);
      changed := changed OR color_payload IS DISTINCT FROM next_payload;
      next_payload := color_payload;
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

CREATE OR REPLACE FUNCTION merge_detector_observations(p_source uuid, p_revision integer, p_target uuid, p_target_revision integer)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  source detector_observations; target detector_observations; owner_source text; owner_target text;
  protected boolean; next_payload jsonb; merged jsonb; evidence jsonb; incoming_evidence jsonb;
  field_key text; evidence_key text; improved boolean; sa text[]; sb text[]; group_a jsonb; group_b jsonb; best_source boolean; conflict_flag jsonb;
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
    next_payload := (next_payload - 'proof' - 'proofImage' - 'visualFingerprint') || (source.payload - 'ownerKey' - 'suggestion' - 'originalSuggestion' - 'matches' - 'originalMatches' - 'evidence' - 'nameSource' - 'group' - 'mergedIntoId' - 'color' - 'duplicateConflict');
  END IF;
  IF NOT protected THEN next_payload := detector_merge_color(next_payload,source.payload,source.id,source.image_url,source.thumbnail_url,source.captured_at); END IF;
  -- Review requirements belong to the complete evidence group, not its cover photo.
  IF source.payload->'duplicateConflict' IS NOT NULL OR target.payload->'duplicateConflict' IS NOT NULL THEN
    conflict_flag := jsonb_build_object('needsReview',
      coalesce((target.payload->'duplicateConflict'->>'needsReview')::boolean,false) OR
      (target.status='pending' AND coalesce(target.payload->>'nameSource','')<>'manual' AND coalesce((source.payload->'duplicateConflict'->>'needsReview')::boolean,false)),
      'fields',(SELECT coalesce(jsonb_agg(DISTINCT v),'[]'::jsonb) FROM (SELECT jsonb_array_elements_text(coalesce(source.payload->'duplicateConflict'->'fields','[]'::jsonb)) v UNION ALL SELECT jsonb_array_elements_text(coalesce(target.payload->'duplicateConflict'->'fields','[]'::jsonb))) fields_seen),
      'frameIds',(SELECT coalesce(jsonb_agg(v),'[]'::jsonb) FROM (SELECT DISTINCT v FROM (SELECT jsonb_array_elements_text(coalesce(source.payload->'duplicateConflict'->'frameIds','[]'::jsonb)) v UNION ALL SELECT jsonb_array_elements_text(coalesce(target.payload->'duplicateConflict'->'frameIds','[]'::jsonb))) all_ids LIMIT 64) bounded_ids));
    next_payload := next_payload || jsonb_build_object('duplicateConflict',conflict_flag);
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

