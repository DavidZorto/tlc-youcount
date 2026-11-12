// Server-only Twilio Verify connectivity check. Does not send a message.
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  res.setHeader("Cache-Control", "no-store");
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) {
    return res.status(503).json({ ok: false, service: "twilio-verify", reason: "not_configured" });
  }

  try {
    const authorization = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}`,
      { signal: AbortSignal.timeout(10000), headers: { Authorization: `Basic ${authorization}`, Accept: "application/json" } }
    );
    if (!response.ok) {
      return res.status(502).json({ ok: false, service: "twilio-verify", reason: "upstream_rejected" });
    }
    const service = await response.json();
    return res.status(200).json({
      ok: true,
      service: "twilio-verify",
      status: service.status === "active" ? "active" : "configured"
    });
  } catch {
    return res.status(502).json({ ok: false, service: "twilio-verify", reason: "upstream_unavailable" });
  }
};
