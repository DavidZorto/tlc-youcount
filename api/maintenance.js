const L = require("./_lib");
const { syncCatalogues } = require("./_catalog");
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return L.json(res, 405, { ok: false });
  if (
    !process.env.CRON_SECRET ||
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  )
    return L.json(res, 401, { ok: false });
  try {
    const db = await L.migrateDb(),
      job = String(req.query?.job || "catalog");
    if (job === "cleanup" || job === "all") {
      await db.query(
        "DELETE FROM audit_events WHERE created_at < now()-interval '90 days'",
      );
      await db.query(
        "DELETE FROM survey_responses WHERE created_at < now()-interval '90 days'",
      );
      await db.query(
        "DELETE FROM verification_sessions WHERE expires_at < now()-interval '1 day'",
      );
      await db.query(
        "DELETE FROM rate_limits WHERE window_started_at < now()-interval '1 day'",
      );
      if (job === "cleanup") return L.json(res, 200, { ok: true, job });
    }
    const lock = await db.query(
      "SELECT pg_try_advisory_lock(784512) AS acquired",
    );
    if (!lock[0]?.acquired)
      return L.json(res, 200, { ok: true, job, skipped: "already_running" });
    try {
      return L.json(res, 200, { ok: true, job, ...(await syncCatalogues(db)) });
    } finally {
      await db.query("SELECT pg_advisory_unlock(784512)");
    }
  } catch (error) {
    console.error("YouCount maintenance failed", error.message);
    return L.json(res, 503, { ok: false });
  }
};
