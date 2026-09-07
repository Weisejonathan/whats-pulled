-- Additive migration: existing cards, images and pull reports remain untouched.
CREATE TABLE IF NOT EXISTS detector_observations (
  id uuid PRIMARY KEY,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  selected_card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
  image_url text NOT NULL,
  thumbnail_url text NOT NULL,
  captured_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  pull_report_id uuid REFERENCES pull_reports(id),
  overlay_event_id uuid REFERENCES recognition_events(id),
  overlay_key text,
  overlay_error text,
  pulled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detector_observations_recent ON detector_observations(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS detector_observations_active_copy
  ON pull_reports(card_id, copy_number)
  WHERE external_ref LIKE 'detector:%' AND verification_status IN ('pending', 'verified');

CREATE TABLE IF NOT EXISTS detector_request_budget (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL DEFAULT 0
);

-- Row locks serialize edits, retries and approvals; no check-then-insert race.
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

CREATE OR REPLACE FUNCTION retract_detector_observation(observation_id uuid, expected_revision integer)
RETURNS detector_observations LANGUAGE plpgsql AS $$
DECLARE observation detector_observations;
BEGIN
  SELECT * INTO observation FROM detector_observations WHERE id = observation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Observation not found'; END IF;
  IF observation.status = 'rejected' THEN RETURN observation; END IF;
  IF observation.revision <> expected_revision THEN RAISE EXCEPTION 'This observation changed. Reload it first'; END IF;
  PERFORM id FROM cards WHERE id = observation.selected_card_id FOR UPDATE;
  UPDATE pull_reports SET verification_status = 'rejected', updated_at = now()
    WHERE id = observation.pull_report_id AND external_ref = 'detector:' || observation.id;
  UPDATE recognition_events SET status = 'rejected', updated_at = now() WHERE id = observation.overlay_event_id;
  UPDATE cards SET status = 'open', updated_at = now()
    WHERE id = observation.selected_card_id AND status = 'pulled'
    AND NOT EXISTS (SELECT 1 FROM pull_reports WHERE card_id = observation.selected_card_id AND verification_status IN ('pending', 'verified'))
    AND NOT EXISTS (SELECT 1 FROM claims WHERE card_id = observation.selected_card_id AND verification_status IN ('pending', 'verified'));
  UPDATE detector_observations SET status = 'rejected', revision = revision + 1, updated_at = now()
    WHERE id = observation.id RETURNING * INTO observation;
  RETURN observation;
END;
$$;
