const L = require("./_lib");
const Wallet = require("./_wallet");
const Member = require("./member");
const COOKIE = "tlc_admin";
const SURVEY_COOKIE = "tlc_survey_admin";
const PASTORAL_COOKIE = "tlc_pastoral_staff";
const password = () => String(process.env.ADMIN_PASSWORD || "");
const pastoralPin = () => String(process.env.PASTORAL_CARE_PIN || process.env.SURVEY_ADMIN_PIN || "");
const CHECKIN_LOCATIONS = [
  "Liberty Point Woodford",
  "North London",
  "Canary Wharf",
  "Croydon",
  "Birmingham",
  "Lagos",
  "Houston",
  "e-TLC",
];
const cleanCheckinText = (value, max = 80) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9 &'().-]/g, "")
    .slice(0, max);
function completedSundayDates() {
  const today = new Date(
      `${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" })}T00:00:00Z`,
    ),
    daysSinceSunday = today.getUTCDay() === 0 ? 7 : today.getUTCDay(),
    latest = new Date(today),
    previous = new Date(today);
  latest.setUTCDate(today.getUTCDate() - daysSinceSunday);
  previous.setUTCDate(latest.getUTCDate() - 7);
  return [previous.toISOString().slice(0, 10), latest.toISOString().slice(0, 10)];
}
async function refreshPastoralCases(db) {
  const [olderSunday, latestSunday] = completedSundayDates(),
    candidates = await db.query(
      `SELECT i.id,i.public_id,r.submitted_payload,last_seen.service_date AS last_attended,
              last_seen.location AS last_location
       FROM tlc_identities i
       JOIN LATERAL (
         SELECT submitted_payload FROM review_records
         WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
       ) r ON true
       JOIN LATERAL (
         SELECT service_date,location FROM checkin_events
         WHERE identity_id=i.id AND EXTRACT(DOW FROM service_date)=0
         ORDER BY service_date DESC,checked_in_at DESC LIMIT 1
       ) last_seen ON true
       WHERE last_seen.service_date < $1::date
         AND NOT EXISTS (
           SELECT 1 FROM checkin_events c
           WHERE c.identity_id=i.id AND c.service_date=ANY($2::date[])
         )
         AND NOT EXISTS (
           SELECT 1 FROM pastoral_cases pc
           WHERE pc.identity_id=i.id AND pc.status IN ('open','contacted')
         )`,
      [olderSunday, [olderSunday, latestSunday]],
    );
  const identityIds = candidates
    .filter((candidate) => {
      let changes = {};
      try { changes = L.decrypt(candidate.submitted_payload)?.changes || {}; } catch {}
      return ["member", "attendee"].includes(String(changes.membershipStatus || ""));
    })
    .map((candidate) => candidate.id);
  const inserted = identityIds.length
    ? await db.query(
        `INSERT INTO pastoral_cases(identity_id,trigger_key,missed_from,missed_to)
         SELECT id,$2,$3::date,$4::date FROM unnest($1::bigint[]) AS id
         ON CONFLICT(identity_id,trigger_key) DO NOTHING RETURNING id`,
        [identityIds, `${olderSunday}:${latestSunday}`, olderSunday, latestSunday],
      )
    : [];
  return { created: inserted.length, olderSunday, latestSunday };
}
async function pastoralCaseList(db, status = "active") {
  const rows = await db.query(
    `SELECT pc.*,i.public_id,r.id AS record_id,r.submitted_payload,
            last_seen.service_date AS last_attended,last_seen.location AS last_location,
            COALESCE(notes.notes,'[]'::json) AS notes
     FROM pastoral_cases pc
     JOIN tlc_identities i ON i.id=pc.identity_id
     LEFT JOIN LATERAL (
       SELECT id,submitted_payload FROM review_records
       WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
     ) r ON true
     LEFT JOIN LATERAL (
       SELECT service_date,location FROM checkin_events
       WHERE identity_id=i.id ORDER BY service_date DESC,checked_in_at DESC LIMIT 1
     ) last_seen ON true
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object('id',n.id,'payload',n.note_payload,'createdAt',n.created_at)
                       ORDER BY n.created_at DESC) AS notes
       FROM pastoral_case_notes n WHERE n.case_id=pc.id
     ) notes ON true
     WHERE ($1='all' OR ($1='active' AND pc.status IN ('open','contacted')) OR pc.status=$1)
     ORDER BY CASE pc.status WHEN 'open' THEN 0 WHEN 'contacted' THEN 1 ELSE 2 END,
              pc.updated_at DESC LIMIT 500`,
    [status],
  );
  return rows.map((row) => {
    let changes = {};
    try { changes = L.decrypt(row.submitted_payload)?.changes || {}; } catch {}
    return {
      id: row.id,
      publicId: row.public_id,
      name: `${changes.firstName || ""} ${changes.lastName || ""}`.trim() || "TLC attendee",
      firstName: changes.firstName || "",
      email: changes.email || "",
      phone: changes.phone || "",
      photoRecordId: row.record_id || null,
      status: row.status,
      assignedTo: row.assigned_to || "",
      resolution: row.resolution || "",
      missedFrom: row.missed_from,
      missedTo: row.missed_to,
      missedCount: Number(row.missed_count || 2),
      lastAttended: row.last_attended,
      lastLocation: row.last_location || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      notes: (row.notes || []).map((note) => {
        let value = "";
        try { value = L.decrypt(note.payload)?.note || ""; } catch {}
        return { id: note.id, note: value, createdAt: note.createdAt };
      }),
    };
  });
}
async function sendCheckinEmail(email, firstName, publicId, location, service) {
  const apiKey = String(process.env.SENDGRID_API_KEY || ""),
    from = String(process.env.IDENTITY_FROM_EMAIL || "hello@penielsense.co.uk"),
    fromName = String(process.env.IDENTITY_FROM_NAME || "The Liberty Church");
  if (!apiKey || !from || !email) return "not_configured";
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: from, name: fromName },
      subject: "You are checked in — The Liberty Church",
      content: [{
        type: "text/html",
        value: `<div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:18px;padding:32px;border-top:6px solid #ec168c"><div style="font-size:12px;font-weight:800;color:#ec168c;letter-spacing:.14em">YOU COUNT</div><h1 style="color:#1b3a6b">Welcome${firstName ? `, ${String(firstName).replace(/[<>&\"']/g, "")}` : ""}.</h1><p style="color:#52647a;line-height:1.6">You have been checked in for ${service} at ${location}.</p><p style="color:#52647a">YouCount Number: <strong>${publicId}</strong></p><p style="color:#52647a;line-height:1.6">We are glad you are here.</p></div></div>`,
      }],
    }),
  });
  return response.ok ? "sent" : `failed_${response.status}`;
}
function parseCookie(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim().split("="))
      .filter((x) => x.length === 2),
  );
}
function makeSession() {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  return `${exp}.${L.hash(`admin:${exp}`)}`;
}
function authorised(req) {
  const value = parseCookie(req)[COOKIE];
  if (!value) return false;
  const [exp, sig] = value.split(".");
  return (
    Number(exp) > Date.now() && L.safeEqual(sig || "", L.hash(`admin:${exp}`))
  );
}
function surveyAuthorised(req) {
  const value = parseCookie(req)[SURVEY_COOKIE];
  if (!value) return false;
  const [exp, sig] = value.split(".");
  return (
    Number(exp) > Date.now() &&
    L.safeEqual(sig || "", L.hash(`survey-admin:${exp}`))
  );
}
function pastoralSessionValue() {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  return `${exp}.${L.hash(`pastoral-staff:${exp}`)}`;
}
function pastoralAuthorised(req) {
  const value = parseCookie(req)[PASTORAL_COOKIE];
  if (!value) return false;
  const [exp, sig] = value.split(".");
  return Number(exp) > Date.now() && L.safeEqual(sig || "", L.hash(`pastoral-staff:${exp}`));
}
module.exports = async function handler(req, res) {
  if (String(req.query?.portal || "") === "checkin")
    return require("../checkin-handler")(req, res);
  if (["servespaceLaunch", "servespaceSummary"].includes(String(req.query?.portal || "")))
    return require("../servespace-handler")(req, res);
  if (req.method !== "POST") return L.json(res, 405, { ok: false });
  try {
    const action = String(req.body?.action || "");
    if (action === "pastoralLogin") {
      const db = await L.ensureDb(), ipHash = L.hash(L.clientIp(req)), submitted = String(req.body?.pin || "");
      if (!(await L.consumeRate(db, "pastoral_staff_login", ipHash, 8, 30)))
        return L.json(res, 429, { ok: false, message: "Too many attempts. Ask the pastoral-care lead for help." });
      if (!pastoralPin() || !L.safeEqual(submitted, pastoralPin())) {
        await L.audit(db, null, ipHash, "pastoral_staff_login", null, "failed");
        return L.json(res, 401, { ok: false, message: pastoralPin() ? "That pastoral-care PIN was not recognised." : "The pastoral-care PIN has not been configured yet." });
      }
      res.setHeader("Set-Cookie", `${PASTORAL_COOKIE}=${pastoralSessionValue()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
      await L.audit(db, null, ipHash, "pastoral_staff_login", null, "approved");
      return L.json(res, 200, { ok: true });
    }
    if (action === "pastoralLogout") {
      res.setHeader("Set-Cookie", `${PASTORAL_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
      return L.json(res, 200, { ok: true });
    }
    if (action === "pastoralWorkspace" || action === "pastoralWorkspaceUpdate") {
      if (!pastoralAuthorised(req)) return L.json(res, 401, { ok: false, message: "Your pastoral-care session has expired." });
      const db = await L.ensureDb();
      if (action === "pastoralWorkspace") {
        const status = ["active", "all", "open", "contacted", "resolved", "dismissed"].includes(String(req.body?.status || "")) ? String(req.body.status) : "active",
          [olderSunday, latestSunday] = completedSundayDates(), cases = await pastoralCaseList(db, status);
        return L.json(res, 200, { ok: true, status, monitoring: { rule: "Two consecutive completed Sundays after a member's first recorded Sunday check-in", olderSunday, latestSunday }, cases });
      }
      const caseId = Number(req.body?.caseId || 0), status = String(req.body?.status || ""),
        assignedTo = cleanCheckinText(req.body?.assignedTo, 100), resolution = cleanCheckinText(req.body?.resolution, 200),
        note = String(req.body?.note || "").trim().slice(0, 2000);
      if (!caseId || !["open", "contacted", "resolved", "dismissed"].includes(status))
        return L.json(res, 400, { ok: false, message: "Choose a valid pastoral-care action." });
      const updated = await db.query(`UPDATE pastoral_cases SET status=$2,assigned_to=$3,resolution=$4,
        resolved_at=CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE NULL END,updated_at=now()
        WHERE id=$1 RETURNING id`, [caseId, status, assignedTo || null, resolution || null]);
      if (!updated.length) return L.json(res, 404, { ok: false, message: "Pastoral case not found." });
      if (note) await db.query(`INSERT INTO pastoral_case_notes(case_id,note_payload) VALUES($1,$2)`, [caseId, L.encrypt({ note })]);
      await L.audit(db, null, L.hash(L.clientIp(req)), "pastoral_case_update", { caseId, status, assigned: Boolean(assignedTo), noteAdded: Boolean(note), workspace: "pastoral" }, "approved");
      return L.json(res, 200, { ok: true, cases: await pastoralCaseList(db, "active") });
    }
    if (action === "login") {
      const db = await L.initDb(),
        ipHash = L.hash(L.clientIp(req));
      if (!(await L.consumeRate(db, "admin_login", ipHash, 10, 15)))
        return L.json(res, 429, { ok: false });
      if (
        !password() ||
        !L.safeEqual(String(req.body?.password || ""), password())
      ) {
        await L.audit(db, null, ipHash, "admin_login", null, "failed");
        return L.json(res, 401, { ok: false });
      }
      await L.audit(db, null, ipHash, "admin_login", null, "approved");
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${makeSession()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
      );
      return L.json(res, 200, {
        ok: true,
        admin: "datateam@thelibertychurchlondon.com",
      });
    }
    if (action === "logout") {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      );
      return L.json(res, 200, { ok: true });
    }
    if (!authorised(req)) return L.json(res, 401, { ok: false });
    if (action === "maintenance_setup") {
      const db = await L.migrateDb(),
        { syncCatalogues } = require("./_catalog");
      const pending = await db.query(
          "SELECT id,planning_center_ids FROM review_records WHERE status='pending' ORDER BY updated_at DESC,id DESC",
        ),
        seen = new Set();
      for (const row of pending) {
        try {
          const id = L.decrypt(row.planning_center_ids)?.[0];
          if (id && !seen.has(id)) {
            seen.add(id);
            await db.query(
              "UPDATE review_records SET active_subject_hash=$1 WHERE id=$2 AND active_subject_hash IS NULL",
              [L.hash(`member:${id}`), row.id],
            );
          }
        } catch {}
      }
      return L.json(res, 200, { ok: true, ...(await syncCatalogues(db)) });
    }
    const db = ["checkinOverview", "pastoralCases", "pastoralCaseUpdate"].includes(action)
      ? await L.ensureDb()
      : await L.initDb();
    if (action === "checkinOverview") {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || ""))
          ? String(req.body.date)
          : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
        locationFilter = cleanCheckinText(req.body?.location),
        serviceFilter = cleanCheckinText(req.body?.service),
        search = String(req.body?.search || "").trim().toLowerCase().slice(0, 80),
        rows = await db.query(
          `SELECT c.id,c.checked_in_at,c.location,c.service_label,c.source,c.device_label,
                  c.notification_status,c.planning_center_synced_at,i.public_id,
                  r.id AS record_id,r.submitted_payload,
                  array_remove(array_agg(DISTINCT p.planning_center_id),NULL) AS planning_center_ids
           FROM checkin_events c
           JOIN tlc_identities i ON i.id=c.identity_id
           LEFT JOIN LATERAL (
             SELECT id,submitted_payload FROM review_records
             WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
           ) r ON true
           LEFT JOIN tlc_identity_profiles p ON p.identity_id=i.id
           WHERE c.service_date=$1::date
             AND ($2='' OR c.location=$2)
             AND ($3='' OR c.service_label=$3)
           GROUP BY c.id,i.public_id,r.id,r.submitted_payload
           ORDER BY c.checked_in_at DESC LIMIT 500`,
          [date, locationFilter, serviceFilter],
        ),
        summaryRows = await db.query(
          `SELECT location,service_label,count(*)::int AS count
           FROM checkin_events WHERE service_date=$1::date
             AND ($2='' OR location=$2)
             AND ($3='' OR service_label=$3)
           GROUP BY location,service_label ORDER BY location,service_label`,
          [date, locationFilter, serviceFilter],
        ),
        serviceRows = await db.query(
          `SELECT DISTINCT service_label FROM checkin_events
           WHERE service_date=$1::date AND ($2='' OR location=$2)
           ORDER BY service_label`,
          [date, locationFilter],
        ),
        headcountRows = await db.query(
          `SELECT location,service_label,male_count,female_count,children_count,
                  (male_count+female_count+children_count)::int AS total,updated_at
           FROM attendance_headcounts WHERE service_date=$1::date
             AND ($2='' OR location=$2) AND ($3='' OR service_label=$3)
           ORDER BY location,service_label`,
          [date, locationFilter, serviceFilter],
        ),
        mapped = rows.map((row) => {
          let changes = {};
          try { changes = L.decrypt(row.submitted_payload)?.changes || {}; } catch {}
          return {
            id: row.id,
            publicId: row.public_id,
            name: `${changes.firstName || ""} ${changes.lastName || ""}`.trim() || "TLC attendee",
            firstName: changes.firstName || "",
            location: row.location,
            service: row.service_label,
            checkedInAt: row.checked_in_at,
            source: row.source,
            device: row.device_label,
            notificationStatus: row.notification_status,
            planningCenterSynced: Boolean(row.planning_center_synced_at),
            planningCenterIds: row.planning_center_ids || [],
            photoRecordId: row.record_id || null,
          };
        }),
        filtered = search
          ? mapped.filter((row) =>
              `${row.name} ${row.publicId}`.toLowerCase().replace(/[^a-z0-9]/g, "")
                .includes(search.replace(/[^a-z0-9]/g, "")),
            )
          : mapped;
      return L.json(res, 200, {
        ok: true,
        date,
        locations: CHECKIN_LOCATIONS,
        selectedLocation: locationFilter,
        selectedService: serviceFilter,
        services: serviceRows.map((row) => row.service_label),
        total: filtered.length,
        summary: summaryRows.map((row) => ({
          location: row.location,
          service: row.service_label,
          count: Number(row.count),
        })),
        headcounts: headcountRows.map((row) => ({
          location: row.location,
          service: row.service_label,
          male: Number(row.male_count || 0),
          female: Number(row.female_count || 0),
          children: Number(row.children_count || 0),
          total: Number(row.total || 0),
          updatedAt: row.updated_at,
        })),
        checkins: filtered,
      });
    }
    if (action === "pastoralCases") {
      const status = ["active", "all", "open", "contacted", "resolved", "dismissed"].includes(
          String(req.body?.status || ""),
        ) ? String(req.body.status) : "active",
        [olderSunday, latestSunday] = completedSundayDates(),
        cases = await pastoralCaseList(db, status);
      return L.json(res, 200, {
        ok: true,
        status,
        monitoring: {
          rule: "Two consecutive completed Sundays after a member's first recorded Sunday check-in",
          olderSunday,
          latestSunday,
        },
        cases,
        counts: cases.reduce((result, item) => {
          result[item.status] = (result[item.status] || 0) + 1;
          return result;
        }, {}),
      });
    }
    if (action === "pastoralCaseUpdate") {
      const caseId = Number(req.body?.caseId || 0),
        status = String(req.body?.status || ""),
        assignedTo = cleanCheckinText(req.body?.assignedTo, 100),
        resolution = cleanCheckinText(req.body?.resolution, 200),
        note = String(req.body?.note || "").trim().slice(0, 2000);
      if (!caseId || !["open", "contacted", "resolved", "dismissed"].includes(status))
        return L.json(res, 400, { ok: false, message: "Choose a valid pastoral-care action." });
      const updated = await db.query(
        `UPDATE pastoral_cases SET status=$2,assigned_to=$3,resolution=$4,
           resolved_at=CASE WHEN $2 IN ('resolved','dismissed') THEN now() ELSE NULL END,
           updated_at=now() WHERE id=$1 RETURNING id`,
        [caseId, status, assignedTo || null, resolution || null],
      );
      if (!updated.length) return L.json(res, 404, { ok: false, message: "Pastoral case not found." });
      if (note)
        await db.query(
          `INSERT INTO pastoral_case_notes(case_id,note_payload) VALUES($1,$2)`,
          [caseId, L.encrypt({ note })],
        );
      await L.audit(
        db,
        null,
        L.hash(L.clientIp(req)),
        "pastoral_case_update",
        { caseId, status, assigned: Boolean(assignedTo), noteAdded: Boolean(note) },
        "approved",
      );
      return L.json(res, 200, { ok: true, cases: await pastoralCaseList(db, "active") });
    }
    if (action === "checkinScan") {
      const raw = String(req.body?.code || "").trim().slice(0, 300),
        compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        identityNumber = compact.match(/^(?:OP|OM|OA|OD|OC|TL|SG|TM|CM|AT|V)?([1-9]\d{5})$/)?.[1] || null,
        legacyId = raw.toUpperCase().replace(/\s+/g, "-").match(/^TLC-(?:\d{4,}[ABP]|\d{7})$/)?.[0] || null,
        publicId = identityNumber || legacyId,
        location = cleanCheckinText(req.body?.location),
        service = cleanCheckinText(req.body?.service),
        device = cleanCheckinText(req.body?.device, 60) || "Welcome team device",
        notify = Boolean(req.body?.notify);
      if (!publicId || !location || !service)
        return L.json(res, 400, { ok: false, code: "invalid_scan", message: "Scan a valid YouCount Card and select the location and service." });
      if (!(await L.consumeRate(db, "checkin_scan", L.hash(`admin:${L.clientIp(req)}`), 5000, 60)))
        return L.json(res, 429, { ok: false, code: "scanner_paused", message: "This scanner has been paused. Please contact the data team." });
      const identities = await db.query(
        `SELECT i.id,i.public_id,i.identity_number,i.role_code,r.id AS record_id,r.submitted_payload
         FROM tlc_identities i
         LEFT JOIN LATERAL (
           SELECT id,submitted_payload FROM review_records
           WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
         ) r ON true WHERE i.identity_number=$1 OR upper(i.public_id)=upper($1)
            OR EXISTS (SELECT 1 FROM tlc_identity_aliases a WHERE a.identity_id=i.id AND upper(a.alias)=upper($1))
         LIMIT 1`,
        [publicId],
      );
      const identity = identities[0];
      if (!identity) {
        await L.audit(db, null, L.hash(L.clientIp(req)), "checkin_scan", { publicId, location, service }, "not_found");
        return L.json(res, 404, { ok: false, code: "card_not_found", message: "This card was not recognised. Please direct the person to Member Care." });
      }
      let changes = {};
      try { changes = L.decrypt(identity.submitted_payload)?.changes || {}; } catch {}
      const inserted = await db.query(
        `INSERT INTO checkin_events(identity_id,location,service_label,service_date,source,device_label,notification_status)
         VALUES($1,$2,$3,(now() AT TIME ZONE 'Europe/London')::date,'staff_scanner',$4,$5)
         ON CONFLICT(identity_id,service_date,location,service_label) DO NOTHING
         RETURNING id,checked_in_at`,
        [identity.id, location, service, device, notify ? "pending" : "not_requested"],
      );
      const duplicate = !inserted.length;
      let notificationStatus = notify ? "pending" : "not_requested";
      if (!duplicate && notify) {
        try {
          notificationStatus = await sendCheckinEmail(
            L.normalizeEmail(changes.email),
            changes.firstName,
            identity.public_id,
            location,
            service,
          );
        } catch { notificationStatus = "failed"; }
        await db.query(
          "UPDATE checkin_events SET notification_status=$1 WHERE id=$2",
          [notificationStatus, inserted[0].id],
        );
      }
      await L.audit(
        db,
        null,
        L.hash(L.clientIp(req)),
        "checkin_scan",
        { publicId, location, service, device },
        duplicate ? "already_checked_in" : "checked_in",
      );
      return L.json(res, 200, {
        ok: true,
        duplicate,
        checkin: {
          id: inserted[0]?.id || null,
          publicId: identity.public_id,
          name: `${changes.firstName || ""} ${changes.lastName || ""}`.trim() || "TLC attendee",
          firstName: changes.firstName || "",
          location,
          service,
          checkedInAt: inserted[0]?.checked_in_at || null,
          photoRecordId: identity.record_id || null,
          notificationStatus,
        },
      });
    }
    if (action === "connectFields") {
      const fields = await db.query(
        `SELECT id,tab_name AS "tabName",name,slug,data_type AS "dataType"
         FROM pc_custom_fields
         WHERE lower(name||' '||tab_name) ~ '(connect|membership course|membership class)'
         ORDER BY sequence NULLS LAST,name`,
      );
      return L.json(res, 200, { ok: true, fields });
    }
    if (action === "surveyUnlock") {
      const ipHash = L.hash(L.clientIp(req));
      const configured = String(process.env.SURVEY_ADMIN_PIN || ""),
        submitted = String(req.body?.pin || "");
      if (
        !configured ||
        !L.safeEqual(submitted, configured)
      ) {
        const allowed = await L.consumeRate(
          db,
          "survey_admin_pin",
          ipHash,
          5,
          30,
        );
        await L.audit(db, null, ipHash, "survey_admin_unlock", null, "failed");
        return L.json(res, allowed ? 401 : 429, {
          ok: false,
          code: allowed ? "invalid_pin" : "pin_locked",
        });
      }
      await db.query(
        "DELETE FROM rate_limits WHERE bucket='survey_admin_pin' AND subject_hash=$1",
        [ipHash],
      );
      const exp = Date.now() + 2 * 60 * 60 * 1000;
      res.setHeader(
        "Set-Cookie",
        `${SURVEY_COOKIE}=${exp}.${L.hash(`survey-admin:${exp}`)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=7200`,
      );
      await L.audit(db, null, ipHash, "survey_admin_unlock", null, "approved");
      return L.json(res, 200, { ok: true });
    }
    if (action === "surveyList") {
      if (!surveyAuthorised(req)) return L.json(res, 403, { ok: false });
      const rows = await db.query(
        "SELECT id,survey_version,response_payload,created_at FROM survey_responses WHERE created_at >= now()-interval '90 days' ORDER BY created_at DESC LIMIT 500",
      );
      return L.json(res, 200, {
        ok: true,
        responses: rows.map((row) => ({
          id: row.id,
          version: row.survey_version,
          answers: L.decrypt(row.response_payload)?.answers || {},
          createdAt: row.created_at,
        })),
      });
    }
    if (action === "operationsTarget") {
      const attendance = Math.max(
        0,
        Math.min(50000, Math.round(Number(req.body?.attendance) || 0)),
      );
      await db.query(
        `INSERT INTO operations_settings(setting_date,service_attendance,updated_at)
         VALUES((now() AT TIME ZONE 'Europe/London')::date,$1,now())
         ON CONFLICT(setting_date) DO UPDATE SET service_attendance=excluded.service_attendance,updated_at=now()`,
        [attendance],
      );
      await L.audit(
        db,
        null,
        L.hash(L.clientIp(req)),
        "service_attendance_updated",
        { attendance },
        "saved",
      );
      return L.json(res, 200, { ok: true, attendance });
    }
    if (action === "operations") {
      await db.query(
        "DELETE FROM journey_presence WHERE last_seen_at < now()-interval '2 days'",
      );
      const [summary] = await db.query(
          `SELECT
            count(*) FILTER (WHERE status='active' AND last_seen_at>now()-interval '5 minutes')::int AS active,
            count(*) FILTER (WHERE status='active' AND last_seen_at>now()-interval '5 minutes' AND stage_entered_at<now()-interval '5 minutes')::int AS stalled,
            count(*) FILTER (WHERE completed_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')::int AS completed_today,
            count(*) FILTER (WHERE started_at >= date_trunc('day',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')::int AS started_today
           FROM journey_presence`,
        ),
        stages = await db.query(
          `SELECT stage,stage_label,count(*)::int AS count
           FROM journey_presence WHERE status='active' AND last_seen_at>now()-interval '5 minutes'
           GROUP BY stage,stage_label ORDER BY min(stage_entered_at)`,
        ),
        rows = await db.query(
          `SELECT j.journey_hash,j.journey_type,j.stage,j.stage_label,j.form_page,j.status,j.blocker,
                  j.started_at,j.stage_entered_at,j.last_seen_at,s.payload,s.verified_at
           FROM journey_presence j LEFT JOIN verification_sessions s ON s.id=j.session_id
           WHERE j.status='active' AND j.last_seen_at>now()-interval '5 minutes'
           ORDER BY j.stage_entered_at ASC LIMIT 150`,
        ),
        targetRows = await db.query(
          `SELECT service_attendance FROM operations_settings
           WHERE setting_date=(now() AT TIME ZONE 'Europe/London')::date`,
        ),
        failureRows = await db.query(
          `SELECT count(*)::int AS count FROM audit_events
           WHERE created_at>now()-interval '60 minutes'
             AND outcome IN ('failed','no_match','no_contact_match','locked')`,
        );
      const journeys = rows.map((row) => {
        let displayName = "Anonymous journey";
        if (row.verified_at && row.payload) {
          const payload = L.decrypt(row.payload) || {};
          displayName = String(payload.name || "Verified member").slice(0, 80);
        } else if (row.journey_type === "visitor") displayName = "New visitor";
        else if (row.journey_type === "member")
          displayName = "Member verifying";
        else if (row.journey_type === "attendee")
          displayName = "Attendee verifying";
        return {
          id: row.journey_hash.slice(0, 12),
          displayName,
          journeyType: row.journey_type,
          stage: row.stage,
          stageLabel: row.stage_label,
          formPage: row.form_page,
          blocker: row.blocker,
          verified: Boolean(row.verified_at),
          startedAt: row.started_at,
          stageEnteredAt: row.stage_entered_at,
          lastSeenAt: row.last_seen_at,
        };
      });
      return L.json(res, 200, {
        ok: true,
        summary: {
          active: Number(summary?.active || 0),
          stalled: Number(summary?.stalled || 0),
          completedToday: Number(summary?.completed_today || 0),
          startedToday: Number(summary?.started_today || 0),
          failedLastHour: Number(failureRows[0]?.count || 0),
          serviceAttendance: Number(targetRows[0]?.service_attendance || 0),
        },
        stages: stages.map((row) => ({
          stage: row.stage,
          label: row.stage_label,
          count: Number(row.count),
        })),
        journeys,
        refreshedAt: new Date().toISOString(),
      });
    }
    if (action === "overview") {
      const records = await db.query(
          `SELECT r.id,r.kind,r.planning_center_ids,r.submitted_payload,r.status,r.created_at,r.updated_at,r.identity_id,
                  i.public_id,i.role_code,i.status AS identity_status,i.connect_completed,i.connect_source,i.connect_exception
           FROM review_records r LEFT JOIN tlc_identities i ON i.id=r.identity_id
           ORDER BY r.updated_at DESC,r.created_at DESC,r.id DESC LIMIT 150`,
        ),
        countRows = await db.query(
          "SELECT kind,count(*)::int AS count FROM review_records GROUP BY kind",
        );
      return L.json(res, 200, {
        ok: true,
        counts: Object.fromEntries(
          countRows.map((row) => [row.kind, Number(row.count)]),
        ),
        records: records.map((r) => ({
          id: r.id,
          kind: r.kind,
          planningCenterIds: L.decrypt(r.planning_center_ids),
          submission: L.decrypt(r.submitted_payload),
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          identity: r.identity_id
            ? {
                id: r.identity_id,
                publicId: r.public_id,
                roleCode: r.role_code,
                status: r.identity_status,
                connectCompleted: r.connect_completed,
                source: r.connect_source,
                connectException: r.connect_exception,
              }
            : null,
        })),
      });
    }
    if (action === "list") {
      const allowedKinds = new Set([
          "profile_update",
          "possible_duplicate",
          "manual_review",
          "visitor",
        ]),
        kind = allowedKinds.has(String(req.body?.kind))
          ? String(req.body.kind)
          : "profile_update",
        page = Math.max(1, Math.min(10000, Number(req.body?.page) || 1)),
        pageSize = 50,
        offset = (page - 1) * pageSize;
      const records = await db.query(
        `SELECT r.id,r.kind,r.planning_center_ids,r.submitted_payload,r.status,r.created_at,r.updated_at,r.identity_id,
          i.public_id,i.role_code,i.status AS identity_status,i.connect_completed,i.connect_source,i.connect_exception
         FROM review_records r LEFT JOIN tlc_identities i ON i.id=r.identity_id
         WHERE r.kind=$1
         ORDER BY r.updated_at DESC,r.created_at DESC,r.id DESC LIMIT $2 OFFSET $3`,
        [kind, pageSize, offset],
      );
      const countRows = await db.query(
          "SELECT kind,count(*)::int AS count FROM review_records GROUP BY kind",
        ),
        counts = Object.fromEntries(
          countRows.map((row) => [row.kind, Number(row.count)]),
        ),
        total = counts[kind] || 0,
        auditCount = await db.query(
          "SELECT count(*)::int AS count FROM audit_events",
        ),
        audits = req.body?.includeAudits
          ? await db.query(
              "SELECT id,event,entered_payload,outcome,created_at FROM audit_events ORDER BY created_at DESC LIMIT $1 OFFSET $2",
              [pageSize, offset],
            )
          : [];
      return L.json(res, 200, {
        ok: true,
        counts: { ...counts, audit: Number(auditCount[0]?.count || 0) },
        pagination: {
          page,
          pageSize,
          total: req.body?.includeAudits
            ? Number(auditCount[0]?.count || 0)
            : total,
        },
        records: records.map((r) => ({
          id: r.id,
          kind: r.kind,
          planningCenterIds: L.decrypt(r.planning_center_ids),
          submission: L.decrypt(r.submitted_payload),
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          identity: r.identity_id
            ? {
                id: r.identity_id,
                publicId: r.public_id,
                roleCode: r.role_code,
                status: r.identity_status,
                connectCompleted: r.connect_completed,
                source: r.connect_source,
                connectException: r.connect_exception,
              }
            : null,
        })),
        audits: audits.map((a) => ({
          id: a.id,
          event: a.event,
          entered: a.entered_payload ? L.decrypt(a.entered_payload) : null,
          outcome: a.outcome,
          createdAt: a.created_at,
        })),
      });
    }
    if (action === "status") {
      const id = Number(req.body?.id),
        allowedStatuses = new Set([
          "pending",
          "follow_up",
          "updated_pc",
          "rejected",
          "completed",
        ]),
        status = String(req.body?.status || "");
      if (!Number.isSafeInteger(id) || id < 1 || !allowedStatuses.has(status))
        return L.json(res, 400, { ok: false });
      const updated = await db.query(
        "UPDATE review_records SET status=$1,active_subject_hash=CASE WHEN $1 IN ('completed','updated_pc','rejected') THEN NULL ELSE active_subject_hash END,updated_at=now() WHERE id=$2 RETURNING planning_center_ids,active_subject_hash",
        [status, id],
      );
      // Reopening a closed record re-links it to its member, as maintenance_setup
      // does, so the member's next submission updates it instead of starting a
      // new record. Skipped when another open record already holds the member.
      if (updated[0] && !updated[0].active_subject_hash && ["pending", "follow_up"].includes(status))
        try {
          const personId = L.decrypt(updated[0].planning_center_ids)?.[0];
          if (personId)
            await db.query(
              "UPDATE review_records SET active_subject_hash=$1 WHERE id=$2 AND active_subject_hash IS NULL AND NOT EXISTS (SELECT 1 FROM review_records WHERE active_subject_hash=$1)",
              [L.hash(`member:${personId}`), id],
            );
        } catch {}
      await L.audit(
        db,
        null,
        L.hash(L.clientIp(req)),
        "submission_status_changed",
        { recordId: id },
        status,
      );
      return L.json(res, 200, { ok: true });
    }
    if (action === "identityConnect") {
      const recordId = Number(req.body?.id),
        completed = Boolean(req.body?.completed);
      if (!Number.isSafeInteger(recordId) || recordId < 1)
        return L.json(res, 400, { ok: false });
      const rows = await db.query(
        "SELECT identity_id,planning_center_ids FROM review_records WHERE id=$1",
        [recordId],
      );
      if (!rows.length) return L.json(res, 404, { ok: false });
      let identityId = rows[0].identity_id;
      const ids = L.decrypt(rows[0].planning_center_ids) || [];
      if (!identityId && ids.length) {
        const existing = await db.query(
          "SELECT identity_id FROM tlc_identity_profiles WHERE planning_center_id=ANY($1::text[]) ORDER BY identity_id LIMIT 1",
          [ids],
        );
        identityId = existing[0]?.identity_id;
        if (!identityId) {
          const made = await db.query(
            "INSERT INTO tlc_identities(status,connect_completed,connect_source) VALUES('provisional',false,'staff_review') RETURNING id",
          );
          identityId = made[0].id;
          await L.setIdentityPublicId(db, identityId, { eligible: false });
        }
        for (const pcId of ids)
          await db.query(
            "INSERT INTO tlc_identity_profiles(identity_id,planning_center_id) VALUES($1,$2) ON CONFLICT(planning_center_id) DO UPDATE SET identity_id=excluded.identity_id",
            [identityId, String(pcId)],
          );
        await db.query("UPDATE review_records SET identity_id=$1 WHERE id=$2", [
          identityId,
          recordId,
        ]);
      }
      if (!identityId) return L.json(res, 400, { ok: false });
      const beforeIdentity = await db.query(
        "SELECT connect_eligible FROM tlc_identities WHERE id=$1",
        [identityId],
      );
      await db.query(
        "UPDATE tlc_identities SET connect_completed=$1,connect_eligible=$1,status=$2,connect_source='staff_override',connect_exception=NULL,updated_at=now() WHERE id=$3",
        [completed, completed ? "full" : "provisional", identityId],
      );
      await L.setIdentityPublicId(db, identityId, {
        ...(completed ? { eligible: true } : { roleCode: null }),
        source: "staff_override",
        actor: "data_team",
      });
      const walletUpdate = await Wallet.notifyWalletUpdate(db, identityId);
      let passEmail = "not_needed";
      if (completed && !beforeIdentity[0]?.connect_eligible) {
        try {
          const receiptRows = await db.query(
            `SELECT i.id,i.public_id,i.identity_number,i.role_code,i.status,i.created_at,
                    i.connect_eligible,r.submitted_payload
             FROM tlc_identities i
             JOIN LATERAL (
               SELECT submitted_payload FROM review_records WHERE identity_id=i.id
               ORDER BY updated_at DESC,id DESC LIMIT 1
             ) r ON true WHERE i.id=$1`,
            [identityId],
          );
          const receipt = receiptRows[0],
            changes = receipt ? L.decrypt(receipt.submitted_payload)?.changes || {} : {},
            email = L.normalizeEmail(changes.email);
          if (receipt && email) {
            passEmail = await Member._sendIdentityReceipt(
              db,
              email,
              changes.firstName,
              receipt,
              changes,
              true,
            );
            if (passEmail === "sent")
              await db.query(
                "UPDATE tlc_identities SET identity_email_sent_at=now() WHERE id=$1",
                [identityId],
              );
          } else passEmail = "no_email";
        } catch (error) {
          console.error("Connect completion pass email failed", error.message);
          passEmail = "failed";
        }
      }
      await L.audit(
        db,
        null,
        L.hash(L.clientIp(req)),
        "identity_connect_override",
        { recordId },
        completed ? "full" : "provisional",
      );
      return L.json(res, 200, { ok: true, walletUpdate, passEmail });
    }
    if (action === "identityRole") {
      const identityId = Number(req.body?.identityId),
        roleCode = req.body?.roleCode === "" ? null : L.normalizeRoleCode(req.body?.roleCode);
      if (!Number.isSafeInteger(identityId) || identityId < 1 || (req.body?.roleCode && !roleCode))
        return L.json(res, 400, { ok: false });
      const identities = await db.query(
        "SELECT id,connect_eligible FROM tlc_identities WHERE id=$1",
        [identityId],
      );
      if (!identities.length) return L.json(res, 404, { ok: false });
      if (roleCode && !["AT", "V"].includes(roleCode) && !identities[0].connect_eligible)
        return L.json(res, 409, {
          ok: false,
          message: "Confirm Connect eligibility before assigning a member or leadership code.",
        });
      const publicId = await L.setIdentityPublicId(db, identityId, {
        roleCode,
        source: "staff_role_change",
        actor: "data_team",
      });
      const walletUpdate = await Wallet.notifyWalletUpdate(db, identityId);
      await L.audit(
        db,
        null,
        L.hash(L.clientIp(req)),
        "identity_role_changed",
        { identityId, roleCode },
        publicId,
      );
      return L.json(res, 200, { ok: true, publicId, walletUpdate });
    }
    return L.json(res, 400, { ok: false });
  } catch {
    return L.json(res, 503, { ok: false });
  }
};
module.exports.refreshPastoralCases = refreshPastoralCases;
