const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const DB_URL = () => process.env.DATABASE_URL || process.env.tlc_DATABASE_URL;
const secret = () => process.env.SESSION_SECRET;
const sql = () => neon(DB_URL());
const now = () => new Date();
const hash = (value) =>
  crypto.createHmac("sha256", secret()).update(String(value)).digest("hex");
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
function encrypt(value) {
  const key = crypto.createHash("sha256").update(secret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
function decrypt(value) {
  const raw = Buffer.from(value, "base64url");
  const key = crypto.createHash("sha256").update(secret()).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  );
}
function token() {
  return crypto.randomBytes(32).toString("base64url");
}
function clientIp(req) {
  return String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();
}
function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}
async function initDb() {
  if (!DB_URL() || !secret()) throw new Error("server_not_configured");
  return sql();
}
async function migrateDb() {
  const db = await initDb();
  await db.query(`CREATE TABLE IF NOT EXISTS verification_sessions (
    id bigserial PRIMARY KEY, token_hash text UNIQUE NOT NULL, ip_hash text NOT NULL,
    payload text NOT NULL, matched_payload text, delivery text, otp_hash text,
    attempts integer NOT NULL DEFAULT 0, sends integer NOT NULL DEFAULT 0,
    verified_at timestamptz, locked_until timestamptz, expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS audit_events (
    id bigserial PRIMARY KEY, session_id bigint, ip_hash text NOT NULL, event text NOT NULL,
    entered_payload text, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS review_records (
    id bigserial PRIMARY KEY, session_id bigint, kind text NOT NULL, planning_center_ids text,
    submitted_payload text NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `ALTER TABLE review_records ADD COLUMN IF NOT EXISTS active_subject_hash text`,
  );
  await db.query(
    `ALTER TABLE review_records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
  );
  await db.query(
    `ALTER TABLE review_records ADD COLUMN IF NOT EXISTS identity_id bigint`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS tlc_identities (
    id bigserial PRIMARY KEY, public_id text UNIQUE, status text NOT NULL DEFAULT 'provisional',
    connect_completed boolean NOT NULL DEFAULT false, connect_source text NOT NULL DEFAULT 'unconfirmed',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  // This sequence is an internal database key only. Public YouCount numbers are
  // random six-digit values allocated independently below, with no reserved blocks.
  await db.query(`SELECT setval(
    pg_get_serial_sequence('tlc_identities', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 0) FROM tlc_identities), 30),
    true
  )`);
  await db.query(
    `ALTER TABLE tlc_identities ADD COLUMN IF NOT EXISTS identity_email_sent_at timestamptz`,
  );
  await db.query(
    `ALTER TABLE tlc_identities ADD COLUMN IF NOT EXISTS connect_eligible boolean NOT NULL DEFAULT false`,
  );
  await db.query(
    `ALTER TABLE tlc_identities ADD COLUMN IF NOT EXISTS connect_exception text`,
  );
  await db.query(
    `ALTER TABLE tlc_identities ADD COLUMN IF NOT EXISTS identity_number text`,
  );
  await db.query(
    `ALTER TABLE tlc_identities ADD COLUMN IF NOT EXISTS role_code text`,
  );
  await db.query(
    `ALTER TABLE tlc_identities ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`,
  );
  await db.query(
    `ALTER TABLE tlc_identities ADD COLUMN IF NOT EXISTS retired_at timestamptz`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS youcount_number_registry (
    identity_number text PRIMARY KEY CHECK (identity_number ~ '^[1-9][0-9]{5}$'),
    identity_id bigint UNIQUE REFERENCES tlc_identities(id) ON DELETE SET NULL,
    issued_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS identity_role_history (
    id bigserial PRIMARY KEY, identity_id bigint NOT NULL REFERENCES tlc_identities(id) ON DELETE CASCADE,
    previous_code text, new_code text, source text NOT NULL,
    actor text, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS youcount_role_registry (
    planning_center_id text PRIMARY KEY,
    role_code text NOT NULL CHECK (role_code IN ('OP','OM','OA','OD','OC','TL','SG','TM')),
    category text,
    all_roles text,
    source text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    imported_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wallet_pass_state (
    identity_id bigint PRIMARY KEY REFERENCES tlc_identities(id) ON DELETE CASCADE,
    authentication_token text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wallet_devices (
    device_library_id text PRIMARY KEY, push_token text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wallet_registrations (
    device_library_id text NOT NULL REFERENCES wallet_devices(device_library_id) ON DELETE CASCADE,
    identity_id bigint NOT NULL REFERENCES tlc_identities(id) ON DELETE CASCADE,
    pass_type_id text NOT NULL, registered_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(device_library_id,identity_id,pass_type_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS tlc_identity_aliases (
    alias text PRIMARY KEY,
    identity_id bigint NOT NULL REFERENCES tlc_identities(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS tlc_identity_aliases_identity_idx ON tlc_identity_aliases(identity_id)`,
  );
  await db.query(
    `UPDATE tlc_identities SET connect_eligible=true WHERE connect_completed=true AND connect_eligible=false`,
  );
  await db.query(
    `INSERT INTO tlc_identity_aliases(alias,identity_id)
     SELECT public_id,id FROM tlc_identities WHERE public_id IS NOT NULL
     ON CONFLICT(alias) DO NOTHING`,
  );
  await db.query(`DO $$
  DECLARE rec record; candidate text;
  BEGIN
    FOR rec IN SELECT id FROM tlc_identities WHERE identity_number IS NULL LOOP
      LOOP
        candidate := (100000 + floor(random() * 900000))::int::text;
        BEGIN
          INSERT INTO youcount_number_registry(identity_number,identity_id)
          VALUES(candidate,rec.id);
          UPDATE tlc_identities SET identity_number=candidate WHERE id=rec.id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
      END LOOP;
    END LOOP;
  END $$`);
  await db.query(
    `UPDATE tlc_identities SET role_code='CM'
     WHERE connect_eligible=true AND role_code IS NULL`,
  );
  const unclassified = await db.query(
    `SELECT i.id,r.submitted_payload FROM tlc_identities i
     JOIN LATERAL (
       SELECT submitted_payload FROM review_records WHERE identity_id=i.id
       ORDER BY updated_at DESC,id DESC LIMIT 1
     ) r ON true
     WHERE i.connect_eligible=false AND i.role_code IS NULL`,
  );
  for (const row of unclassified) {
    let membershipStatus = "";
    try { membershipStatus = String(decrypt(row.submitted_payload)?.changes?.membershipStatus || ""); } catch {}
    const roleCode = membershipStatus === "visitor" ? "V" : membershipStatus === "attendee" ? "AT" : null;
    if (roleCode) {
      await db.query("UPDATE tlc_identities SET role_code=$1 WHERE id=$2", [roleCode, row.id]);
      await db.query(
        `INSERT INTO identity_role_history(identity_id,previous_code,new_code,source)
         VALUES($1,NULL,$2,'route_migration')`,
        [row.id, roleCode],
      );
    }
  }
  await db.query(
    `UPDATE tlc_identities
     SET public_id=CASE WHEN role_code IS NULL THEN identity_number ELSE role_code||' '||identity_number END
     WHERE identity_number IS NOT NULL AND public_id IS DISTINCT FROM
       CASE WHEN role_code IS NULL THEN identity_number ELSE role_code||' '||identity_number END`,
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS tlc_identities_identity_number_idx ON tlc_identities(identity_number)`,
  );
  await db.query(
    `UPDATE tlc_identities SET is_test=true
     WHERE (created_at AT TIME ZONE 'Europe/London')::date=DATE '2026-11-09'`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS connect_eligibility_registry (
    identifier_type text NOT NULL,
    identifier_hash text NOT NULL,
    eligibility text NOT NULL CHECK (eligibility IN ('completed','ordained_exception')),
    source text NOT NULL,
    connect_date text,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(identifier_type,identifier_hash)
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS connect_eligibility_registry_lookup_idx ON connect_eligibility_registry(identifier_hash,eligibility)`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS tlc_identity_profiles (
    identity_id bigint NOT NULL REFERENCES tlc_identities(id) ON DELETE CASCADE,
    planning_center_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(identity_id,planning_center_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS survey_responses (
    id bigserial PRIMARY KEY, survey_version text NOT NULL, response_payload text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS review_records_active_subject_idx ON review_records(active_subject_hash) WHERE active_subject_hash IS NOT NULL`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS rate_limits (
    bucket text NOT NULL, subject_hash text NOT NULL, window_started_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 1, PRIMARY KEY(bucket,subject_hash)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS journey_presence (
    journey_hash text PRIMARY KEY,
    session_id bigint,
    journey_type text NOT NULL DEFAULT 'unknown',
    stage text NOT NULL,
    stage_label text NOT NULL,
    form_page integer,
    status text NOT NULL DEFAULT 'active',
    blocker text,
    started_at timestamptz NOT NULL DEFAULT now(),
    stage_entered_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS journey_presence_live_idx ON journey_presence(status,last_seen_at)`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS operations_settings (
    setting_date date PRIMARY KEY,
    service_attendance integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pc_group_types (
    id text PRIMARY KEY, name text NOT NULL, position integer, church_center_visible boolean NOT NULL DEFAULT false,
    synced_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pc_groups (
    id text PRIMARY KEY, name text NOT NULL, group_type_id text, group_type_name text NOT NULL,
    location_label text NOT NULL, schedule text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
    search_text text NOT NULL, synced_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS pc_groups_type_active_idx ON pc_groups(group_type_id,active)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS pc_groups_search_idx ON pc_groups USING gin(to_tsvector('simple',search_text))`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS pc_custom_fields (
    id text PRIMARY KEY, tab_id text NOT NULL, tab_name text NOT NULL, name text NOT NULL, slug text,
    data_type text NOT NULL, options jsonb NOT NULL DEFAULT '[]'::jsonb, approved boolean NOT NULL DEFAULT false,
    sequence integer, synced_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pc_people_cache (
    planning_center_id text PRIMARY KEY,
    name_hashes text[] NOT NULL DEFAULT '{}',
    profile_payload text NOT NULL,
    source_updated_at timestamptz,
    sync_run_id text NOT NULL,
    key_fingerprint text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    synced_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `ALTER TABLE pc_people_cache ADD COLUMN IF NOT EXISTS key_fingerprint text`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS pc_people_cache_name_hashes_idx ON pc_people_cache USING gin(name_hashes)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS pc_people_cache_active_synced_idx ON pc_people_cache(active,synced_at)`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS pc_person_group_cache (
    person_hash text NOT NULL,
    group_id text NOT NULL REFERENCES pc_groups(id) ON DELETE CASCADE,
    sync_run_id text NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(person_hash,group_id)
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS pc_person_group_cache_person_idx ON pc_person_group_cache(person_hash)`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS pc_sync_state (
    name text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS checkin_events (
    id bigserial PRIMARY KEY,
    identity_id bigint NOT NULL REFERENCES tlc_identities(id) ON DELETE RESTRICT,
    location text NOT NULL,
    service_label text NOT NULL,
    service_date date NOT NULL,
    checked_in_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'staff_scanner',
    device_label text,
    planning_center_synced_at timestamptz,
    planning_center_checkin_id text,
    notification_status text NOT NULL DEFAULT 'not_requested',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS checkin_events_identity_service_idx
     ON checkin_events(identity_id,service_date,location,service_label)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS checkin_events_live_idx
     ON checkin_events(service_date,location,service_label,checked_in_at DESC)`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_headcounts (
    id bigserial PRIMARY KEY,
    service_date date NOT NULL,
    location text NOT NULL,
    service_label text NOT NULL,
    male_count integer NOT NULL DEFAULT 0,
    female_count integer NOT NULL DEFAULT 0,
    children_count integer NOT NULL DEFAULT 0,
    notes text,
    device_label text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(service_date,location,service_label)
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS attendance_headcounts_service_idx
     ON attendance_headcounts(service_date,location,service_label)`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS pastoral_cases (
    id bigserial PRIMARY KEY,
    identity_id bigint NOT NULL REFERENCES tlc_identities(id) ON DELETE RESTRICT,
    trigger_type text NOT NULL DEFAULT 'missed_two_sundays',
    trigger_key text NOT NULL,
    missed_from date NOT NULL,
    missed_to date NOT NULL,
    missed_count integer NOT NULL DEFAULT 2,
    status text NOT NULL DEFAULT 'open',
    assigned_to text,
    resolution text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    UNIQUE(identity_id,trigger_key)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pastoral_case_notes (
    id bigserial PRIMARY KEY,
    case_id bigint NOT NULL REFERENCES pastoral_cases(id) ON DELETE CASCADE,
    note_payload text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS pastoral_cases_status_updated_idx
     ON pastoral_cases(status,updated_at DESC)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS pastoral_cases_identity_idx
     ON pastoral_cases(identity_id,created_at DESC)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS audit_ip_created_idx ON audit_events(ip_hash,created_at)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS audit_event_created_idx ON audit_events(event,created_at)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at)`,
  );
  // Check-in scans and staff lists look up a person's latest submission and
  // match QR codes case-insensitively; without these they read whole tables.
  await db.query(
    `CREATE INDEX IF NOT EXISTS review_records_identity_latest_idx ON review_records(identity_id,updated_at DESC,id DESC)`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS tlc_identities_public_id_upper_idx ON tlc_identities(upper(public_id))`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS tlc_identity_aliases_upper_idx ON tlc_identity_aliases(upper(alias))`,
  );
  // Follow-up work for a saved profile (Wallet update, receipt email), done
  // after the member gets their reply and retried if it fails.
  await db.query(`CREATE TABLE IF NOT EXISTS outbox_jobs (
    id bigserial PRIMARY KEY,
    kind text NOT NULL,
    identity_id bigint REFERENCES tlc_identities(id) ON DELETE CASCADE,
    payload text,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    last_outcome text,
    created_at timestamptz NOT NULL DEFAULT now(),
    done_at timestamptz
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS outbox_jobs_due_idx ON outbox_jobs(status,next_attempt_at)`,
  );
  // The whole profile save in one statement, so it is one round trip from
  // Vercel and one transaction: save the review record, find or create the
  // identity (merging duplicates), apply Connect status, allocate the YouCount
  // number, set the role and public ID, and queue the follow-up jobs.
  await db.query(`CREATE OR REPLACE FUNCTION youcount_save_submission(
    p_session_id bigint, p_ip_hash text, p_kind text, p_pc_ids_enc text, p_payload_enc text,
    p_subject_hash text, p_pc_ids text[], p_manual boolean, p_connect jsonb,
    p_membership text, p_receipt text
  ) RETURNS jsonb LANGUAGE plpgsql AS $fn$
  DECLARE
    rec record; cur record; v_identity bigint; v_found bigint[]; v_dup bigint;
    v_approved text; v_eligible boolean; v_source text; v_exception text;
    v_number text; v_role text; v_next text; v_jobs bigint[] := '{}'; v_job bigint;
    v_leaders text[] := ARRAY['OP','OM','OA','OD','OC','TL','SG','TM'];
  BEGIN
    INSERT INTO review_records(session_id,kind,planning_center_ids,submitted_payload,active_subject_hash,updated_at)
    VALUES(p_session_id,p_kind,p_pc_ids_enc,p_payload_enc,p_subject_hash,now())
    ON CONFLICT(active_subject_hash) WHERE active_subject_hash IS NOT NULL DO UPDATE SET
      session_id=excluded.session_id,kind=excluded.kind,planning_center_ids=excluded.planning_center_ids,
      submitted_payload=excluded.submitted_payload,updated_at=now()
    RETURNING id,identity_id,(xmax<>0) AS updated INTO rec;
    INSERT INTO audit_events(session_id,ip_hash,event,entered_payload,outcome)
    VALUES(p_session_id,p_ip_hash,CASE WHEN rec.updated THEN 'submission_updated' ELSE 'submission_created' END,NULL,p_kind);

    IF NOT p_manual AND cardinality(p_pc_ids) > 0 THEN
      -- Two submissions for the same person at once wait here instead of
      -- both creating an identity.
      PERFORM pg_advisory_xact_lock(hashtext('youcount-identity:' || p_pc_ids[1]));
      SELECT array_agg(DISTINCT identity_id ORDER BY identity_id) INTO v_found
      FROM tlc_identity_profiles WHERE planning_center_id=ANY(p_pc_ids);
      v_identity := v_found[1];
      IF v_identity IS NULL THEN
        INSERT INTO tlc_identities(status,connect_completed,connect_eligible,connect_source,connect_exception)
        VALUES(CASE WHEN (p_connect->>'eligible')::boolean THEN 'full' ELSE 'provisional' END,
               (p_connect->>'completed')::boolean,(p_connect->>'eligible')::boolean,
               p_connect->>'source',p_connect->>'exception')
        RETURNING id INTO v_identity;
      END IF;
      FOREACH v_dup IN ARRAY coalesce(v_found[2:], '{}') LOOP
        UPDATE tlc_identity_profiles SET identity_id=v_identity WHERE identity_id=v_dup;
        -- A duplicate with check-ins or care cases cannot be deleted; it keeps
        -- no profiles, and the save goes ahead instead of failing.
        BEGIN
          DELETE FROM tlc_identities WHERE id=v_dup;
        EXCEPTION WHEN foreign_key_violation THEN NULL;
        END;
      END LOOP;
      INSERT INTO tlc_identity_profiles(identity_id,planning_center_id)
      SELECT v_identity,unnest(p_pc_ids)
      ON CONFLICT(planning_center_id) DO UPDATE SET identity_id=excluded.identity_id;
      SELECT role_code INTO v_approved FROM youcount_role_registry
      WHERE active AND planning_center_id=ANY(p_pc_ids)
      ORDER BY array_position(v_leaders, role_code) LIMIT 1;
      v_eligible := (p_connect->>'eligible')::boolean;
      v_source := p_connect->>'source';
      v_exception := p_connect->>'exception';
      IF v_approved IN ('OP','OM','OA') THEN
        v_eligible := true; v_source := 'approved_role_lookup'; v_exception := 'ordained_role';
      END IF;
      IF v_eligible THEN
        UPDATE tlc_identities SET connect_completed=(p_connect->>'completed')::boolean,
          connect_eligible=true,status='full',connect_source=coalesce(v_source,'planning_center'),
          connect_exception=v_exception,updated_at=now()
        WHERE id=v_identity;
      END IF;
    ELSIF p_manual THEN
      SELECT id INTO v_identity FROM tlc_identities WHERE id=rec.identity_id;
      IF v_identity IS NULL THEN
        INSERT INTO tlc_identities(status,connect_completed,connect_eligible,connect_source)
        VALUES('provisional',false,false,'manual_review') RETURNING id INTO v_identity;
      END IF;
    END IF;

    IF v_identity IS NULL THEN
      RETURN jsonb_build_object('recordId',rec.id,'updated',rec.updated,'identity',NULL,'jobs','[]'::jsonb);
    END IF;
    UPDATE review_records SET identity_id=v_identity WHERE id=rec.id AND identity_id IS DISTINCT FROM v_identity;

    SELECT * INTO cur FROM tlc_identities WHERE id=v_identity FOR UPDATE;
    v_number := cur.identity_number;
    IF v_number IS NULL THEN
      -- Reuse a number already claimed for this identity by an earlier,
      -- interrupted allocation; otherwise claim a new random one.
      SELECT identity_number INTO v_number FROM youcount_number_registry WHERE identity_id=v_identity;
      FOR attempt IN 1..30 LOOP
        EXIT WHEN v_number IS NOT NULL;
        INSERT INTO youcount_number_registry(identity_number,identity_id)
        VALUES((100000 + floor(random() * 900000))::int::text, v_identity)
        ON CONFLICT DO NOTHING RETURNING identity_number INTO v_number;
      END LOOP;
      IF v_number IS NULL THEN RAISE EXCEPTION 'identity_number_allocation_failed'; END IF;
      UPDATE tlc_identities SET identity_number=v_number,
        is_test=is_test OR (now() AT TIME ZONE 'Europe/London')::date=DATE '2026-11-09'
      WHERE id=v_identity;
    END IF;

    v_role := CASE
      WHEN v_approved IS NOT NULL THEN v_approved
      WHEN cur.role_code = ANY(v_leaders) THEN cur.role_code
      WHEN cur.connect_eligible THEN 'CM'
      WHEN p_membership='visitor' THEN 'V'
      WHEN p_membership='attendee' THEN 'AT'
      ELSE NULL END;
    v_next := CASE WHEN v_role IS NULL THEN v_number ELSE v_role || ' ' || v_number END;
    IF cur.public_id IS NOT NULL AND cur.public_id <> v_next THEN
      INSERT INTO tlc_identity_aliases(alias,identity_id) VALUES(cur.public_id,v_identity)
      ON CONFLICT(alias) DO NOTHING;
    END IF;
    IF cur.role_code IS DISTINCT FROM v_role THEN
      INSERT INTO identity_role_history(identity_id,previous_code,new_code,source)
      VALUES(v_identity,cur.role_code,v_role,
             CASE WHEN v_approved IS NOT NULL THEN 'approved_role_lookup' ELSE 'youcount_submission' END);
    END IF;
    UPDATE tlc_identities SET public_id=v_next,role_code=v_role,updated_at=now() WHERE id=v_identity;

    INSERT INTO outbox_jobs(kind,identity_id) VALUES('wallet_update',v_identity) RETURNING id INTO v_job;
    v_jobs := v_jobs || v_job;
    IF p_receipt IS NOT NULL THEN
      INSERT INTO outbox_jobs(kind,identity_id,payload) VALUES('identity_receipt',v_identity,p_receipt)
      RETURNING id INTO v_job;
      v_jobs := v_jobs || v_job;
    END IF;
    RETURN jsonb_build_object('recordId',rec.id,'updated',rec.updated,'jobs',to_jsonb(v_jobs),
      'identity',(SELECT to_jsonb(i) FROM (
        SELECT id,public_id,identity_number,role_code,status,connect_completed,connect_eligible,
               connect_source,connect_exception FROM tlc_identities WHERE id=v_identity) i));
  END
  $fn$`);
  return db;
}
// Request handlers call ensureDb instead of migrateDb. The full migration takes
// about 100 statements and table locks, so it runs only when its source changes
// (once per deploy that edits it), and the nightly maintenance job still runs it.
const SCHEMA_VERSION = crypto
  .createHash("sha256")
  .update(migrateDb.toString())
  .digest("hex")
  .slice(0, 16);
let schemaReady = false;
async function ensureDb() {
  const db = await initDb();
  if (schemaReady) return db;
  let current = null;
  try {
    current = (
      await db.query(
        "SELECT value FROM pc_sync_state WHERE name='schema_version' LIMIT 1",
      )
    )[0]?.value;
  } catch {}
  if (current !== SCHEMA_VERSION) {
    await migrateDb();
    await db.query(
      `INSERT INTO pc_sync_state(name,value,updated_at) VALUES('schema_version',$1,now())
       ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=now()`,
      [SCHEMA_VERSION],
    );
  }
  schemaReady = true;
  return db;
}
async function consumeRate(db, bucket, subjectHash, limit, windowMinutes) {
  const rows = await db.query(
    `INSERT INTO rate_limits(bucket,subject_hash,window_started_at,attempts) VALUES($1,$2,now(),1)
    ON CONFLICT(bucket,subject_hash) DO UPDATE SET
      window_started_at=CASE WHEN rate_limits.window_started_at < now()-($3::text||' minutes')::interval THEN now() ELSE rate_limits.window_started_at END,
      attempts=CASE WHEN rate_limits.window_started_at < now()-($3::text||' minutes')::interval THEN 1 ELSE rate_limits.attempts+1 END
    RETURNING attempts`,
    [bucket, subjectHash, windowMinutes],
  );
  return Number(rows[0]?.attempts || 1) <= limit;
}
async function audit(db, sessionId, ipHash, event, entered, outcome) {
  await db.query(
    "INSERT INTO audit_events(session_id,ip_hash,event,entered_payload,outcome) VALUES($1,$2,$3,$4,$5)",
    [
      sessionId || null,
      ipHash,
      event,
      entered == null ? null : encrypt(entered),
      outcome,
    ],
  );
}
function pcAuth() {
  return `Basic ${Buffer.from(`${process.env.pc_clientid}:${process.env.pc_secret}`).toString("base64")}`;
}
async function pcFetch(path) {
  return pcAppFetch("people", path);
}
async function pcAppFetch(app, path) {
  const url = `https://api.planningcenteronline.com/${app}/v2${path}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: pcAuth(),
          Accept: "application/json",
          "User-Agent":
            "TLC Profile Verification Portal (datateam@thelibertychurchlondon.com)",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (attempt === 4) throw new Error("planning_center_unavailable");
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt)),
      );
      continue;
    }
    if (response.ok) return response.json();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 4)
      throw new Error("planning_center_unavailable");
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(10000, 750 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("planning_center_unavailable");
}
function contacts(doc) {
  const emails = new Map(),
    phones = new Map();
  for (const item of doc.included || []) {
    if (item.type === "Email" || item.type === "emails")
      emails.set(String(item.id), item.attributes?.address || "");
    if (item.type === "PhoneNumber" || item.type === "phone_numbers")
      phones.set(
        String(item.id),
        item.attributes?.e164 ||
          item.attributes?.international ||
          item.attributes?.number ||
          "",
      );
  }
  return (doc.data || []).map((person) => {
    const rel = person.relationships || {};
    const ids = (key) => (rel[key]?.data || []).map((x) => String(x.id));
    return {
      id: String(person.id),
      attributes: person.attributes || {},
      emails: ids("emails")
        .map((id) => emails.get(id))
        .filter(Boolean),
      phones: ids("phone_numbers")
        .map((id) => phones.get(id))
        .filter(Boolean),
    };
  });
}
function normalizeEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}
function digits(v) {
  return String(v || "").replace(/\D/g, "");
}
function normalizeRoleCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return new Set(["OP", "OM", "OA", "OD", "OC", "TL", "SG", "TM", "CM", "AT", "V"]).has(code)
    ? code
    : null;
}
function displayIdentityNumber(identityNumber, roleCode) {
  const number = String(identityNumber || "");
  return normalizeRoleCode(roleCode) ? `${normalizeRoleCode(roleCode)} ${number}` : number;
}
async function allocateIdentityNumber(db, id) {
  const existing = await db.query("SELECT identity_number FROM tlc_identities WHERE id=$1", [id]);
  if (existing[0]?.identity_number) return existing[0].identity_number;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = String(crypto.randomInt(100000, 1000000));
    const claimed = await db.query(
      `INSERT INTO youcount_number_registry(identity_number,identity_id)
       VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING identity_number`,
      [candidate, id],
    );
    if (claimed.length) {
      await db.query(
        `UPDATE tlc_identities SET identity_number=$1,
           is_test=is_test OR (now() AT TIME ZONE 'Europe/London')::date=DATE '2026-11-09'
         WHERE id=$2`,
        [candidate, id],
      );
      return candidate;
    }
  }
  throw new Error("identity_number_allocation_failed");
}
async function setIdentityPublicId(db, id, options = {}) {
  const rows = await db.query("SELECT public_id,role_code FROM tlc_identities WHERE id=$1", [id]),
    previous = rows[0]?.public_id,
    identityNumber = await allocateIdentityNumber(db, id),
    existingRole = normalizeRoleCode(rows[0]?.role_code),
    leadershipCodes = new Set(["OP", "OM", "OA", "OD", "OC", "TL", "SG", "TM"]),
    roleCode = Object.prototype.hasOwnProperty.call(options, "roleCode")
      ? normalizeRoleCode(options.roleCode)
      : options.eligible
        ? leadershipCodes.has(existingRole) ? existingRole : "CM"
        : existingRole,
    next = displayIdentityNumber(identityNumber, roleCode);
  if (previous && previous !== next)
    await db.query(
      "INSERT INTO tlc_identity_aliases(alias,identity_id) VALUES($1,$2) ON CONFLICT(alias) DO NOTHING",
      [previous, id],
    );
  if (rows[0]?.role_code !== roleCode)
    await db.query(
      `INSERT INTO identity_role_history(identity_id,previous_code,new_code,source,actor)
       VALUES($1,$2,$3,$4,$5)`,
      [id, rows[0]?.role_code || null, roleCode, options.source || "system", options.actor || null],
    );
  await db.query(
    "UPDATE tlc_identities SET public_id=$1,role_code=$2,updated_at=now() WHERE id=$3",
    [next, roleCode, id],
  );
  return next;
}
module.exports = {
  sql,
  initDb,
  migrateDb,
  ensureDb,
  consumeRate,
  hash,
  safeEqual,
  encrypt,
  decrypt,
  token,
  clientIp,
  json,
  audit,
  pcFetch,
  pcAppFetch,
  contacts,
  normalizeEmail,
  digits,
  normalizeRoleCode,
  displayIdentityNumber,
  allocateIdentityNumber,
  setIdentityPublicId,
  now,
};
