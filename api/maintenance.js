const L = require("./_lib");
const { syncCatalogues } = require("./_catalog");
const { refreshPastoralCases } = require("./admin");
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
      await db.query(
        "DELETE FROM journey_presence WHERE last_seen_at < now()-interval '2 days'",
      );
      // The team portal creates this table on first use, so it may not exist yet.
      try {
        await db.query(
          "DELETE FROM portal_rate_limits WHERE window_started_at < now()-interval '1 day'",
        );
      } catch {}
      // Staff screens list pastoral cases; finding new ones runs here, after
      // each Sunday's check-ins, instead of on every screen load.
      await refreshPastoralCases(db);
      // A check-in email still "pending" after an hour means the function
      // stopped mid-send; mark it so staff see it was not delivered.
      await db.query(
        "UPDATE checkin_events SET notification_status='failed' WHERE notification_status='pending' AND checked_in_at < now()-interval '1 hour'",
      );
      if (job === "cleanup") return L.json(res, 200, { ok: true, job });
    }
    // Neon's HTTP driver runs each query on a pooled connection, so a Postgres
    // session lock taken in one query is not held for the next. A lease row
    // does the same job: one run at a time, and it expires if a run crashes.
    const lease = await db.query(
      `INSERT INTO pc_sync_state(name,value,updated_at) VALUES('maintenance_lease','running',now())
       ON CONFLICT(name) DO UPDATE SET value='running',updated_at=now()
       WHERE pc_sync_state.value<>'running' OR pc_sync_state.updated_at < now()-interval '10 minutes'
       RETURNING name`,
    );
    if (!lease.length)
      return L.json(res, 200, { ok: true, job, skipped: "already_running" });
    try {
      return L.json(res, 200, { ok: true, job, ...(await syncCatalogues(db)) });
    } finally {
      await db.query(
        "UPDATE pc_sync_state SET value='idle',updated_at=now() WHERE name='maintenance_lease'",
      );
    }
  } catch (error) {
    console.error("YouCount maintenance failed", error.message);
    return L.json(res, 503, { ok: false });
  }
};
