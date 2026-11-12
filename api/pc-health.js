// Server-only Planning Center connectivity check.
// Never returns credentials or member records to the browser.
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  const clientId = process.env.pc_clientid;
  const secret = process.env.pc_secret;
  if (!clientId || !secret) {
    return res.status(503).json({ ok: false, service: "planning-center", reason: "not_configured" });
  }

  try {
    const authorization = Buffer.from(`${clientId}:${secret}`).toString("base64");
    const response = await fetch("https://api.planningcenteronline.com/people/v2/people?per_page=1", {
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Basic ${authorization}`,
        Accept: "application/json",
        "User-Agent": "TLC Profile Verification Portal (data-team@thelibertychurchlondon.com)"
      }
    });

    if (!response.ok) {
      return res.status(502).json({ ok: false, service: "planning-center", reason: "upstream_rejected" });
    }

    return res.status(200).json({ ok: true, service: "planning-center", mode: "read-only" });
  } catch {
    return res.status(502).json({ ok: false, service: "planning-center", reason: "upstream_unavailable" });
  }
};
