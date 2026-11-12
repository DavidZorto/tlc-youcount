const L = require("./api/_lib");

const COOKIE = "tlc_checkin_staff";
const LOCATIONS = [
  "Woodford",
  "North London",
  "Canary Wharf",
  "Croydon",
  "Birmingham",
  "Lagos",
  "Houston",
  "Other",
];
const configuredPin = () => String(process.env.CHECKIN_STAFF_PIN || "");
const cookieMap = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((part) => part.length === 2),
  );
function sessionValue() {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  return `${expires}.${L.hash(`checkin-staff:${expires}`)}`;
}
function authorised(req) {
  const value = cookieMap(req)[COOKIE];
  if (!value) return false;
  const [expires, signature] = value.split(".");
  return (
    Number(expires) > Date.now() &&
    L.safeEqual(signature || "", L.hash(`checkin-staff:${expires}`))
  );
}
const clean = (value, max = 80) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9 &'().-]/g, "")
    .slice(0, max);

async function overview(db, body = {}) {
  const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    }),
    date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ""))
      ? String(body.date)
      : today,
    location = clean(body.location),
    service = clean(body.service),
    rows = await db.query(
      `SELECT c.id,c.checked_in_at,c.location,c.service_label,i.public_id,
              r.id AS record_id,r.submitted_payload
       FROM checkin_events c
       JOIN tlc_identities i ON i.id=c.identity_id
       LEFT JOIN LATERAL (
         SELECT id,submitted_payload FROM review_records
         WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
       ) r ON true
       WHERE c.service_date=$1::date
         AND ($2='' OR c.location=$2)
         AND ($3='' OR c.service_label=$3)
       ORDER BY c.checked_in_at DESC LIMIT 100`,
      [date, location, service],
    ),
    total = await db.query(
      `SELECT count(*)::int AS count FROM checkin_events
       WHERE service_date=$1::date AND ($2='' OR location=$2) AND ($3='' OR service_label=$3)`,
      [date, location, service],
    ),
    services = await db.query(
      `SELECT DISTINCT service_label FROM checkin_events
       WHERE service_date=$1::date AND ($2='' OR location=$2) ORDER BY service_label`,
      [date, location],
    ),
    headcounts = await db.query(
      `SELECT id,service_date,location,service_label,male_count,female_count,children_count,
              (male_count+female_count+children_count)::int AS total,notes,updated_at
       FROM attendance_headcounts
       WHERE service_date=$1::date AND ($2='' OR location=$2) AND ($3='' OR service_label=$3)
       ORDER BY location,service_label`,
      [date, location, service],
    );
  return {
    date,
    today,
    total: Number(total[0]?.count || 0),
    locations: LOCATIONS,
    services: services.map((row) => row.service_label),
    headcounts: headcounts.map((row) => ({
      id: row.id,
      date: row.service_date,
      location: row.location,
      service: row.service_label,
      male: Number(row.male_count || 0),
      female: Number(row.female_count || 0),
      children: Number(row.children_count || 0),
      total: Number(row.total || 0),
      notes: row.notes || "",
      updatedAt: row.updated_at,
    })),
    recent: rows.map((row) => {
      let changes = {};
      try {
        changes = L.decrypt(row.submitted_payload)?.changes || {};
      } catch {}
      return {
        id: row.id,
        publicId: row.public_id,
        name:
          `${changes.firstName || ""} ${changes.lastName || ""}`.trim() ||
          "TLC attendee",
        photoRecordId: row.record_id || null,
        location: row.location,
        service: row.service_label,
        checkedInAt: row.checked_in_at,
      };
    }),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return L.json(res, 405, { ok: false });
  try {
    const action = String(req.body?.action || ""),
      ipHash = L.hash(L.clientIp(req));
    if (action === "login") {
      const db = await L.ensureDb(),
        pin = String(req.body?.pin || "");
      if (!(await L.consumeRate(db, "checkin_staff_login", ipHash, 8, 30)))
        return L.json(res, 429, {
          ok: false,
          message: "Too many attempts. Ask the service lead for help.",
        });
      if (!configuredPin() || !L.safeEqual(pin, configuredPin())) {
        await L.audit(db, null, ipHash, "checkin_staff_login", null, "failed");
        return L.json(res, 401, {
          ok: false,
          message: configuredPin()
            ? "That check-in PIN was not recognised."
            : "The welcoming-team PIN has not been configured yet.",
        });
      }
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=${sessionValue()}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,
      );
      await L.audit(db, null, ipHash, "checkin_staff_login", null, "approved");
      return L.json(res, 200, { ok: true });
    }
    if (action === "logout") {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      );
      return L.json(res, 200, { ok: true });
    }
    if (!authorised(req)) return L.json(res, 401, { ok: false });
    const db = ["headcount"].includes(action) ? await L.ensureDb() : await L.initDb();
    if (action === "overview")
      return L.json(res, 200, { ok: true, ...(await overview(db, req.body || {})) });
    if (action === "headcount") {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || ""))
          ? String(req.body.date)
          : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
        location = clean(req.body?.location),
        service = clean(req.body?.service),
        male = Math.max(0, Math.min(50000, Math.round(Number(req.body?.male) || 0))),
        female = Math.max(0, Math.min(50000, Math.round(Number(req.body?.female) || 0))),
        children = Math.max(0, Math.min(50000, Math.round(Number(req.body?.children) || 0))),
        notes = String(req.body?.notes || "").trim().slice(0, 300),
        device = clean(req.body?.device, 60) || "Attendance team device";
      if (!location || !service)
        return L.json(res, 400, { ok: false, message: "Choose a location and enter the service name." });
      if (male + female + children < 1)
        return L.json(res, 400, { ok: false, message: "Enter at least one attendance count." });
      await db.query(
        `INSERT INTO attendance_headcounts(service_date,location,service_label,male_count,female_count,children_count,notes,device_label)
         VALUES($1::date,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(service_date,location,service_label) DO UPDATE SET
           male_count=excluded.male_count,female_count=excluded.female_count,
           children_count=excluded.children_count,notes=excluded.notes,
           device_label=excluded.device_label,updated_at=now()`,
        [date, location, service, male, female, children, notes || null, device],
      );
      await L.audit(db, null, ipHash, "attendance_headcount_saved", { date, location, service, male, female, children }, "saved");
      return L.json(res, 200, { ok: true, ...(await overview(db, { date, location, service })) });
    }
    if (action === "scan") {
      const raw = String(req.body?.code || "").trim().slice(0, 300),
        compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, ""),
        identityNumber = compact.match(/^(?:OP|OM|OA|OD|OC|TL|SG|TM|CM|AT|V)?([1-9]\d{5})$/)?.[1] || null,
        legacyId = raw.toUpperCase().replace(/\s+/g, "-").match(/^TLC-(?:\d{4,}[ABP]|\d{7})$/)?.[0] || null,
        publicId = identityNumber || legacyId,
        location = clean(req.body?.location),
        service = clean(req.body?.service),
        device = clean(req.body?.device, 60) || "Welcome team scanner";
      if (!publicId || !location || !service)
        return L.json(res, 400, {
          ok: false,
          message: "Hold a valid YouCount QR code inside the frame.",
        });
      if (!(await L.consumeRate(db, "checkin_staff_scan", ipHash, 5000, 60)))
        return L.json(res, 429, {
          ok: false,
          message: "This scanner has been paused. Ask the service lead for help.",
        });
      const identities = await db.query(
        `SELECT i.id,i.public_id,i.identity_number,i.role_code,r.id AS record_id,r.submitted_payload
         FROM tlc_identities i
         LEFT JOIN LATERAL (
           SELECT id,submitted_payload FROM review_records
           WHERE identity_id=i.id ORDER BY updated_at DESC,id DESC LIMIT 1
         ) r ON true
         WHERE i.id=(
           SELECT id FROM tlc_identities WHERE identity_number=$1
           UNION ALL SELECT id FROM tlc_identities WHERE upper(public_id)=upper($1)
           UNION ALL SELECT identity_id FROM tlc_identity_aliases WHERE upper(alias)=upper($1)
           LIMIT 1
         )
         LIMIT 1`,
        [publicId],
      );
      const identity = identities[0];
      if (!identity) {
        await L.audit(
          db,
          null,
          ipHash,
          "checkin_scan",
          { publicId, location, service, device },
          "not_found",
        );
        return L.json(res, 404, {
          ok: false,
          message: "Card not recognised. Please direct the person to Member Care.",
        });
      }
      let changes = {};
      try {
        changes = L.decrypt(identity.submitted_payload)?.changes || {};
      } catch {}
      const inserted = await db.query(
        `INSERT INTO checkin_events(identity_id,location,service_label,service_date,source,device_label)
         VALUES($1,$2,$3,(now() AT TIME ZONE 'Europe/London')::date,'welcome_scanner',$4)
         ON CONFLICT(identity_id,service_date,location,service_label) DO NOTHING
         RETURNING id,checked_in_at`,
        [identity.id, location, service, device],
      );
      const duplicate = !inserted.length;
      await L.audit(
        db,
        null,
        ipHash,
        "checkin_scan",
        { publicId, location, service, device },
        duplicate ? "already_checked_in" : "checked_in",
      );
      return L.json(res, 200, {
        ok: true,
        duplicate,
        checkin: {
          publicId: identity.public_id,
          name:
            `${changes.firstName || ""} ${changes.lastName || ""}`.trim() ||
            "TLC attendee",
          photoRecordId: identity.record_id || null,
          location,
          service,
          checkedInAt: inserted[0]?.checked_in_at || null,
        },
      });
    }
    return L.json(res, 400, { ok: false });
  } catch (error) {
    console.error("Check-in endpoint failed", error.message);
    return L.json(res, 503, {
      ok: false,
      message: "Check-in is temporarily unavailable. Please try again.",
    });
  }
};
