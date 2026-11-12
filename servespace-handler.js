const crypto = require("crypto");
const L = require("./api/_lib");

const configuredSecret = () =>
  String(process.env.SERVESPACE_INTEGRATION_SECRET || process.env.YOUCOUNT_SSO_SECRET || "");
const APP_ACCESS = {
  data: { roles: ["data"], path: "/data" },
  "member-care": { roles: ["care"], path: "/member-care" },
  "check-in": { roles: ["attendance"], path: "/check-in" },
  events: { roles: ["events"], path: "/events" },
};

function verifyToken(token) {
  const secret = configuredSecret();
  if (secret.length < 32) throw new Error("integration_not_configured");
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw new Error("invalid_token");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!L.safeEqual(signature, expected)) throw new Error("invalid_token");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.iss !== "tlc-servespace" || !payload.sub || !Number.isFinite(payload.exp) || payload.exp < Date.now() || payload.exp > Date.now() + 3 * 60 * 1000)
    throw new Error("expired_token");
  const access = APP_ACCESS[payload.app];
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  if (!access || !access.roles.some((role) => roles.includes(role))) throw new Error("access_denied");
  return { payload, access };
}

function sessionCookie(app) {
  const hours = app === "check-in" ? 12 : 8;
  const exp = Date.now() + hours * 60 * 60 * 1000;
  if (app === "data") return `tlc_admin=${exp}.${L.hash(`admin:${exp}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${hours * 3600}`;
  if (app === "member-care") return `tlc_pastoral_staff=${exp}.${L.hash(`pastoral-staff:${exp}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${hours * 3600}`;
  if (app === "check-in") return `tlc_checkin_staff=${exp}.${L.hash(`checkin-staff:${exp}`)}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${hours * 3600}`;
  return "";
}

async function launch(req, res) {
  try {
    const { payload, access } = verifyToken(req.query?.token);
    const cookie = sessionCookie(payload.app);
    if (cookie) res.setHeader("Set-Cookie", cookie);
    try {
      const db = await L.ensureDb();
      await L.audit(db, null, L.hash(L.clientIp(req)), "servespace_launch", { personId: String(payload.sub), app: payload.app }, "approved");
    } catch {}
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", access.path);
    return res.status(302).end();
  } catch (error) {
    const setup = error.message === "integration_not_configured";
    return L.json(res, setup ? 503 : 401, {
      ok: false,
      message: setup ? "ServeSpace sign-in is not configured yet. Use the existing workspace sign-in for now." : "This ServeSpace launch link is invalid or has expired.",
    });
  }
}

function authorised(req) {
  const expected = configuredSecret();
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return expected.length >= 32 && L.safeEqual(supplied, expected);
}
const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
  ? String(value)
  : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

async function summary(req, res) {
  if (!authorised(req)) return L.json(res, 401, { ok: false });
  try {
    const db = await L.ensureDb();
    const view = String(req.query?.view || "summary");
    if (view === "status") return L.json(res, 200, { ok: true, service: "YouCount", checkedAt: new Date().toISOString() });
    if (view === "checkins") {
      const date = isoDate(req.query?.date);
      const rows = await db.query(`SELECT location,service_label,count(*)::int AS identified,
        min(checked_in_at) AS first_checkin,max(checked_in_at) AS last_checkin
        FROM checkin_events WHERE service_date=$1::date
        GROUP BY location,service_label ORDER BY location,service_label`, [date]);
      const headcounts = await db.query(`SELECT location,service_label,
        sum(male_count+female_count+children_count)::int AS total
        FROM attendance_headcounts WHERE service_date=$1::date
        GROUP BY location,service_label ORDER BY location,service_label`, [date]);
      return L.json(res, 200, { ok: true, date, services: rows, headcounts });
    }
    if (view === "care") {
      const rows = await db.query(`SELECT status,count(*)::int AS count,
        count(*) FILTER (WHERE updated_at < now()-interval '7 days')::int AS over_seven_days
        FROM pastoral_cases GROUP BY status ORDER BY status`);
      return L.json(res, 200, { ok: true, cases: rows });
    }
    if (view !== "summary") return L.json(res, 400, { ok: false });
    const [reviews, checkins, care] = await Promise.all([
      db.query(`SELECT status,count(*)::int AS count FROM review_records GROUP BY status ORDER BY status`),
      db.query(`SELECT count(*)::int AS count FROM checkin_events WHERE service_date=(now() AT TIME ZONE 'Europe/London')::date`),
      db.query(`SELECT count(*)::int AS count FROM pastoral_cases WHERE status IN ('open','contacted')`),
    ]);
    await L.audit(db, null, L.hash(L.clientIp(req)), "servespace_summary_read", { view }, "approved");
    return L.json(res, 200, {
      ok: true,
      checkedAt: new Date().toISOString(),
      profileReviews: reviews,
      identifiedToday: Number(checkins[0]?.count || 0),
      openMemberCare: Number(care[0]?.count || 0),
    });
  } catch {
    return L.json(res, 503, { ok: false, message: "YouCount summary is temporarily unavailable." });
  }
}

module.exports = async function servespaceHandler(req, res) {
  if (req.method !== "GET") return L.json(res, 405, { ok: false });
  return String(req.query?.portal || "") === "servespaceLaunch" ? launch(req, res) : summary(req, res);
};
