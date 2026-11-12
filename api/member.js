const L = require("./_lib");
const Wallet = require("./_wallet");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { get: getPrivateBlob } = require("@vercel/blob");

const generic = { ok: true, message: "Continue with the next step." };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SELECTABLE_GROUP_TYPE_IDS = ["459560", "495375", "511634", "515439"];
const displayGroupName = (value) => {
  const name = String(value || "").trim();
  return /^sol(?:\s+team)?$/i.test(name) ? "Sounds of Liberty" : name;
};
const UK_POSTCODE = /^(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i;
const cleanAddressPostcode = (value) => {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length > 3
    ? `${compact.slice(0, -3)} ${compact.slice(-3)}`
    : compact;
};
const uniqueAddressParts = (values) => [...new Set(values.filter(Boolean))];
function formatIdealAddress(item) {
  const postcode = cleanAddressPostcode(item.postcode),
    addressLine1 = uniqueAddressParts([
      item.line_1,
      item.line_2,
      item.line_3,
      item.post_town,
      item.county,
    ]).join(", ");
  return {
    label: uniqueAddressParts([addressLine1, postcode]).join(", "),
    addressLine1,
    postcode,
    region:
      item.county ||
      item.administrative_county ||
      item.traditional_county ||
      "",
    country: item.country || "United Kingdom",
  };
}
async function addressLookup(db, req, res, ipHash) {
  const postcode = cleanAddressPostcode(req.body?.postcode);
  if (!UK_POSTCODE.test(postcode))
    return L.json(res, 400, {
      ok: false,
      message: "Enter a complete UK postcode.",
    });
  const browserId = String(req.body?.browserId || "").slice(0, 100);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(browserId))
    return L.json(res, 400, {
      ok: false,
      message: "Please refresh the page and try again.",
    });
  if (
    !(await L.consumeRate(
      db,
      "address_lookup_browser",
      L.hash(`address-browser:${browserId}:${ipHash}`),
      12,
      15,
    ))
  )
    return L.json(res, 429, {
      ok: false,
      message: "Please wait before checking another postcode.",
    });

  const key = process.env.IDEAL_POSTCODES_API_KEY;
  if (key) {
    const response = await fetch(
      `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(postcode.replace(/\s/g, ""))}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "User-Agent":
            "TLC Member Care (datateam@thelibertychurchlondon.com)",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 404)
      return L.json(res, 200, {
        ok: true,
        recognised: false,
        postcode,
        addresses: [],
      });
    if (!response.ok) throw new Error("address_provider_unavailable");
    const payload = await response.json(),
      addresses = (Array.isArray(payload.result) ? payload.result : [])
        .map(formatIdealAddress)
        .filter((item) => item.addressLine1)
        .slice(0, 100);
    return L.json(res, 200, {
      ok: true,
      recognised: addresses.length > 0,
      postcode: addresses[0]?.postcode || postcode,
      addresses,
    });
  }

  const response = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s/g, ""))}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) },
  );
  if (response.status === 404)
    return L.json(res, 200, {
      ok: true,
      recognised: false,
      postcode,
      addresses: [],
    });
  if (!response.ok) throw new Error("postcode_provider_unavailable");
  const payload = await response.json(),
    result = payload.result || {},
    location = uniqueAddressParts([
      result.admin_district,
      result.region,
      result.country,
    ]).join(", ");
  return L.json(res, 200, {
    ok: true,
    recognised: true,
    postcode: result.postcode || postcode,
    location,
    addresses: [],
    fullAddressLookupConfigured: false,
  });
}
function isTestProfile(person) {
  if (!person) return false;
  const exemptions = [
    [process.env.TEST_PROFILE_EMAIL, process.env.TEST_PROFILE_PHONE],
    [
      process.env.ADMIN_TEST_PROFILE_EMAIL,
      process.env.ADMIN_TEST_PROFILE_PHONE,
    ],
  ];
  return exemptions.some(([rawEmail, rawPhone]) => {
    const email = L.normalizeEmail(rawEmail),
      phone = L.digits(rawPhone);
    if (!email || !phone) return false;
    return (
      person.emails.some((item) => L.normalizeEmail(item) === email) &&
      person.phones.some((item) =>
        L.digits(item).endsWith(phone.slice(-10)),
      )
    );
  });
}
const html = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const NEXT_STEP_LINKS = {
  growTrack:
    "https://www.eventbrite.co.uk/e/grow-track-foundation-fortify-tickets-1978884766607?aff=erelpanelorg",
  baptism:
    "https://www.eventbrite.co.uk/e/water-baptism-at-the-liberty-church-tickets-1273852640539?aff=erelpanelorg",
  connect: "https://tlcg.churchcenter.com/registrations/events/3671720",
  smallGroup: "https://tlcg.churchcenter.com/people/forms/868123",
};
function identityNextSteps(changes = {}, connectEligible = false) {
  const answer = (value) => String(value || "").trim().toLowerCase(),
    steps = [
      {
        title: "Grow Track: Foundation & Fortify",
        description: "Build strong foundations and continue growing at TLC.",
        url: NEXT_STEP_LINKS.growTrack,
      },
    ];
  if (answer(changes.baptised) === "no")
    steps.push({
      title: "Water Baptism",
      description: "Register your interest in the next Water Baptism.",
      url: NEXT_STEP_LINKS.baptism,
    });
  if (!connectEligible)
    steps.push({
      title: "Connect",
      description: "Take your next step towards becoming a TLC member.",
      url: NEXT_STEP_LINKS.connect,
    });
  if (answer(changes.smallGroupMember) === "no")
    steps.push({
      title: "Find a Small Group",
      description: "Tell us you would like help finding a Small Group.",
      url: NEXT_STEP_LINKS.smallGroup,
    });
  return steps;
}
function identityNextStepsHtml(changes, connectEligible) {
  const steps = identityNextSteps(changes, connectEligible);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;border-top:1px solid #d5a62e"><tr><td style="padding:25px 0 10px"><div style="font-size:12px;font-weight:800;color:#d41477;letter-spacing:1.5px">YOUR NEXT STEPS</div><h2 style="margin:8px 0 5px;color:#062f52;font-size:22px;line-height:1.25">Continue your journey at TLC</h2><p style="margin:0;color:#667585;font-size:14px;line-height:1.5">These links have been selected from the answers in your form.</p></td></tr>${steps
    .map(
      (step) =>
        `<tr><td style="padding-top:10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff;border:1px solid #d9e3ec;border-radius:10px"><tr><td style="padding:16px 18px"><div style="font-size:16px;font-weight:700;color:#062f52">${html(step.title)}</div><div style="margin-top:4px;color:#667585;font-size:13px;line-height:1.45">${html(step.description)}</div></td><td width="116" align="right" style="padding:16px 18px 16px 8px"><a href="${html(step.url)}" style="display:inline-block;background:#062f52;color:#fff;text-decoration:none;border-radius:8px;padding:10px 15px;font-size:13px;font-weight:700">View details</a></td></tr></table></td></tr>`,
    )
    .join("")}</table>`;
}
const includeJourneyGraphic = (changes = {}) =>
  ["visitor", "attendee"].includes(
    String(changes.membershipStatus || "").trim().toLowerCase(),
  );
async function ensureApplePassState(db, identityId) {
  const rows = await db.query(
    "SELECT authentication_token,updated_at FROM wallet_pass_state WHERE identity_id=$1",
    [identityId],
  );
  if (rows.length)
    return {
      authenticationToken: L.decrypt(rows[0].authentication_token).token,
      updatedAt: rows[0].updated_at,
    };
  const token = crypto.randomBytes(32).toString("base64url");
  await db.query(
    `INSERT INTO wallet_pass_state(identity_id,authentication_token)
     VALUES($1,$2) ON CONFLICT(identity_id) DO NOTHING`,
    [identityId, L.encrypt({ token })],
  );
  const stored = await db.query(
    "SELECT authentication_token,updated_at FROM wallet_pass_state WHERE identity_id=$1",
    [identityId],
  );
  return {
    authenticationToken: L.decrypt(stored[0].authentication_token).token,
    updatedAt: stored[0].updated_at,
  };
}
function redesignedIdentityEmail({
  appUrl,
  firstName,
  identity,
  changes,
  walletEligible,
  appleWalletUrl,
  nextStepsHtml,
}) {
  const fullName = `${changes.firstName || firstName || ""} ${changes.lastName || ""}`.trim(),
    location = String(changes.tlcLocation || "The Liberty Church").trim(),
    publicId = String(identity.public_id || ""),
    parts = publicId.trim().split(/\s+/),
    roleCode = parts.length > 1 ? parts.shift() : String(identity.role_code || "YC"),
    rawNumber = parts.join("") || L.digits(publicId).slice(-6),
    numberSpaced = rawNumber.length === 6 ? `${rawNumber.slice(0, 3)} ${rawNumber.slice(3)}` : rawNumber,
    roleLabels = {
      OP: "Pastor",
      OM: "Minister",
      OA: "Pastoral assistant",
      OD: "Deacon",
      OC: "Co-ordinator",
      TL: "Team lead",
      SG: "Small group lead",
      TM: "Team member",
      CM: "Church member",
      AT: "Attender",
      V: "Visitor",
    },
    roleLabel = roleLabels[roleCode] || "YouCount member",
    countedYear = new Date().getFullYear(),
    cardHtml = walletEligible
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:420px;margin:0 auto;background:#003264;border-radius:14px;overflow:hidden"><tr><td style="padding:20px 22px 0"><table role="presentation" width="100%"><tr><td><img src="${appUrl}/assets/youcount-card/logo-white.png" width="80" alt="The Liberty Church" style="display:block;width:80px;height:auto;border:0"></td><td align="right" style="color:#fff;font-size:13px;font-weight:700">YouCount<br><span style="color:#aeb9cc;font-size:12px;font-weight:400">Counted ${countedYear}</span></td></tr></table></td></tr><tr><td><table role="presentation" width="100%"><tr><td style="padding:24px 0 20px 22px;color:#fff"><div style="margin-bottom:28px;white-space:nowrap"><span style="color:#f0a500;font-size:15px;font-weight:800">${html(roleCode)}</span>&nbsp;&nbsp;<span style="font-size:32px;font-weight:800">${html(numberSpaced)}</span></div><div style="font-size:16px;font-weight:600">${html(fullName)}</div><div style="margin-top:3px;color:#c3ccdb;font-size:12px">${html(roleLabel)} &middot; ${html(location)}</div></td><td width="160" valign="bottom" style="line-height:0"><img src="${appUrl}/assets/email/youcount-card-ribbon@3x.png" width="160" height="180" alt="" style="display:block;width:160px;height:180px;border:0"></td></tr></table></td></tr></table>`
      : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:420px;margin:0 auto;border:1px solid #e6ddd6;border-radius:12px;background:#fcf9f6"><tr><td align="center" style="padding:24px 22px"><div style="margin-bottom:10px;color:#1b3a6b;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Your YouCount number</div><div style="white-space:nowrap"><span style="color:#1b3a6b;font-size:15px;font-weight:800">${html(roleCode)}</span>&nbsp;&nbsp;<span style="color:#1f1a17;font-size:32px;font-weight:800">${html(numberSpaced)}</span></div><div style="margin-top:10px;font-size:16px">${html(fullName)} &middot; ${html(location)}</div><div style="margin-top:14px;color:#6b625d;font-size:14px">Complete Connect to unlock your digital YouCount card.</div></td></tr></table>`,
    walletHtml =
      walletEligible && appleWalletUrl
        ? `<tr><td align="center" style="padding:28px 28px 0"><p style="margin:0 0 14px;font-size:16px;font-weight:600">Add your card to your phone</p><a href="${html(appleWalletUrl)}" style="display:inline-block;min-width:190px;padding:12px 20px;border-radius:9px;background:#000;color:#fff;text-decoration:none;font-size:16px;font-weight:700">&#63743;&nbsp; Add to Apple Wallet</a><p style="margin:12px 0 0;color:#6b625d;font-size:13px">On a computer? Open this email on your iPhone to add it.</p></td></tr>`
        : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>You're counted</title></head><body style="margin:0;padding:0;background:#f5f1ed;font-family:Arial,Helvetica,sans-serif;color:#1f1a17"><div style="display:none;max-height:0;overflow:hidden">Your YouCount number is ${html(publicId)}. It is yours for life.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1ed"><tr><td align="center" style="padding:12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:760px;background:#fff;border-radius:14px;overflow:hidden"><tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr><td height="6" bgcolor="#e84b4b"></td><td bgcolor="#3b82f6"></td><td bgcolor="#f0a500"></td><td bgcolor="#16a34a"></td><td bgcolor="#7c3aed"></td></tr></table></td></tr><tr><td align="center" style="padding:28px 28px 0"><img src="${appUrl}/assets/email/tlc-logo-colour.png" width="112" alt="The Liberty Church" style="display:block;width:112px;height:auto;border:0"></td></tr><tr><td align="center" style="padding:28px 28px 8px"><div style="margin-bottom:10px;color:#1b3a6b;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">YouCount</div><h1 style="margin:0;color:#1f1a17;font-size:28px;line-height:1.2">You're counted${firstName ? `, ${html(firstName)}` : ""}</h1></td></tr><tr><td align="center" style="padding:12px 28px 0"><p style="max-width:460px;margin:0;color:#1f1a17;font-size:16px;line-height:1.7">Thank you for completing your profile. Here is your YouCount number. It is yours for life, so keep this email.</p></td></tr><tr><td style="padding:28px 28px 0">${cardHtml}</td></tr>${walletHtml}<tr><td style="padding:28px">${nextStepsHtml || ""}<p style="margin:32px 0 2px;color:#1b3a6b;font-family:Georgia,serif;font-size:24px;font-style:italic">With love,</p><p style="margin:0;color:#6b625d;font-size:14px;line-height:1.6"><strong style="color:#1f1a17">The Data Team</strong><br>The Liberty Church Global</p></td></tr><tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr><td height="6" bgcolor="#7c3aed"></td><td bgcolor="#16a34a"></td><td bgcolor="#f0a500"></td><td bgcolor="#3b82f6"></td><td bgcolor="#e84b4b"></td></tr></table></td></tr></table><p style="max-width:700px;margin:22px auto 0;color:#6b625d;font-size:12px;line-height:1.7;text-align:center">If anything on your card is wrong, email the Data Team at <a href="mailto:datateam@thelibertychurchlondon.com" style="color:#1b3a6b">datateam@thelibertychurchlondon.com</a>.<br>Liberty Point, 4 High Elms, Woodford Green, Essex IG8 0UP, United Kingdom<br>&copy; ${countedYear} The Liberty Church Global · <a href="https://thelibertychurchlondon.com/privacy-policy/" style="color:#6b625d">Privacy notice</a></p></td></tr></table></body></html>`;
}

async function sendIdentityReceipt(db, email, firstName, identity, changes = {}, walletEligible = true) {
  const sendGridKey = process.env.SENDGRID_API_KEY,
    resendKey = process.env.RESEND_API_KEY;
  if ((!sendGridKey && !resendKey) || !email || !identity?.public_id)
    return "not_configured";
  let walletAttachment = null;
  if (walletEligible)
    try {
      const passState = await ensureApplePassState(db, identity.id);
      walletAttachment = (await createApplePass(identity, changes, passState)).toString("base64");
    } catch (error) {
      console.error("Identity email Wallet attachment skipped", error.message);
    }
  const appUrl = String(
      process.env.YOUCOUNT_PUBLIC_URL || "https://youcount.thelibertychurchlondon.com",
    ).replace(/\/$/, ""),
    appleWalletUrl = walletAttachment
      ? `${appUrl}/api/member?action=emailApplePass&token=${encodeURIComponent(
          L.encrypt({ identityId: identity.id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }),
        )}`
      : null;
  let googleWalletUrl = null;
  if (walletEligible && googleWalletConfig())
    try {
      googleWalletUrl = await googleWalletLink(identity, changes);
    } catch (error) {
      console.error("Identity email Google Wallet link skipped", error.message);
    }
  const fromAddress =
      process.env.IDENTITY_FROM_EMAIL || "hello@penielsense.co.uk",
    fromName = process.env.IDENTITY_FROM_NAME || "The Liberty Church",
    subject = `You're counted${firstName ? `, ${firstName}` : ""}`,
    memberName = `${changes.firstName || firstName || ""} ${changes.lastName || ""}`.trim(),
    homeLocation = String(changes.tlcLocation || "").trim(),
    journeyGraphicHtml = includeJourneyGraphic(changes)
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px"><tr><td><img src="${appUrl}/assets/email/four-week-journey.jpg" width="536" alt="Your four-week TLC journey: Connect, Discover You, Serve 1 and Serve 2" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:10px"></td></tr></table>`
      : "",
    nextStepsHtml = identityNextStepsHtml(changes, walletEligible),
    walletButtons = walletEligible
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:0 0 12px">${appleWalletUrl ? `<a href="${html(appleWalletUrl)}" style="display:block;background:#000;color:#fff;text-decoration:none;text-align:center;border-radius:10px;padding:15px 18px;font-size:17px;font-weight:700">&#63743;&nbsp;&nbsp; Add to Apple Wallet</a>` : ""}</td></tr>${googleWalletUrl ? `<tr><td><a href="${html(googleWalletUrl)}" style="display:block;background:#fff;color:#062f52;text-decoration:none;text-align:center;border:2px solid #062f52;border-radius:10px;padding:13px 18px;font-size:17px;font-weight:700">Add to Google Wallet</a></td></tr>` : ""}</table>`
      : "",
    emailHtml = `<!doctype html><html><body style="margin:0;padding:0;background:#eceff2"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eceff2"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#f7f3ea;color:#062f52;font-family:Arial,Helvetica,sans-serif"><tr><td style="background:#062f52;padding:20px 28px"><img src="${appUrl}/assets/tlc-logo.png" width="132" alt="The Liberty Church" style="display:block;width:132px;max-width:100%;height:auto;border:0"></td></tr><tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td height="5" bgcolor="#ef5350"></td><td height="5" bgcolor="#3888e8"></td><td height="5" bgcolor="#f4b000"></td><td height="5" bgcolor="#27a95b"></td><td height="5" bgcolor="#7c35c8"></td></tr></table></td></tr><tr><td style="padding:34px 32px 12px"><div style="font-size:12px;font-weight:800;color:#d41477;letter-spacing:2px">YOU COUNT</div><h1 style="margin:15px 0 8px;font-size:32px;line-height:1.12;color:#062f52">Thank you${firstName ? `, ${html(firstName)}` : ""}.</h1><p style="margin:0;color:#586779;font-size:16px;line-height:1.55">Your details have been received securely.</p></td></tr><tr><td style="padding:16px 32px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#062f52;border-radius:14px"><tr><td style="padding:27px 25px;color:#fff"><div style="font-size:11px;letter-spacing:2px;color:#d9e3ec">${walletEligible ? "YOUR YOUCOUNT NUMBER" : "YOUR TLC REFERENCE"}</div><div style="font-size:35px;line-height:1.15;font-weight:800;margin:8px 0 14px">${html(identity.public_id)}</div><div style="height:2px;background:#d5a62e;margin-bottom:15px"></div>${memberName ? `<div style="font-size:16px;font-weight:700;letter-spacing:1px">${html(memberName.toUpperCase())}</div>` : ""}${homeLocation ? `<div style="font-size:13px;color:#d9e3ec;margin-top:8px"><span style="color:#e4b94d;font-weight:700">HOME</span>&nbsp;&nbsp; ${html(homeLocation.toUpperCase())}</div>` : ""}</td></tr></table></td></tr><tr><td style="padding:10px 32px 34px"><p style="margin:0 0 20px;text-align:center;color:#334c63;font-size:15px;line-height:1.55">${walletEligible ? "Your YouCount Card is ready for quicker check-in." : "Complete Connect to unlock your digital YouCount Card for Apple or Google Wallet."}</p>${walletButtons}${journeyGraphicHtml}${nextStepsHtml}<div style="border-top:1px solid #d5a62e;margin-top:28px;padding-top:18px;color:#667585;font-size:12px;line-height:1.55;text-align:center">The data team will review any profile changes. Keep this email for your records.<br><strong style="color:#062f52">The Liberty Church</strong></div></td></tr></table></td></tr></table></body></html>`;
  const redesignedEmailHtml = redesignedIdentityEmail({
    appUrl,
    firstName,
    identity,
    changes,
    walletEligible,
    appleWalletUrl,
    nextStepsHtml,
  });
  const provider = sendGridKey ? "sendgrid" : "resend";
  const url = sendGridKey
    ? "https://api.sendgrid.com/v3/mail/send"
    : "https://api.resend.com/emails";
  const request = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendGridKey || resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      sendGridKey
        ? {
            personalizations: [{ to: [{ email }] }],
            from: { email: fromAddress, name: fromName },
            subject,
            content: [{ type: "text/html", value: redesignedEmailHtml }],
            ...(walletAttachment
              ? { attachments: [{ content: walletAttachment, type: "application/vnd.apple.pkpass", filename: `${identity.public_id}.pkpass`, disposition: "attachment" }] }
              : {}),
          }
        : {
            from: `${fromName} <${fromAddress}>`,
            to: [email],
            subject,
            html: redesignedEmailHtml,
            ...(walletAttachment
              ? { attachments: [{ filename: `${identity.public_id}.pkpass`, content: walletAttachment }] }
              : {}),
          },
    ),
  };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(url, { ...request, signal: AbortSignal.timeout(15000) });
    if (response.ok) return "sent";
    const retryable = response.status === 429 || response.status >= 500;
    console.error("Identity receipt provider rejected request", {
      provider,
      status: response.status,
      attempt,
      retryable,
    });
    if (!retryable || attempt === 2)
      throw new Error(`identity_email_failed_${response.status}`);
    await sleep(350);
  }
  throw new Error("identity_email_failed");
}
function applePassCertificates() {
  const forge = require("node-forge"),
    encoded = String(process.env.APPLE_PASS_P12_BASE64 || "").replace(/\s/g, ""),
    password = String(process.env.APPLE_PASS_P12_PASSWORD || "");
  if (!encoded) throw new Error("apple_pass_certificate_missing");
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(encoded)), false, password),
    certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [],
    keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
    ],
    teamId = String(process.env.APPLE_TEAM_ID || ""),
    signer = certBags.find((bag) => bag.cert?.subject?.getField("OU")?.value === teamId)?.cert || certBags[0]?.cert;
  if (!signer || !keyBags[0]?.key) throw new Error("apple_pass_private_key_missing");
  return {
    signerCert: forge.pki.certificateToPem(signer),
    signerKey: forge.pki.privateKeyToPem(keyBags[0].key),
    wwdr: fs.readFileSync(path.join(process.cwd(), "assets/apple-pass/AppleWWDRCAG4.pem")),
  };
}
function applePassAsset(name) {
  return fs.readFileSync(path.join(process.cwd(), "assets/apple-pass", name));
}
function identityRoleLabel(code) {
  return {
    OP: "Pastor",
    OM: "Minister",
    OA: "Pastoral assistant",
    OD: "Deacon",
    OC: "Co-ordinator",
    TL: "Team lead",
    SG: "Small group lead",
    TM: "Team member",
    CM: "Church member",
    AT: "Attender",
    V: "Visitor",
    A: "Ordained leader",
    B: "Connect member",
  }[String(code || "").toUpperCase()] || "YouCount member";
}
function walletDisplayNumber(publicId) {
  const normalized = String(publicId || "").trim().toUpperCase(),
    match = normalized.match(/^([A-Z]{1,3})[-\s]?(\d{4,})$/);
  if (!match) return normalized;
  const [, prefix, digits] = match,
    splitAt = Math.max(0, digits.length - 3),
    groupedDigits = splitAt ? `${digits.slice(0, splitAt)} ${digits.slice(splitAt)}` : digits;
  return `${prefix} ${groupedDigits}`;
}
async function createApplePass(identity, changes, passState = null) {
  const { PKPass } = require("passkit-generator"),
    passTypeIdentifier = String(process.env.APPLE_PASS_TYPE_ID || ""),
    teamIdentifier = String(process.env.APPLE_TEAM_ID || "");
  if (!passTypeIdentifier || !teamIdentifier) throw new Error("apple_pass_identifiers_missing");
  const memberName = `${changes.firstName || ""} ${changes.lastName || ""}`.trim() || "TLC Cardholder",
    scanNumber = String(identity.identity_number || L.digits(identity.public_id).slice(-6)),
    homeLocation = String(changes.tlcLocation || "The Liberty Church"),
    role = identityRoleLabel(identity.role_code),
    counted = String(new Date(identity.created_at || Date.now()).getFullYear()),
    displayNumber = walletDisplayNumber(identity.public_id),
    fallbackDisplayNumber = String(identity.public_id || "").trim().toUpperCase().replace(/[-\s]+/, " "),
    backFields = [
      { key: "cardDetails", label: "CARD DETAILS", value: `Role: ${role}\nLocation: ${homeLocation}\nCounted: ${counted}` },
      { key: "about", label: "ABOUT THIS CARD", value: "Your YouCount number is yours for life. The letters in front show your role and update when your role changes." },
      { key: "help", label: "SOMETHING WRONG?", value: "If your name, role or location is wrong, email the Data Team at datateam@thelibertychurchlondon.com and we’ll update your card." },
      { key: "privacy", label: "YOUR DETAILS", value: "How The Liberty Church Global uses your details: https://thelibertychurchlondon.com/privacy-policy/" },
      { key: "update", label: "UPDATE YOUR DETAILS", value: "https://youcount.thelibertychurchlondon.com" },
    ],
    posterFields = {
      headerFields: [{ key: "tlcId", label: "YOUCOUNT", value: displayNumber }],
      primaryFields: [
        { key: "cardholder", label: "NAME", value: memberName },
        { key: "role", label: "ROLE", value: role },
        { key: "home", label: "LOCATION", value: homeLocation },
        { key: "counted", label: "COUNTED", value: counted },
      ],
      backFields,
    },
    fallbackFields = {
      headerFields: [],
      primaryFields: [],
      secondaryFields: [{ key: "cardholder", label: "CARDHOLDER", value: memberName }],
      auxiliaryFields: [{ key: "tlcId", label: "YOUCOUNT NUMBER", value: fallbackDisplayNumber }],
      backFields,
    },
    passJson = {
      formatVersion: 1, passTypeIdentifier, serialNumber: `youcount-${identity.id}`, teamIdentifier,
      organizationName: "The Liberty Church Global", description: "YouCount card",
      ...(passState?.authenticationToken
        ? {
            webServiceURL: `${String(process.env.YOUCOUNT_PUBLIC_URL || "https://youcount.thelibertychurchlondon.com").replace(/\/$/, "")}/passkit`,
            authenticationToken: passState.authenticationToken,
          }
        : {}),
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(0, 50, 100)", labelColor: "rgb(240, 165, 0)",
      suppressStripShine: true, sharingProhibited: true,
      posterGeneric: posterFields,
      storeCard: fallbackFields,
      barcodes: [
        { format: "PKBarcodeFormatQR", message: scanNumber, messageEncoding: "iso-8859-1", altText: scanNumber },
      ],
      barcode: { format: "PKBarcodeFormatQR", message: scanNumber, messageEncoding: "iso-8859-1", altText: scanNumber },
    },
    pass = new PKPass({
      "pass.json": Buffer.from(JSON.stringify(passJson)),
      "icon.png": applePassAsset("icon.png"), "icon@2x.png": applePassAsset("icon@2x.png"),
      "icon@3x.png": applePassAsset("icon@3x.png"),
      "logo.png": applePassAsset("logo.png"), "logo@2x.png": applePassAsset("logo@2x.png"),
      "logo@3x.png": applePassAsset("logo@3x.png"),
      "primaryLogo@2x.png": applePassAsset("primaryLogo@2x.png"),
      "primaryLogo@3x.png": applePassAsset("primaryLogo@3x.png"),
      "strip.png": applePassAsset("strip.png"), "strip@2x.png": applePassAsset("strip@2x.png"),
      "strip@3x.png": applePassAsset("strip@3x.png"),
      "artwork@2x.png": applePassAsset("artwork@2x.png"),
      "artwork@3x.png": applePassAsset("artwork@3x.png"),
    }, applePassCertificates());
  return pass.getAsBuffer();
}
function googleWalletConfig() {
  const issuerId = String(process.env.GOOGLE_WALLET_ISSUER_ID || ""),
    encoded = String(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64 || ""),
    plain = String(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON || "");
  if (!issuerId || (!encoded && !plain)) return null;
  try {
    const credentials = JSON.parse(
      encoded ? Buffer.from(encoded, "base64").toString("utf8") : plain,
    );
    if (!credentials.client_email || !credentials.private_key) return null;
    return { issuerId, credentials };
  } catch {
    return null;
  }
}
const walletLocalized = (value) => ({
  defaultValue: { language: "en-GB", value: String(value) },
});
async function googleWalletLink(identity, changes) {
  const config = googleWalletConfig();
  if (!config) throw new Error("google_wallet_not_configured");
  const { issuerId, credentials } = config,
    publicId = String(identity.public_id),
    scanNumber = String(identity.identity_number || L.digits(publicId).slice(-6)),
    classId = `${issuerId}.youcount_card`,
    objectId = `${issuerId}.youcount_${identity.id}`,
    memberName = `${changes.firstName || ""} ${changes.lastName || ""}`.trim() || "TLC Cardholder",
    homeLocation = String(changes.tlcLocation || "The Liberty Church"),
    role = identityRoleLabel(identity.role_code),
    counted = String(new Date(identity.created_at || Date.now()).getFullYear()),
    appUrl = String(
      process.env.YOUCOUNT_PUBLIC_URL ||
      process.env.PUBLIC_APP_URL ||
      "https://youcount.thelibertychurchlondon.com",
    ).replace(/\/$/, ""),
    genericObject = {
      id: objectId,
      classId,
      state: "ACTIVE",
      cardTitle: walletLocalized("YouCount Card"),
      header: walletLocalized(memberName),
      subheader: walletLocalized(publicId),
      hexBackgroundColor: "#003264",
      logo: {
        sourceUri: { uri: `${appUrl}/assets/google-wallet/logo-660.png?v=3` },
      },
      heroImage: {
        sourceUri: { uri: `${appUrl}/assets/google-wallet/hero-1032x336.png?v=4` },
      },
      barcode: {
        type: "QR_CODE",
        value: scanNumber,
        alternateText: scanNumber,
      },
      textModulesData: [
        { id: "number", header: "YOUCOUNT NUMBER", body: publicId },
        { id: "role", header: "ROLE", body: role },
        { id: "home", header: "LOCATION", body: homeLocation },
        { id: "counted", header: "COUNTED", body: counted },
      ],
    },
    prepared = await Wallet.upsertGooglePassObject(genericObject),
    header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    payload = Buffer.from(JSON.stringify({
      iss: credentials.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      payload: { genericObjects: [{ id: objectId }] },
    })).toString("base64url"),
    unsigned = `${header}.${payload}`,
    signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), credentials.private_key).toString("base64url");
  if (!prepared) throw new Error("google_wallet_object_not_prepared");
  return `https://pay.google.com/gp/v/save/${unsigned}.${signature}`;
}
const passkitSerialIdentity = (serial) => {
  const match = String(serial || "").match(/^youcount-(\d+)$/);
  return match ? Number(match[1]) : null;
};
async function passkitIdentity(db, identityId) {
  const rows = await db.query(
    `SELECT i.id,i.public_id,i.identity_number,i.role_code,i.status,i.created_at,i.connect_eligible,
            w.authentication_token,w.updated_at
     FROM tlc_identities i JOIN wallet_pass_state w ON w.identity_id=i.id
     WHERE i.id=$1`,
    [identityId],
  );
  if (!rows.length) return null;
  return {
    ...rows[0],
    authenticationToken: L.decrypt(rows[0].authentication_token).token,
  };
}
function passkitAuthorised(req, identity) {
  const supplied = String(req.headers.authorization || "").replace(/^ApplePass\s+/i, "");
  return Boolean(supplied && identity && L.safeEqual(supplied, identity.authenticationToken));
}
async function handlePasskit(db, req, res) {
  const pathValue = String(req.query?.path || "").replace(/^\/+|\/+$/g, ""),
    parts = pathValue.split("/").map((value) => decodeURIComponent(value));
  if (req.method === "POST" && parts[0] === "log") return res.status(200).end();
  if (parts[0] === "devices" && parts[2] === "registrations") {
    const deviceLibraryId = parts[1],
      passTypeId = parts[3],
      serial = parts[4];
    if (serial) {
      const identityId = passkitSerialIdentity(serial),
        identity = identityId ? await passkitIdentity(db, identityId) : null;
      if (!identity || passTypeId !== String(process.env.APPLE_PASS_TYPE_ID || "") || !passkitAuthorised(req, identity))
        return res.status(401).end();
      if (req.method === "POST") {
        const pushToken = String(req.body?.pushToken || "").slice(0, 500);
        if (!deviceLibraryId || !pushToken) return res.status(400).end();
        const existing = await db.query(
          `SELECT 1 FROM wallet_registrations
           WHERE device_library_id=$1 AND identity_id=$2 AND pass_type_id=$3`,
          [deviceLibraryId, identityId, passTypeId],
        );
        await db.query(
          `INSERT INTO wallet_devices(device_library_id,push_token,updated_at)
           VALUES($1,$2,now()) ON CONFLICT(device_library_id)
           DO UPDATE SET push_token=excluded.push_token,updated_at=now()`,
          [deviceLibraryId, pushToken],
        );
        await db.query(
          `INSERT INTO wallet_registrations(device_library_id,identity_id,pass_type_id)
           VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
          [deviceLibraryId, identityId, passTypeId],
        );
        return res.status(existing.length ? 200 : 201).end();
      }
      if (req.method === "DELETE") {
        await db.query(
          "DELETE FROM wallet_registrations WHERE device_library_id=$1 AND identity_id=$2 AND pass_type_id=$3",
          [deviceLibraryId, identityId, passTypeId],
        );
        await db.query(
          `DELETE FROM wallet_devices d WHERE d.device_library_id=$1
           AND NOT EXISTS(SELECT 1 FROM wallet_registrations r WHERE r.device_library_id=d.device_library_id)`,
          [deviceLibraryId],
        );
        return res.status(200).end();
      }
    }
    if (req.method === "GET" && passTypeId) {
      const since = Number(req.query?.passesUpdatedSince || 0),
        rows = await db.query(
          `SELECT 'youcount-'||r.identity_id AS serial,
                  (extract(epoch FROM w.updated_at)*1000)::bigint AS update_tag
           FROM wallet_registrations r
           JOIN wallet_pass_state w ON w.identity_id=r.identity_id
           WHERE r.device_library_id=$1 AND r.pass_type_id=$2
             AND (extract(epoch FROM w.updated_at)*1000)::bigint>$3
           ORDER BY w.updated_at`,
          [deviceLibraryId, passTypeId, Number.isFinite(since) ? since : 0],
        );
      if (!rows.length) return res.status(204).end();
      return res.status(200).json({
        lastUpdated: String(rows[rows.length - 1].update_tag),
        serialNumbers: rows.map((row) => row.serial),
      });
    }
  }
  if (req.method === "GET" && parts[0] === "passes") {
    const passTypeId = parts[1],
      identityId = passkitSerialIdentity(parts[2]),
      identity = identityId ? await passkitIdentity(db, identityId) : null;
    if (!identity || passTypeId !== String(process.env.APPLE_PASS_TYPE_ID || "") || !passkitAuthorised(req, identity))
      return res.status(401).end();
    if (!identity.connect_eligible) return res.status(404).end();
    const records = await db.query(
      `SELECT submitted_payload FROM review_records WHERE identity_id=$1
       ORDER BY updated_at DESC,id DESC LIMIT 1`,
      [identityId],
    );
    if (!records.length) return res.status(404).end();
    const changes = L.decrypt(records[0].submitted_payload)?.changes || {},
      buffer = await createApplePass(identity, changes, {
        authenticationToken: identity.authenticationToken,
        updatedAt: identity.updated_at,
      });
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Last-Modified", new Date(identity.updated_at).toUTCString());
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(buffer);
  }
  return res.status(404).end();
}
const namePart = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const normalizedName = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`\-–—]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const compactName = (value) => normalizedName(value).replace(/\s/g, "");
const honorifics = new Set([
  "bro",
  "brother",
  "sis",
  "sister",
  "pastor",
  "pst",
  "reverend",
  "rev",
  "deacon",
  "deaconess",
  "dcns",
  "dr",
  "mr",
  "mrs",
  "miss",
]);
const enteredNameParts = (value) => {
  const parts = normalizedName(value).split(" ").filter(Boolean);
  while (parts.length && honorifics.has(parts[0])) parts.shift();
  return parts;
};
function nameMatches(entered, person) {
  const attributes = person.attributes || {},
    parts = enteredNameParts(entered);
  const enteredCompact = parts.join(""),
    enteredFirst = parts[0] || "",
    enteredSurname = parts.slice(1).join("");
  const firstNames = [
    attributes.first_name,
    attributes.given_name,
    attributes.nickname,
  ]
    .map(normalizedName)
    .filter(Boolean);
  const surname = compactName(attributes.last_name);
  const fullNames = [
    attributes.name,
    ...firstNames.map((first) => `${first} ${attributes.last_name || ""}`),
  ]
    .map(compactName)
    .filter(Boolean);
  const familiarNameMatch = firstNames.some((candidate) => {
    const enteredName = compactName(enteredFirst),
      candidateName = compactName(candidate);
    if (enteredName.length < 3 || candidateName.length < 3) return false;
    if (
      enteredName.includes(candidateName) ||
      candidateName.includes(enteredName)
    )
      return true;
    let sharedPrefix = 0;
    while (
      sharedPrefix < enteredName.length &&
      sharedPrefix < candidateName.length &&
      enteredName[sharedPrefix] === candidateName[sharedPrefix]
    )
      sharedPrefix += 1;
    return sharedPrefix >= 3;
  });
  // Contact evidence and OTP remain the security gates. A correct first name or
  // recognised nickname is enough to create the private candidate set.
  return (
    firstNames.includes(enteredFirst) ||
    familiarNameMatch ||
    fullNames.includes(enteredCompact) ||
    (firstNames.includes(enteredFirst) && surname === enteredSurname)
  );
}
async function findPeopleByName(db, name) {
  const parts = enteredNameParts(name),
    cleaned = parts.join(" "),
    variants = new Set([String(name).trim(), cleaned]);
  if (parts.length > 2) variants.add(`${parts[0]} ${parts.slice(1).join("-")}`);
  if (parts[0]) {
    variants.add(parts[0]);
    // Until the encrypted cache has completed its first refresh, use the same
    // minimum familiar-name prefix against the controlled PC fallback.
    if (parts[0].length >= 3) variants.add(parts[0].slice(0, 3));
  }
  try {
    const cacheState = await db.query(
      `SELECT value FROM pc_sync_state WHERE name='people_cache_ready' LIMIT 1`,
    );
    if (cacheState[0]?.value === L.hash("pc-cache-key-v1")) {
      const fragments = [
          ...new Set(
            parts.flatMap((part) => {
              if (part.length < 3) return [part];
              const values = [];
              for (let start = 0; start <= part.length - 3; start += 1)
                for (let end = start + 3; end <= part.length; end += 1)
                  values.push(part.slice(start, end));
              return values;
            }),
          ),
        ],
        hashes = fragments.map((part) => L.hash(`pc-name:${part}`)),
        rows = hashes.length
          ? await db.query(
              `SELECT profile_payload FROM pc_people_cache
               WHERE active=true AND key_fingerprint=$2 AND name_hashes && $1::text[]
               -- Records sharing the most name fragments with the entered name
               -- come first, so the 500-row cap drops weak partial matches
               -- (any shared three letters) rather than the person searched for.
               ORDER BY (SELECT count(*) FROM unnest(name_hashes) AS h WHERE h = ANY($1::text[])) DESC,
                        source_updated_at DESC NULLS LAST
               LIMIT 500`,
              [hashes, L.hash("pc-cache-key-v1")],
            )
          : [],
        people = rows
          .map((row) => {
            try {
              const cachedProfile = L.decrypt(row.profile_payload);
              return {
                id: cachedProfile.id,
                attributes: cachedProfile.attributes || {},
                emails: cachedProfile.emails || [],
                phones: cachedProfile.phones || [],
                cachedProfile,
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      return people.filter((person) => nameMatches(name, person));
    }
  } catch (error) {
    console.error("Planning Center cache lookup failed", error.message);
  }
  // Initial-deployment fallback only. Once the background cache contains any
  // active records, member searches no longer call Planning Center directly.
  const responses = await Promise.allSettled(
    [...variants].map((query) =>
      L.pcFetch(
        `/people?where[search_name]=${encodeURIComponent(query)}&include=emails,phone_numbers&per_page=100`,
      ),
    ),
  );
  const people = responses.flatMap((result) =>
      result.status === "fulfilled" ? L.contacts(result.value) : [],
    ),
    unique = [...new Map(people.map((person) => [person.id, person])).values()];
  return unique.filter((person) => nameMatches(name, person));
}
const candidateSurname = (person) => person?.attributes?.last_name || "";
function samePersonCluster(people) {
  if (people.length < 2) return true;
  const anchor = people[0],
    anchorFirst = namePart(
      anchor.attributes?.first_name || anchor.attributes?.given_name,
    ),
    anchorLast = candidateSurname(anchor);
  return people.slice(1).every((person) => {
    const first = namePart(
        person.attributes?.first_name || person.attributes?.given_name,
      ),
      last = candidateSurname(person);
    return (
      first === anchorFirst &&
      (!namePart(anchorLast) ||
        !namePart(last) ||
        editDistance(anchorLast, last) <= 2)
    );
  });
}
function rankCandidates(people) {
  return [...people].sort((a, b) => {
    const score = (person) => {
      const attributes = person.attributes || {},
        active =
          String(attributes.status || "").toLowerCase() === "active" &&
          !attributes.inactivated_at
            ? 1
            : 0,
        updated = Date.parse(attributes.updated_at || 0) || 0,
        contacts = (person.emails?.length || 0) + (person.phones?.length || 0);
      return active * 1e15 + updated + contacts * 1e10;
    };
    return score(b) - score(a);
  });
}
function editDistance(a, b) {
  a = namePart(a);
  b = namePart(b);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = old;
    }
  }
  return row[b.length];
}
async function session(db, rawToken) {
  if (!rawToken) return null;
  const rows = await db.query(
    "SELECT * FROM verification_sessions WHERE token_hash=$1 AND expires_at>now() LIMIT 1",
    [L.hash(rawToken)],
  );
  const row = rows[0] || null;
  if (row?.verified_at)
    await db.query(
      "UPDATE verification_sessions SET expires_at=now()+interval '2 hours',updated_at=now() WHERE id=$1",
      [row.id],
    );
  return row;
}
async function sendTwilio(to) {
  const sid = process.env.TWILIO_ACCOUNT_SID,
    auth = process.env.TWILIO_AUTH_TOKEN,
    service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !auth || !service) throw new Error("sms_unavailable");
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, Channel: "sms" }),
    },
  );
  if (!response.ok) throw new Error("sms_failed");
}
async function checkTwilio(to, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID,
    auth = process.env.TWILIO_AUTH_TOKEN,
    service = process.env.TWILIO_VERIFY_SERVICE_SID;
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, Code: code }),
    },
  );
  if (!response.ok) return false;
  const result = await response.json();
  return result.status === "approved";
}
async function planningCenterConnectStatus(db, personId) {
  try {
    const definitions = await db.query(
      `SELECT id,name,slug,tab_name AS "tabName" FROM pc_custom_fields
       WHERE lower(name||' '||tab_name) ~ '(connect|membership course|membership class)'
       ORDER BY CASE
         WHEN slug='completed_connect_track' THEN 0
         WHEN slug='attended_connect_class' THEN 1
         WHEN slug='connect_track_2' THEN 2
         WHEN slug='connect_track_1' THEN 3
         ELSE 4 END,sequence NULLS LAST`,
    );
    if (!definitions.length) return { found: false, completed: false };
    const preferred = definitions[0];
    const cachedRows = await db.query(
      `SELECT profile_payload FROM pc_people_cache
       WHERE planning_center_id=$1 AND active=true AND key_fingerprint=$2 LIMIT 1`,
      [String(personId), L.hash("pc-cache-key-v1")],
    );
    if (cachedRows.length) {
      const cached = L.decrypt(cachedRows[0].profile_payload),
        matching = (cached.fields || []).find((item) =>
          /connect|membership course|membership class/i.test(item.name || ""),
        ),
        value = String(matching?.value ?? "").trim(),
        completed =
          /^(yes|true|completed|complete|done|1)$/i.test(value) ||
          /^\d{4}-\d{2}-\d{2}/.test(value);
      return {
        found: true,
        completed,
        field: matching?.name || preferred.name,
        value,
        source: "encrypted_cache",
      };
    }
    const doc = await L.pcFetch(
      `/people/${encodeURIComponent(personId)}/field_data?include=field_definition&per_page=100`,
    );
    const row = (doc.data || []).find(
      (item) =>
        String(item.relationships?.field_definition?.data?.id || "") ===
        String(preferred.id),
    );
    if (!row)
      return {
        found: true,
        completed: false,
        field: preferred.name,
        value: "",
      };
    const value = String(
      row.attributes?.value ?? row.attributes?.display_value ?? "",
    ).trim();
    const completed =
      /^(yes|true|completed|complete|done|1)$/i.test(value) ||
      /^\d{4}-\d{2}-\d{2}/.test(value);
    return {
      found: true,
      completed,
      field: preferred.name,
      value,
    };
  } catch {
    return { found: false, completed: false };
  }
}

async function connectRegistryStatus(db, person) {
  const identifiers = [];
  if (person?.id)
    identifiers.push(["planning_center_id", L.hash(`connect:pc:${String(person.id).trim()}`)]);
  for (const email of person?.emails || []) {
    const value = L.normalizeEmail(email);
    if (value) identifiers.push(["email", L.hash(`connect:email:${value}`)]);
  }
  for (const phone of person?.phones || []) {
    const value = L.digits(phone);
    if (value) {
      const forms = new Set([value]);
      if (value.startsWith("44") && value.length >= 11) forms.add(`0${value.slice(2)}`);
      if (value.startsWith("0") && value.length >= 10) forms.add(`44${value.slice(1)}`);
      for (const form of forms)
        identifiers.push(["phone", L.hash(`connect:phone:${form}`)]);
    }
  }
  if (!identifiers.length) return null;
  const types = identifiers.map(([type]) => type),
    hashes = identifiers.map(([, value]) => value),
    rows = await db.query(
      `SELECT eligibility,source,connect_date
       FROM connect_eligibility_registry
       WHERE (identifier_type,identifier_hash) IN (
         SELECT * FROM unnest($1::text[],$2::text[])
       )
       ORDER BY CASE eligibility WHEN 'completed' THEN 0 ELSE 1 END
       LIMIT 1`,
      [types, hashes],
    );
  if (!rows.length) return null;
  const exempt = rows[0].eligibility === "ordained_exception";
  return {
    found: true,
    completed: !exempt,
    eligible: true,
    exempt,
    exception: exempt ? "ordained_leader" : null,
    source: rows[0].source,
    value: rows[0].connect_date || "",
  };
}

async function resolvedConnectStatus(db, person) {
  const registry = await connectRegistryStatus(db, person);
  if (registry) return registry;
  const planningCenter = await planningCenterConnectStatus(db, person?.id);
  return {
    ...planningCenter,
    eligible: Boolean(planningCenter.completed),
    exempt: false,
    exception: null,
  };
}
const firstValue = (fields, pattern) => {
  const row = fields.find((item) => pattern.test(item.name));
  return String(row?.value ?? "").trim();
};
const yesNoValue = (value) => {
  if (/^(yes|true|completed|complete|done|1)$/i.test(value)) return "yes";
  if (/^(no|false|not completed|0)$/i.test(value)) return "no";
  return value ? "unsure" : "";
};
function includedByType(doc, type) {
  return (doc?.included || []).filter(
    (item) => String(item.type || "").toLowerCase() === type.toLowerCase(),
  );
}
async function planningCenterProfile(db, person) {
  const id = String(person.id),
    attributes = person.attributes || {};
  if (person.cachedProfile) {
    const cached = person.cachedProfile,
      current = { ...attributes, ...(cached.attributes || {}) },
      address = cached.address || {},
      fields = cached.fields || [],
      birthdate = String(current.birthdate || current.birth_date || ""),
      birth = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate) || [],
      householdPeople = (cached.householdPeople || []).map((item) => {
        const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(
          String(item.birthdate || ""),
        ) || [];
        return {
          name: item.name || "",
          birthDay: date[3] ? String(Number(date[3])) : "",
          birthMonth: date[2] ? String(Number(date[2])) : "",
          birthYear: date[1] || "",
          sameAddress: "yes",
          address: "",
        };
      }),
      baptismValue = firstValue(fields, /bapti[sz](ed|m)/i),
      baptismPlace = firstValue(fields, /bapti[sz].*(church|place|where)/i),
      cachedGroups = await db.query(
        `SELECT g.id,g.name,g.group_type_id AS "typeId",g.group_type_name AS "typeName",
                g.location_label AS location,g.schedule
         FROM pc_person_group_cache m
         JOIN pc_groups g ON g.id=m.group_id AND g.active=true
         WHERE m.person_hash=$1 ORDER BY g.name`,
        [L.hash(`pc-person:${id}`)],
      );
    return {
      firstName: current.first_name || "",
      lastName: current.last_name || "",
      preferredName: current.nickname || "",
      gender: current.gender || "",
      email: cached.emails?.[0] || person.emails?.[0] || "",
      phone: cached.phones?.[0] || person.phones?.[0] || "",
      postcode: address.zip || address.postcode || "",
      addressLine1: [
        address.street_line_1 || address.street || "",
        address.street_line_2 || "",
        address.city || "",
        address.state || "",
        address.country_name || address.country || "",
      ].filter(Boolean).join(", "),
      householdName: cached.householdName || "",
      householdMembers: householdPeople,
      birthDay: birth[3] ? String(Number(birth[3])) : "",
      birthMonth: birth[2] ? String(Number(birth[2])) : "",
      birthYear: birth[1] || "",
      countryOfOrigin: firstValue(fields, /country.*origin|nationality/i),
      regionOfOrigin: firstValue(fields, /(?:region|state).*(?:origin|country)/i),
      countryOfResidence:
        firstValue(fields, /country.*residen|residential country/i) ||
        String(address.country_name || address.country || ""),
      residenceRegion: String(address.state || ""),
      ethnicity: firstValue(fields, /ethnicity|ethnic group/i),
      tlcLocation: firstValue(fields, /tlc location|church location|campus/i),
      membershipStatus: yesNoValue(
        firstValue(fields, /(?:tlc |church )?member(?:ship)?(?: status)?/i),
      ),
      industry: firstValue(fields, /industry|employment sector|profession sector/i),
      employer: firstValue(fields, /employer|organisation|organization|company/i),
      jobRole: firstValue(fields, /job role|job title|occupation|profession/i),
      communicationPreference: firstValue(
        fields,
        /communication.*(?:preference|method)|preferred.*contact/i,
      ),
      consent: firstValue(fields, /communication.*consent|contact consent/i),
      baptised: yesNoValue(baptismValue),
      baptismChurch: baptismPlace,
      baptismYear: firstValue(fields, /bapti[sz].*year/i),
      servingTeams: firstValue(fields, /serving team|team.*serv/i)
        .split(/[,;|]/).map((value) => value.trim()).filter(Boolean),
      otherNames: firstValue(fields, /other name|maiden name|previous name/i),
      maidenName: firstValue(fields, /maiden name|previous surname/i),
      skills: firstValue(fields, /skills|professional skills|talents/i),
      groups: cachedGroups,
      avatar: String(current.avatar || ""),
    };
  }
  const [detailResult, fieldsResult, householdResult, membershipResult] =
    await Promise.allSettled([
      L.pcFetch(
        `/people/${encodeURIComponent(id)}?include=addresses,emails,phone_numbers`,
      ),
      L.pcFetch(
        `/people/${encodeURIComponent(id)}/field_data?include=field_definition&per_page=100`,
      ),
      L.pcFetch(
        `/people/${encodeURIComponent(id)}/households?include=people&per_page=100`,
      ),
      L.pcAppFetch(
        "groups",
        `/people/${encodeURIComponent(id)}/memberships?include=group&per_page=100`,
      ),
    ]);
  const detail =
      detailResult.status === "fulfilled" ? detailResult.value : null,
    personData = detail?.data || {},
    current = { ...attributes, ...(personData.attributes || {}) },
    addresses = includedByType(detail, "Address"),
    primaryAddress =
      addresses.find((item) => item.attributes?.primary) || addresses[0],
    address = primaryAddress?.attributes || {},
    fieldDoc = fieldsResult.status === "fulfilled" ? fieldsResult.value : null,
    definitionNames = new Map(
      includedByType(fieldDoc, "FieldDefinition").map((item) => [
        String(item.id),
        String(item.attributes?.name || item.attributes?.label || ""),
      ]),
    );
  if (!definitionNames.size) {
    const cached = await db.query(
      `SELECT id,name,tab_name AS "tabName" FROM pc_custom_fields`,
    );
    cached.forEach((item) =>
      definitionNames.set(
        String(item.id),
        `${item.tabName || ""} ${item.name || ""}`.trim(),
      ),
    );
  }
  const fields = (fieldDoc?.data || []).map((item) => ({
    name: String(
      definitionNames.get(
        String(item.relationships?.field_definition?.data?.id || ""),
      ) || "",
    ).toLowerCase(),
    value: item.attributes?.value ?? item.attributes?.display_value ?? "",
  }));
  const birthdate = String(current.birthdate || current.birth_date || ""),
    birth = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate) || [],
    groupsDoc =
      membershipResult.status === "fulfilled" ? membershipResult.value : null,
    groupsById = new Map(
      includedByType(groupsDoc, "Group").map((item) => [
        String(item.id),
        item,
      ]),
    ),
    rawGroups = (groupsDoc?.data || [])
      .map((membership) => {
        const groupId = String(
            membership.relationships?.group?.data?.id || "",
          ),
          group = groupsById.get(groupId);
        return groupId
          ? {
              id: groupId,
              name: String(group?.attributes?.name || "Group"),
              typeId: String(
                group?.relationships?.group_type?.data?.id || "",
              ),
              typeName: String(
                group?.attributes?.group_type_name ||
                  group?.attributes?.group_type ||
                  "Group",
              ),
              location: String(group?.attributes?.location || ""),
            }
          : null;
      })
      .filter(Boolean),
    householdDoc =
      householdResult.status === "fulfilled" ? householdResult.value : null,
    householdPeople = includedByType(householdDoc, "Person")
      .filter((item) => String(item.id) !== id)
      .map((item) => {
        const personAttributes = item.attributes || {},
          date = /^(\d{4})-(\d{2})-(\d{2})/.exec(
            String(personAttributes.birthdate || ""),
          ) || [];
        return {
          name: String(
            personAttributes.name ||
              `${personAttributes.first_name || ""} ${personAttributes.last_name || ""}`.trim(),
          ),
          birthDay: date[3] ? String(Number(date[3])) : "",
          birthMonth: date[2] ? String(Number(date[2])) : "",
          birthYear: date[1] || "",
          sameAddress: "yes",
          address: "",
        };
      });
  // Planning Center membership includes do not consistently contain group type
  // or location attributes. Enrich them from the daily local catalogue so an
  // existing membership is displayed and can be selected like a search result.
  let groups = rawGroups;
  if (rawGroups.length) {
    try {
      const cachedGroups = await db.query(
          `SELECT id,name,group_type_id AS "typeId",group_type_name AS "typeName",location_label AS location,schedule
           FROM pc_groups WHERE id=ANY($1::text[])`,
          [rawGroups.map((group) => group.id)],
        ),
        cachedById = new Map(
          cachedGroups.map((group) => [String(group.id), group]),
        );
      groups = rawGroups.map((group) => ({
        ...group,
        ...(cachedById.get(group.id) || {}),
        id: group.id,
        name: displayGroupName(
          cachedById.get(group.id)?.name || group.name,
        ),
      }));
    } catch {}
  }
  groups = groups.map((group) => ({
    ...group,
    name: displayGroupName(group.name),
  }));
  const baptismValue = firstValue(fields, /bapti[sz](ed|m)/i),
    baptismPlace = firstValue(fields, /bapti[sz].*(church|place|where)/i),
    profile = {
      firstName: current.first_name || "",
      lastName: current.last_name || "",
      preferredName: current.nickname || "",
      gender: current.gender || "",
      email: person.emails[0] || "",
      phone: person.phones[0] || "",
      postcode: address.zip || address.postcode || "",
      addressLine1: [
        address.street_line_1 || address.street || "",
        address.street_line_2 || "",
        address.city || "",
        address.state || "",
        address.country || "",
      ]
        .filter(Boolean)
        .join(", "),
      householdName: String(householdDoc?.data?.[0]?.attributes?.name || ""),
      householdMembers: householdPeople,
      birthDay: birth[3] ? String(Number(birth[3])) : "",
      birthMonth: birth[2] ? String(Number(birth[2])) : "",
      birthYear: birth[1] || "",
      countryOfOrigin: firstValue(fields, /country.*origin|nationality/i),
      regionOfOrigin: firstValue(fields, /(?:region|state).*(?:origin|country)/i),
      countryOfResidence:
        firstValue(fields, /country.*residen|residential country/i) ||
        String(address.country || ""),
      residenceRegion: String(address.state || ""),
      ethnicity: firstValue(fields, /ethnicity|ethnic group/i),
      tlcLocation: firstValue(fields, /tlc location|church location|campus/i),
      membershipStatus: yesNoValue(
        firstValue(fields, /(?:tlc |church )?member(?:ship)?(?: status)?/i),
      ),
      industry: firstValue(fields, /industry|employment sector|profession sector/i),
      employer: firstValue(fields, /employer|organisation|organization|company/i),
      jobRole: firstValue(fields, /job role|job title|occupation|profession/i),
      communicationPreference: firstValue(
        fields,
        /communication.*(?:preference|method)|preferred.*contact/i,
      ),
      consent: firstValue(fields, /communication.*consent|contact consent/i),
      baptised: yesNoValue(baptismValue),
      baptismChurch: baptismPlace,
      baptismYear: firstValue(fields, /bapti[sz].*year/i),
      servingTeams: firstValue(fields, /serving team|team.*serv/i)
        .split(/[,;|]/)
        .map((value) => value.trim())
        .filter(Boolean),
      otherNames: firstValue(fields, /other name|maiden name|previous name/i),
      maidenName: firstValue(fields, /maiden name|previous surname/i),
      skills: firstValue(fields, /skills|professional skills|talents/i),
      groups,
      avatar: String(current.avatar || ""),
    };
  return profile;
}
async function planningCenterAvatarData(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url),
      allowed = [
        "planningcenteronline.com",
        "pcoservices.com",
        "cloudfront.net",
        "amazonaws.com",
      ];
    if (!allowed.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)))
      return "";
    const response = await fetch(parsed, { signal: AbortSignal.timeout(5000) });
    const type = String(response.headers.get("content-type") || "");
    if (!response.ok || !type.startsWith("image/")) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 3000000) return "";
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}
async function submittedPhotoData(photo) {
  const pathname = String(photo?.pathname || "");
  if (pathname.startsWith("member-photos/")) {
    try {
      const result = await getPrivateBlob(pathname, { access: "private" });
      if (!result || result.statusCode !== 200 || result.blob.size > 3000000)
        return "";
      const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
      const type = String(result.blob.contentType || "image/jpeg");
      return bytes.length && type.startsWith("image/")
        ? `data:${type};base64,${bytes.toString("base64")}`
        : "";
    } catch {
      return "";
    }
  }
  return planningCenterAvatarData(String(photo?.url || ""));
}
async function ensureIdentity(db, people, connect) {
  const pcIds = [
    ...new Set(people.map((person) => String(person.id)).filter(Boolean)),
  ];
  if (!pcIds.length) return null;
  const found = await db.query(
    "SELECT DISTINCT identity_id FROM tlc_identity_profiles WHERE planning_center_id=ANY($1::text[]) ORDER BY identity_id",
    [pcIds],
  );
  let identityId = found[0]?.identity_id;
  if (!identityId) {
    const made = await db.query(
      "INSERT INTO tlc_identities(status,connect_completed,connect_eligible,connect_source,connect_exception) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [
        connect.eligible ? "full" : "provisional",
        Boolean(connect.completed),
        Boolean(connect.eligible),
        connect.source || (connect.found ? "planning_center" : "unconfirmed"),
        connect.exception || null,
      ],
    );
    identityId = made[0].id;
    await L.setIdentityPublicId(db, identityId, {
      eligible: Boolean(connect.eligible),
      exception: connect.exception || null,
    });
  }
  for (const duplicate of found.slice(1)) {
    await db.query(
      "UPDATE tlc_identity_profiles SET identity_id=$1 WHERE identity_id=$2",
      [identityId, duplicate.identity_id],
    );
    await db.query("DELETE FROM tlc_identities WHERE id=$1", [
      duplicate.identity_id,
    ]);
  }
  for (const pcId of pcIds)
    await db.query(
      "INSERT INTO tlc_identity_profiles(identity_id,planning_center_id) VALUES($1,$2) ON CONFLICT(planning_center_id) DO UPDATE SET identity_id=excluded.identity_id",
      [identityId, pcId],
    );
  const approvedRoles = await db.query(
      `SELECT role_code FROM youcount_role_registry
       WHERE active=true AND planning_center_id=ANY($1::text[])
       ORDER BY CASE role_code
         WHEN 'OP' THEN 1 WHEN 'OM' THEN 2 WHEN 'OA' THEN 3 WHEN 'OD' THEN 4
         WHEN 'OC' THEN 5 WHEN 'TL' THEN 6 WHEN 'SG' THEN 7 WHEN 'TM' THEN 8
         ELSE 99 END LIMIT 1`,
      [pcIds],
    ),
    approvedRole = approvedRoles[0]?.role_code || null,
    ordainedException = ["OP", "OM", "OA"].includes(approvedRole),
    effectiveConnect = ordainedException
      ? {
          eligible: true,
          completed: Boolean(connect.completed),
          source: "approved_role_lookup",
          exception: "ordained_role",
        }
      : connect;
  if (effectiveConnect.eligible)
    await db.query(
      `UPDATE tlc_identities
       SET connect_completed=$1,connect_eligible=true,status='full',connect_source=$2,
           connect_exception=$3,updated_at=now()
       WHERE id=$4`,
      [
        Boolean(effectiveConnect.completed),
        effectiveConnect.source || "planning_center",
        effectiveConnect.exception || null,
        identityId,
      ],
    );
  if (approvedRole)
    await L.setIdentityPublicId(db, identityId, {
      roleCode: approvedRole,
      source: "approved_role_lookup",
    });
  else if (effectiveConnect.eligible)
    await L.setIdentityPublicId(db, identityId, {
      eligible: true,
      exception: effectiveConnect.exception || null,
    });
  const rows = await db.query(
    "SELECT id,public_id,identity_number,role_code,status,connect_completed,connect_eligible,connect_source,connect_exception FROM tlc_identities WHERE id=$1",
    [identityId],
  );
  return rows[0] || null;
}
module.exports = async function handler(req, res) {
  if (typeof req.body === "string")
    req.body = Object.fromEntries(new URLSearchParams(req.body));
  const requestedAction = String(req.body?.action || req.query?.action || "");
  const passkitRequest = requestedAction === "passkit";
  if (
    !passkitRequest &&
    req.method !== "POST" &&
    !(req.method === "GET" && requestedAction === "emailApplePass")
  )
    return L.json(res, 405, { ok: false });
  try {
    const db = await L.initDb(),
      action = requestedAction,
      ipHash = L.hash(L.clientIp(req));
    // This is an emergency network ceiling, not a per-member allowance.
    // Individual browsers and verified sessions have tighter limits below so
    // a congregation sharing church Wi-Fi is not treated as one person.
    // Presence pings arrive every 30 seconds from every open journey and have
    // their own per-journey limit, so they do not count toward this ceiling.
    if (
      action !== "presence" &&
      !(await L.consumeRate(db, "request_network", ipHash, 30000, 15))
    )
      return L.json(res, 429, {
        ok: false,
        message: "Please wait before trying again.",
      });
    if (action === "passkit") return handlePasskit(db, req, res);
    if (action === "emailApplePass") {
      let signed;
      try {
        signed = L.decrypt(String(req.query?.token || ""));
      } catch {
        return L.json(res, 403, { ok: false, message: "This Wallet link is invalid." });
      }
      const identityId = Number(signed?.identityId),
        expiresAt = Number(signed?.expiresAt);
      if (!Number.isSafeInteger(identityId) || identityId < 1 || !expiresAt || expiresAt < Date.now())
        return L.json(res, 403, { ok: false, message: "This Wallet link has expired. Request a new email from YouCount." });
      if (!(await L.consumeRate(db, "email_apple_pass", L.hash(`identity:${identityId}:${req.query.token}`), 10, 60)))
        return L.json(res, 429, { ok: false, message: "Please wait before opening the pass again." });
      const records = await db.query(
        `SELECT r.submitted_payload,r.kind,i.id,i.public_id,i.identity_number,i.role_code,i.status,i.created_at,i.connect_eligible
         FROM review_records r
         JOIN tlc_identities i ON i.id=r.identity_id
         WHERE i.id=$1
         ORDER BY r.updated_at DESC,r.id DESC LIMIT 1`,
        [identityId],
      );
      const record = records[0];
      if (!record || record.kind === "manual_review" || !record.connect_eligible)
        return L.json(res, 403, { ok: false, message: "This YouCount Card is not currently available." });
      try {
        const changes = L.decrypt(record.submitted_payload)?.changes || {},
          passState = await ensureApplePassState(db, record.id),
          buffer = await createApplePass(record, changes, passState),
          filename = String(record.public_id || "YouCount")
            .replace(/[^a-zA-Z0-9_-]/g, "-")
            .slice(0, 60);
        res.setHeader("Content-Type", "application/vnd.apple.pkpass");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.pkpass"`);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).send(buffer);
      } catch (error) {
        console.error("Email Apple pass generation failed", error.message);
        return L.json(res, 500, { ok: false, message: "The Apple Wallet card could not be created. Please try again." });
      }
    }
    if (action === "addressLookup")
      try {
        return await addressLookup(db, req, res, ipHash);
      } catch (error) {
        console.error("Address lookup failed", error.message);
        return L.json(res, 503, {
          ok: false,
          message:
            "Address lookup is unavailable. Enter the address manually.",
        });
      }
    if (action === "presence") {
      const journeyId = String(req.body?.journeyId || "").slice(0, 100),
        journeyHash = L.hash(`journey:${journeyId}`),
        allowedStages = new Set([
          "welcome", "journey_choice", "name_search", "contact_match",
          "otp_waiting", "otp_entry", "identity_check", "form_identity",
          "form_home", "form_church", "review", "complete",
        ]),
        allowedTypes = new Set(["member", "attendee", "visitor", "unknown"]),
        allowedStatuses = new Set(["active", "completed", "closed"]),
        stage = String(req.body?.stage || ""),
        stageLabel = String(req.body?.stageLabel || "").trim().slice(0, 80),
        journeyType = allowedTypes.has(String(req.body?.journeyType))
          ? String(req.body.journeyType)
          : "unknown",
        status = allowedStatuses.has(String(req.body?.status))
          ? String(req.body.status)
          : "active",
        blocker = String(req.body?.blocker || "").trim().slice(0, 120) || null,
        formPage = [1, 2, 3].includes(Number(req.body?.formPage))
          ? Number(req.body.formPage)
          : null;
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(journeyId) || !allowedStages.has(stage) || !stageLabel)
        return L.json(res, 400, { ok: false });
      if (!(await L.consumeRate(db, "journey_presence", journeyHash, 180, 15)))
        return L.json(res, 429, { ok: false });
      let sessionId = null;
      const suppliedToken = String(req.body?.session || "");
      if (suppliedToken) {
        const sessionRows = await db.query(
          "SELECT id FROM verification_sessions WHERE token_hash=$1 AND expires_at>now() LIMIT 1",
          [L.hash(suppliedToken)],
        );
        sessionId = sessionRows[0]?.id || null;
      }
      await db.query(
        `INSERT INTO journey_presence(
          journey_hash,session_id,journey_type,stage,stage_label,form_page,status,blocker,
          completed_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7='completed' THEN now() ELSE NULL END)
        ON CONFLICT(journey_hash) DO UPDATE SET
          session_id=COALESCE(excluded.session_id,journey_presence.session_id),
          journey_type=excluded.journey_type,
          stage_entered_at=CASE WHEN journey_presence.stage<>excluded.stage THEN now() ELSE journey_presence.stage_entered_at END,
          stage=excluded.stage,stage_label=excluded.stage_label,form_page=excluded.form_page,
          status=excluded.status,blocker=excluded.blocker,last_seen_at=now(),
          completed_at=CASE WHEN excluded.status='completed' THEN COALESCE(journey_presence.completed_at,now()) ELSE journey_presence.completed_at END`,
        [journeyHash, sessionId, journeyType, stage, stageLabel, formPage, status, blocker],
      );
      return L.json(res, 200, { ok: true });
    }
    if (action === "start") {
      const name = String(req.body?.name || "")
        .trim()
        .slice(0, 120);
      if (name.length < 2) return L.json(res, 400, { ok: false });
      const browserId = String(req.body?.browserId || "").slice(0, 100);
      const validBrowserId = /^[a-zA-Z0-9_-]{16,100}$/.test(browserId);
      if (!validBrowserId)
        return L.json(res, 400, {
          ok: false,
          message: "Please refresh the page and try again.",
        });
      if (
        !(await L.consumeRate(
          db,
          "name_search_browser",
          L.hash(`browser:${browserId}`),
          5,
          15,
        ))
      )
        return L.json(res, 429, {
          ok: false,
          message: "Please wait before trying another search.",
        });
      if (!(await L.consumeRate(db, "name_search_network", ipHash, 5000, 15)))
        return L.json(res, 429, {
          ok: false,
          message:
            "There are unusually many searches from this network. Please wait and try again.",
        });
      let people = [];
      try {
        people = await findPeopleByName(db, name);
      } catch {}
      const raw = L.token(),
        payload = { name, people };
      const rows = await db.query(
        "INSERT INTO verification_sessions(token_hash,ip_hash,payload,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes') RETURNING id",
        [L.hash(raw), ipHash, L.encrypt(payload)],
      );
      await L.audit(
        db,
        rows[0].id,
        ipHash,
        "name_submitted",
        { name },
        people.length ? "possible_match" : "no_match",
      );
      await sleep(350);
      return L.json(res, 200, { ...generic, session: raw });
    }
    const s = await session(db, req.body?.session);
    if (!s)
      return L.json(res, 400, {
        ok: false,
        message: "Your secure session has expired. Your form is saved on this phone; please verify again to submit it.",
      });
    if (
      !(await L.consumeRate(
        db,
        "member_session_request",
        L.hash(`member-session:${s.id}`),
        120,
        15,
      ))
    )
      return L.json(res, 429, {
        ok: false,
        message: "Please wait before continuing.",
      });
    // Mobile phones commonly move between Wi-Fi and cellular data while a text
    // code is being entered. The random session token, contact evidence, OTP,
    // attempt limits and expiry remain the security controls; IP is risk/audit
    // context and must not invalidate an otherwise valid verification session.
    if (s.ip_hash !== ipHash) {
      await db.query(
        "UPDATE verification_sessions SET ip_hash=$1,expires_at=now()+interval '2 hours',updated_at=now() WHERE id=$2",
        [ipHash, s.id],
      );
      await L.audit(
        db,
        s.id,
        ipHash,
        s.verified_at
          ? "verified_session_network_changed"
          : "verification_session_network_changed",
        null,
        "continued",
      );
    }
    if (action === "manualRoute") {
      const payload = L.decrypt(s.payload);
      payload.manualReviewAllowed = true;
      payload.manualReviewKind =
        req.body?.kind === "visitor" ? "visitor" : "changed_details";
      await db.query(
        "UPDATE verification_sessions SET payload=$1,expires_at=now()+interval '2 hours',updated_at=now() WHERE id=$2",
        [L.encrypt(payload), s.id],
      );
      await L.audit(
        db,
        s.id,
        ipHash,
        "manual_review_route_opened",
        null,
        payload.manualReviewKind,
      );
      return L.json(res, 200, { ok: true });
    }
    if (s.locked_until && new Date(s.locked_until) > new Date())
      return L.json(res, 429, {
        ok: false,
        message: "Please wait before trying again.",
      });
    if (action === "evidence") {
      if (s.verified_at)
        return L.json(res, 409, {
          ok: false,
          message: "This session is already verified. Please start again to use different details.",
        });
      const email = L.normalizeEmail(req.body?.email),
        last3 = L.digits(req.body?.last3).slice(-3);
      const payload = L.decrypt(s.payload);
      const matched = rankCandidates(
        payload.people.filter(
          (p) =>
            p.emails.some((x) => L.normalizeEmail(x) === email) &&
            p.phones.some((x) => L.digits(x).endsWith(last3)),
        ),
      );
      const matchedPhone = matched[0]?.phones.find((phone) =>
        L.digits(phone).endsWith(last3),
      );
      payload.matchedPhone = matchedPhone || null;
      payload.clusterMode =
        matched.length > 1
          ? samePersonCluster(matched)
            ? "probable_duplicate"
            : "shared_contact"
          : matched.length === 1
            ? "single"
            : "none";
      await db.query(
        "UPDATE verification_sessions SET payload=$1,matched_payload=$2,updated_at=now() WHERE id=$3",
        [L.encrypt(payload), L.encrypt(matched), s.id],
      );
      await L.audit(
        db,
        s.id,
        ipHash,
        "contact_evidence",
        { email, last3 },
        matched.length ? payload.clusterMode : "no_match",
      );
      await sleep(350);
      return L.json(res, 200, {
        ...generic,
        testProfile: isTestProfile(matched[0]),
        verificationAvailable: Boolean(matched.length && matchedPhone),
        delivery: { sms: Boolean(process.env.TWILIO_VERIFY_SERVICE_SID) },
      });
    }
    if (action === "send") {
      const claimed = await db.query(
        "UPDATE verification_sessions SET sends=sends+1,delivery='sms',updated_at=now() WHERE id=$1 AND sends<3 RETURNING sends",
        [s.id],
      );
      if (!claimed.length)
        return L.json(res, 429, {
          ok: false,
          message: "Please wait before requesting another code.",
        });
      const matched = s.matched_payload ? L.decrypt(s.matched_payload) : [];
      const person = matched[0],
        payload = L.decrypt(s.payload),
        otpPhone = payload.matchedPhone;
      let delivered = false;
      try {
        if (person && otpPhone) {
          await sendTwilio(otpPhone);
          delivered = true;
        }
      } catch {}
      await L.audit(
        db,
        s.id,
        ipHash,
        "otp_requested",
        { method: "sms" },
        delivered ? "sent" : "not_sent",
      );
      await sleep(500);
      return L.json(res, 200, generic);
    }
    if (action === "verify") {
      const code = String(req.body?.code || "")
          .replace(/\D/g, "")
          .slice(0, 6),
        sessionPayload = L.decrypt(s.payload);
      const matched = s.matched_payload ? L.decrypt(s.matched_payload) : [];
      const person = matched[0],
        otpPhone = sessionPayload.matchedPhone;
      const testProfile =
        Boolean(req.body?.testProfile) && isTestProfile(person);
      let approved = testProfile;
      try {
        if (!testProfile && person && code.length === 6 && otpPhone)
          approved = await checkTwilio(otpPhone, code);
      } catch {}
      const attemptRows = await db.query(
        // Failures count afresh once an earlier lock has expired, and the WHERE
        // clause refuses a session another request locked after the check above.
        "UPDATE verification_sessions SET attempts=CASE WHEN $2 THEN attempts ELSE (CASE WHEN locked_until<=now() THEN 0 ELSE attempts END)+1 END,verified_at=CASE WHEN $2 THEN now() ELSE verified_at END,expires_at=CASE WHEN $2 THEN now()+interval '2 hours' ELSE expires_at END,locked_until=CASE WHEN NOT $2 AND (CASE WHEN locked_until<=now() THEN 0 ELSE attempts END)+1>=3 THEN now()+interval '30 minutes' WHEN locked_until<=now() THEN NULL ELSE locked_until END,updated_at=now() WHERE id=$1 AND (locked_until IS NULL OR locked_until<=now()) RETURNING attempts,locked_until",
        [s.id, approved],
      );
      if (!attemptRows.length)
        return L.json(res, 429, {
          ok: false,
          locked: true,
          message: "This session is temporarily locked.",
        });
      const attempts = Number(attemptRows[0]?.attempts || 0),
        locked = !approved && Boolean(attemptRows[0]?.locked_until);
      await L.audit(
        db,
        s.id,
        ipHash,
        approved
          ? testProfile
            ? "test_profile_verified"
            : "otp_verified"
          : locked
            ? "locked"
            : "otp_failed",
        null,
        approved ? "approved" : "rejected",
      );
      if (!approved)
        return L.json(res, 200, {
          ok: false,
          locked,
          remaining: Math.max(0, 3 - attempts),
          message: locked
            ? "This session is temporarily locked."
            : "We couldn’t verify that code.",
        });
      if (sessionPayload.clusterMode === "shared_contact") {
        await L.audit(
          db,
          s.id,
          ipHash,
          "shared_contact_escalated",
          null,
          "manual_review_required",
        );
        return L.json(res, 200, {
          ok: true,
          manualReview: true,
          reason: "shared_contact",
        });
      }
      const a = person.attributes;
      let internalCandidates = [];
      try {
        const first = a.first_name || "";
        if (first) {
          const related = await findPeopleByName(db, first);
          internalCandidates = related
            .filter(
              (candidate) =>
                candidate.id !== person.id &&
                namePart(candidate.attributes?.first_name) ===
                  namePart(first) &&
                editDistance(candidate.attributes?.last_name, a.last_name) <=
                  2 &&
                candidate.emails.length === 0 &&
                candidate.phones.length === 0,
            )
            .slice(0, 5);
        }
      } catch {}
      const combined = [
        ...matched,
        ...internalCandidates.filter(
          (candidate) =>
            !matched.some((existing) => existing.id === candidate.id),
        ),
      ];
      if (combined.length !== matched.length)
        await db.query(
          "UPDATE verification_sessions SET matched_payload=$1,updated_at=now() WHERE id=$2",
          [L.encrypt(combined), s.id],
        );
      if (internalCandidates.length)
        await L.audit(
          db,
          s.id,
          ipHash,
          "possible_contactless_duplicate",
          null,
          `${internalCandidates.length}_flagged_for_internal_review`,
        );
      const duplicateCandidates = matched.slice(1).map((candidate) => {
        const ca = candidate.attributes || {};
        return {
          id: candidate.id,
          name: `${ca.first_name || ""} ${ca.last_name || ""}`.trim(),
          status: ca.status || "unknown",
          updatedAt: ca.updated_at || null,
        };
      });
      const subjectHash = L.hash(`member:${person.id}`);
      const pendingRows = await db.query(
        "SELECT submitted_payload FROM review_records WHERE active_subject_hash=$1 AND status IN ('pending','follow_up') LIMIT 1",
        [subjectHash],
      );
      const pendingSubmission = pendingRows[0]
        ? L.decrypt(pendingRows[0].submitted_payload)?.changes || null
        : null;
      const latestSubmissionRows = await db.query(
        `SELECT submitted_payload FROM review_records
         WHERE active_subject_hash=$1
         ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT 1`,
        [subjectHash],
      );
      const latestSubmittedPhoto = latestSubmissionRows[0]
        ? L.decrypt(latestSubmissionRows[0].submitted_payload)?.changes?.photo
        : null;
      const connect = await resolvedConnectStatus(db, person);
      sessionPayload.connectStatus = connect;
      await db.query(
        "UPDATE verification_sessions SET payload=$1,updated_at=now() WHERE id=$2",
        [L.encrypt(sessionPayload), s.id],
      );
      let existingProfile = {};
      try {
        existingProfile = await planningCenterProfile(db, person);
      } catch (error) {
        console.error("Planning Center profile prefill failed", error.message);
      }
      const submittedPhoto = await submittedPhotoData(latestSubmittedPhoto);
      const existingPhoto = submittedPhoto || (existingProfile.avatar
        ? await planningCenterAvatarData(existingProfile.avatar)
        : "");
      sessionPayload.planningCenterAvatar = String(existingProfile.avatar || "").slice(0, 2000);
      await db.query(
        "UPDATE verification_sessions SET payload=$1,updated_at=now() WHERE id=$2",
        [L.encrypt(sessionPayload), s.id],
      );
      delete existingProfile.avatar;
      return L.json(res, 200, {
        ok: true,
        pendingSubmission,
        existingPhoto,
        profile: {
          ...existingProfile,
          firstName: a.first_name || "",
          lastName: a.last_name || "",
          preferredName: a.nickname || "",
          gender: a.gender || "",
          email: person.emails[0] || "",
          phone: person.phones[0] || "",
          department: "",
          memberStatus: a.status || "Active",
          connectCompleted: connect.completed ? "yes" : "",
          possibleDuplicateIds: combined.slice(1).map((x) => x.id),
          duplicateCandidates,
          internalReviewCount: internalCandidates.length,
          connect,
        },
      });
    }
    if (action === "photo") {
      if (!s.verified_at && !req.body?.manual)
        return L.json(res, 403, { ok: false });
      if (
        !(await L.consumeRate(
          db,
          "photo_upload",
          L.hash(`session:${s.id}`),
          3,
          120,
        ))
      )
        return L.json(res, 429, {
          ok: false,
          message: "Photo upload limit reached.",
        });
      const match =
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
          String(req.body?.data || ""),
        );
      if (!match)
        return L.json(res, 400, {
          ok: false,
          message: "Please choose a JPEG, PNG or WebP image.",
        });
      const body = Buffer.from(match[2], "base64");
      if (body.length > 2500000)
        return L.json(res, 413, {
          ok: false,
          message: "Please choose a smaller photo.",
        });
      const { put, del } = require("@vercel/blob"),
        payload = L.decrypt(s.payload),
        previous = String(req.body?.previous || "");
      const allowed = Array.isArray(payload.uploadedPhotos)
        ? payload.uploadedPhotos
        : [];
      if (previous && allowed.includes(previous)) {
        try {
          await del(previous);
        } catch {}
      }
      const ext = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        }[match[1]],
        pathname = `member-photos/${L.token()}.${ext}`;
      await put(pathname, body, {
        access: "private",
        contentType: match[1],
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
      });
      payload.uploadedPhotos = [pathname];
      await db.query(
        "UPDATE verification_sessions SET payload=$1,updated_at=now() WHERE id=$2",
        [L.encrypt(payload), s.id],
      );
      await L.audit(db, s.id, ipHash, "photo_uploaded", null, "stored_private");
      return L.json(res, 200, {
        ok: true,
        photo: {
          pathname,
          name: String(req.body?.name || "Member photo").slice(0, 120),
          contentType: match[1],
        },
      });
    }
    if (action === "photoRemove") {
      const payload = L.decrypt(s.payload),
        pathname = String(req.body?.pathname || ""),
        allowed = Array.isArray(payload.uploadedPhotos)
          ? payload.uploadedPhotos
          : [];
      if (allowed.includes(pathname)) {
        const { del } = require("@vercel/blob");
        try {
          await del(pathname);
        } catch {}
        payload.uploadedPhotos = allowed.filter((item) => item !== pathname);
        await db.query(
          "UPDATE verification_sessions SET payload=$1,updated_at=now() WHERE id=$2",
          [L.encrypt(payload), s.id],
        );
        await L.audit(
          db,
          s.id,
          ipHash,
          "photo_removed",
          null,
          "deleted_private",
        );
      }
      return L.json(res, 200, { ok: true });
    }
    if (action === "groupTypes") {
      const payload = L.decrypt(s.payload),
        manualCatalogue = !s.verified_at && payload.manualReviewAllowed;
      if (!s.verified_at && !manualCatalogue)
        return L.json(res, 403, { ok: false });
      const types = await db.query(
        `SELECT t.id,t.name,count(g.id)::int AS "groupCount"
         FROM pc_group_types t
         JOIN pc_groups g ON g.group_type_id=t.id AND g.active=true
         WHERE t.id=ANY($1::text[])
         GROUP BY t.id,t.name,t.position
         ORDER BY t.position NULLS LAST,t.name`,
        [SELECTABLE_GROUP_TYPE_IDS],
      );
      return L.json(res, 200, { ok: true, types });
    }
    if (action === "nigeriaLgas") {
      if (!s.verified_at) return L.json(res, 403, { ok: false });
      const stateName = String(req.body?.state || "").trim().slice(0, 80),
        { getLocalGovernments } = require("@eh1z/nigerian-locations");
      const lookupName = stateName === "Federal Capital Territory" ? "Abuja" : stateName === "Katsina" ? "Kastina" : stateName;
      return L.json(res, 200, {
        ok: true,
        lgas: getLocalGovernments(lookupName).map(String).sort((a, b) => a.localeCompare(b)),
      });
    }
    if (action === "groups") {
      const payload = L.decrypt(s.payload),
        manualCatalogue = !s.verified_at && payload.manualReviewAllowed;
      if (!s.verified_at && !manualCatalogue)
        return L.json(res, 403, { ok: false });
      if (
        !(await L.consumeRate(
          db,
          "group_search_session",
          L.hash(`group-session:${s.id}`),
          40,
          15,
        ))
      )
        return L.json(res, 429, {
          ok: false,
          message: "Please wait before searching again.",
        });
      const rawQuery = String(req.body?.query || "")
          .trim()
          .toLowerCase()
          .slice(0, 80),
        query =
          rawQuery.length >= 3 && "sounds of liberty".startsWith(rawQuery)
            ? "sol"
            : rawQuery,
        requestedTypeIds = [
          ...new Set(
            (Array.isArray(req.body?.typeIds)
              ? req.body.typeIds
              : [req.body?.typeId]
            )
              .map((value) => String(value || "").slice(0, 80))
              .filter(Boolean),
          ),
        ],
        typeIds = requestedTypeIds.filter((id) =>
          SELECTABLE_GROUP_TYPE_IDS.includes(id),
        );
      if (!typeIds.length || (manualCatalogue && query.length < 2))
        return L.json(res, 200, { ok: true, groups: [] });
      const groups = await db.query(
        `SELECT id,name,"group_type_id" AS "typeId",group_type_name AS "typeName",
                CASE WHEN $3::boolean THEN 'Location withheld until review' ELSE location_label END AS location,
                CASE WHEN $3::boolean THEN '' ELSE schedule END AS schedule
         FROM pc_groups
         WHERE active=true AND group_type_id=ANY($1::text[])
           AND ($2='' OR search_text ILIKE '%'||$2||'%')
         ORDER BY name LIMIT 30`,
        [typeIds, query, manualCatalogue],
      );
      return L.json(res, 200, {
        ok: true,
        groups: groups.map((group) => ({
          ...group,
          name: displayGroupName(group.name),
        })),
      });
    }
    if (action === "applePass") {
      if (!s.verified_at) return L.json(res, 403, { ok: false });
      if (
        !(await L.consumeRate(
          db,
          "apple_pass",
          L.hash(`session:${s.id}`),
          3,
          60,
        ))
      )
        return L.json(res, 429, {
          ok: false,
          message: "Please wait before requesting another pass.",
        });
      const rows = await db.query(
        `SELECT r.submitted_payload,r.kind,i.id,i.public_id,i.identity_number,i.role_code,i.status,i.created_at,i.connect_eligible
         FROM review_records r
         JOIN tlc_identities i ON i.id=r.identity_id
         WHERE r.session_id=$1
         ORDER BY r.updated_at DESC,r.id DESC LIMIT 1`,
        [s.id],
      );
      if (!rows.length)
        return L.json(res, 404, {
          ok: false,
          message: "Please submit your profile before requesting the pass.",
        });
      if (rows[0].kind === "manual_review")
        return L.json(res, 403, {
          ok: false,
          message: "Your YouCount Card will be available after the data team confirms your identity.",
        });
      if (!rows[0].connect_eligible)
        return L.json(res, 403, {
          ok: false,
          message: "Your YouCount Card becomes available after you complete Connect.",
        });
      try {
        const changes = L.decrypt(rows[0].submitted_payload)?.changes || {};
        const passState = await ensureApplePassState(db, rows[0].id),
          buffer = await createApplePass(rows[0], changes, passState);
        await L.audit(
          db,
          s.id,
          ipHash,
          "apple_wallet_pass",
          { publicId: rows[0].public_id },
          "issued",
        );
        const filename = String(rows[0].public_id || "TLC-member")
          .replace(/[^a-zA-Z0-9_-]/g, "-")
          .slice(0, 60);
        res.setHeader("Content-Type", "application/vnd.apple.pkpass");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}.pkpass"`,
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).send(buffer);
      } catch (error) {
        console.error("Apple pass generation failed", error.message);
        return L.json(res, 500, {
          ok: false,
          message: "The Apple Wallet card could not be created yet.",
        });
      }
    }
    if (action === "googleWallet") {
      if (!s.verified_at) return L.json(res, 403, { ok: false });
      if (!googleWalletConfig())
        return L.json(res, 503, {
          ok: false,
          message: "Google Wallet is being configured. Please use Apple Wallet or try again later.",
        });
      if (
        !(await L.consumeRate(
          db,
          "google_wallet",
          L.hash(`session:${s.id}`),
          5,
          60,
        ))
      )
        return L.json(res, 429, {
          ok: false,
          message: "Please wait before requesting another pass.",
        });
      const rows = await db.query(
        `SELECT r.submitted_payload,r.kind,i.id,i.public_id,i.identity_number,i.role_code,i.status,i.created_at,i.connect_eligible
         FROM review_records r
         JOIN tlc_identities i ON i.id=r.identity_id
         WHERE r.session_id=$1
         ORDER BY r.updated_at DESC,r.id DESC LIMIT 1`,
        [s.id],
      );
      if (!rows.length)
        return L.json(res, 404, {
          ok: false,
          message: "Please submit your profile before requesting the pass.",
        });
      if (rows[0].kind === "manual_review")
        return L.json(res, 403, {
          ok: false,
          message: "Your YouCount Card will be available after the data team confirms your identity.",
        });
      if (!rows[0].connect_eligible)
        return L.json(res, 403, {
          ok: false,
          message: "Your YouCount Card becomes available after you complete Connect.",
        });
      try {
        const changes = L.decrypt(rows[0].submitted_payload)?.changes || {},
          link = await googleWalletLink(rows[0], changes);
        await L.audit(
          db,
          s.id,
          ipHash,
          "google_wallet_pass",
          { publicId: rows[0].public_id },
          "issued",
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.redirect(303, link);
      } catch (error) {
        console.error("Google Wallet generation failed", error.message);
        return L.json(res, 500, {
          ok: false,
          message: "The Google Wallet card could not be created yet.",
        });
      }
    }
    if (action === "resendIdentityEmail") {
      if (
        !(await L.consumeRate(
          db,
          "identity_email_resend",
          L.hash(`session:${s.id}`),
          2,
          60,
        ))
      )
        return L.json(res, 429, {
          ok: false,
          message: "Please wait before requesting another email.",
        });
      const records = await db.query(
        `SELECT r.submitted_payload,r.kind,i.id,i.public_id,i.identity_number,i.role_code,i.status,i.connect_eligible
         FROM review_records r
         JOIN tlc_identities i ON i.id=r.identity_id
         WHERE r.session_id=$1
         ORDER BY r.updated_at DESC,r.id DESC LIMIT 1`,
        [s.id],
      );
      const record = records[0];
      if (!record)
        return L.json(res, 404, {
          ok: false,
          message: "Please submit your profile before requesting the email.",
        });
      const submitted = L.decrypt(record.submitted_payload) || {};
      const changes = submitted.changes || {};
      const receiptEmail = L.normalizeEmail(changes.email);
      if (!receiptEmail)
        return L.json(res, 400, {
          ok: false,
          message: "There is no email address on this submission.",
        });
      let outcome = "failed";
      try {
        outcome = await sendIdentityReceipt(
          db,
          receiptEmail,
          changes.firstName,
          record,
          changes,
          record.kind !== "manual_review" && Boolean(record.connect_eligible),
        );
      } catch (error) {
        console.error("Requested identity receipt delivery failed", error.message);
      }
      if (outcome === "sent")
        await db.query(
          "UPDATE tlc_identities SET identity_email_sent_at=now() WHERE id=$1",
          [record.id],
        );
      await L.audit(
        db,
        s.id,
        ipHash,
        "identity_email_resent",
        null,
        outcome,
      );
      if (outcome !== "sent")
        return L.json(res, 502, {
          ok: false,
          message: "The email could not be accepted. Please try again later.",
        });
      return L.json(res, 200, {
        ok: true,
        message:
          "Email accepted for delivery. Please check your inbox and junk folder.",
      });
    }
    if (action === "submit") {
      const sessionPayload = L.decrypt(s.payload),
        manual = Boolean(req.body?.manual && sessionPayload.manualReviewAllowed);
      if (!s.verified_at && !manual) return L.json(res, 403, { ok: false });
      const matched = s.matched_payload ? L.decrypt(s.matched_payload) : [];
      const allowed = [
        "firstName",
        "lastName",
        "preferredName",
        "maidenName",
        "gender",
        "maritalStatus",
        "email",
        "phone",
        "postcode",
        "addressLine1",
        "membershipStatus",
        "invitedBy",
        "firstVisit",
        "heardAbout",
        "connectInterest",
        "countryOfResidence",
        "countryOfResidenceOther",
        "residenceRegion",
        "residenceLga",
        "residenceBorough",
        "ethnicity",
        "ethnicityCode",
        "ethnicityVariant",
        "ethnicityOther",
        "tlcLocation",
        "attendanceFrequency",
        "yearStartedAttending",
        "pastoralFollowUp",
        "familyAttends",
        "familyAttendees",
        "teamMember",
        "smallGroupMember",
        "smallGroupOther",
        "householdName",
        "communicationPreference",
        "consent",
        "workStatus",
        "industry",
        "employer",
        "jobRole",
        "skills",
        "volunteeringInterests",
        "countryOfOrigin",
        "countryOfOriginOther",
        "regionOfOrigin",
        "boroughOfOrigin",
        "birthDay",
        "birthMonth",
        "birthYear",
        "ageGroup",
        "connectCompleted",
        "baptised",
        "baptismChurch",
        "baptismYear",
        "householdMembers",
        "otherNames",
        "servingTeams",
        "groups",
        "smallGroup",
        "otherGroups",
        "photo",
      ];
      const rawChanges =
        req.body?.changes && typeof req.body.changes === "object"
          ? req.body.changes
          : {};
      const changes = Object.fromEntries(
        allowed
          .filter((key) => key in rawChanges)
          .map((key) => [key, rawChanges[key]]),
      );
      const permittedGender = new Set(["Male", "Female", "Prefer not to say"]),
        permittedEthnicityCodes = new Set([
          "A1", "A2", "A3", "A4", "A5",
          "B1", "B2", "B3", "BAA",
          "M1", "M2", "M3", "M4",
          "W1", "W2", "W3", "W4", "W5",
          "O1", "O2", "PNTS",
        ]),
        permittedEthnicityVariants = new Set(["UK", "WAL", "US"]),
        permittedAttendance = new Set([
          "Weekly",
          "Two or three times a month",
          "Monthly",
          "Occasionally",
        ]),
        permittedMaritalStatus = new Set([
          "Single",
          "Married",
          "Engaged",
          "Separated",
          "Divorced",
          "Widowed",
          "Prefer not to say",
        ]);
      if (changes.gender && !permittedGender.has(String(changes.gender)))
        return L.json(res, 400, { ok: false, message: "Choose a valid gender option." });
      if (
        changes.ethnicity &&
        !permittedEthnicityCodes.has(String(changes.ethnicity))
      )
        return L.json(res, 400, { ok: false, message: "Choose a valid ethnic-group option." });
      if (
        changes.ethnicityVariant &&
        !permittedEthnicityVariants.has(String(changes.ethnicityVariant))
      )
        return L.json(res, 400, { ok: false, message: "Choose a valid ethnic-group variant." });
      if (
        changes.ethnicityCode &&
        String(changes.ethnicityCode) !== String(changes.ethnicity || "")
      )
        return L.json(res, 400, { ok: false, message: "The ethnic-group selection is inconsistent." });
      if (String(changes.ethnicityOther || "").length > 160)
        return L.json(res, 400, { ok: false, message: "Keep the ethnic-background description under 160 characters." });
      if (
        changes.membershipStatus === "visitor" &&
        !new Set(["Male", "Female"]).has(String(changes.gender || ""))
      )
        return L.json(res, 400, {
          ok: false,
          message: "Choose Male or Female for gender before continuing.",
        });
      if (
        changes.maritalStatus &&
        !permittedMaritalStatus.has(String(changes.maritalStatus))
      )
        return L.json(res, 400, { ok: false, message: "Choose a valid marital-status option." });
      if (
        changes.attendanceFrequency &&
        !permittedAttendance.has(String(changes.attendanceFrequency))
      )
        return L.json(res, 400, { ok: false, message: "Choose a valid attendance frequency." });
      const establishedJourney = ["member", "attendee"].includes(
        String(changes.membershipStatus || ""),
      );
      if (establishedJourney && !changes.yearStartedAttending)
        return L.json(res, 400, {
          ok: false,
          message: "Choose the year you started attending TLC.",
        });
      if (
        changes.yearStartedAttending &&
        changes.yearStartedAttending !== "I’m not sure" &&
        (!/^20\d{2}$/.test(String(changes.yearStartedAttending)) ||
          Number(changes.yearStartedAttending) < 2015 ||
          Number(changes.yearStartedAttending) > new Date().getFullYear())
      )
        return L.json(res, 400, { ok: false, message: "Choose a valid year you started attending." });
      const uploadedPhotos = Array.isArray(sessionPayload.uploadedPhotos)
          ? sessionPayload.uploadedPhotos
          : [];
      if (
        changes.photo &&
        !uploadedPhotos.includes(String(changes.photo.pathname || ""))
      )
        delete changes.photo;
      if (JSON.stringify(changes).length > 30000)
        return L.json(res, 413, {
          ok: false,
          message: "The submitted information is too large.",
        });
      const choices =
        req.body?.choices && typeof req.body.choices === "object"
          ? req.body.choices
          : {};
      const kind = changes.membershipStatus === "visitor"
        ? "visitor"
        : manual
          ? "manual_review"
        : matched.length > 1
          ? "possible_duplicate"
          : "profile_update";
      const contactKey = `${L.normalizeEmail(changes.email)}|${L.digits(changes.phone)}`;
      const subjectHash = L.hash(
        matched[0]?.id
          ? `member:${matched[0].id}`
          : contactKey !== "|"
            ? `manual:${contactKey}`
            : `session:${s.id}`,
      );
      if (!changes.photo) {
        const previousRows = await db.query(
          "SELECT submitted_payload FROM review_records WHERE active_subject_hash=$1 LIMIT 1",
          [subjectHash],
        );
        try {
          const previousPhoto = L.decrypt(previousRows[0]?.submitted_payload)?.changes?.photo;
          if (String(previousPhoto?.pathname || "").startsWith("member-photos/"))
            changes.photo = previousPhoto;
        } catch {}
      }
      if (!changes.photo && sessionPayload.planningCenterAvatar)
        changes.photo = {
          source: "planning_center",
          url: String(sessionPayload.planningCenterAvatar).slice(0, 2000),
        };
      const rows = await db.query(
        `INSERT INTO review_records(session_id,kind,planning_center_ids,submitted_payload,active_subject_hash,updated_at) VALUES($1,$2,$3,$4,$5,now())
         ON CONFLICT(active_subject_hash) WHERE active_subject_hash IS NOT NULL DO UPDATE SET session_id=excluded.session_id,kind=excluded.kind,planning_center_ids=excluded.planning_center_ids,submitted_payload=excluded.submitted_payload,updated_at=now() RETURNING id,identity_id,(xmax<>0) AS updated`,
        [
          s.id,
          kind,
          L.encrypt(matched.map((x) => x.id)),
          L.encrypt({ changes, choices }),
          subjectHash,
        ],
      );
      await L.audit(
        db,
        s.id,
        ipHash,
        rows[0]?.updated ? "submission_updated" : "submission_created",
        null,
        kind,
      );
      let identity = null;
      if (!manual && matched.length) {
        // Resolve again at submission time so a newly imported Connect record
        // cannot be missed by a browser session that was opened earlier.
        const recordedConnect = await resolvedConnectStatus(db, matched[0]);
        // A successfully verified person who chose the member/Connect route
        // receives their member identity and Wallet card immediately. A
        // missing Connect-list match is retained as an explicit admin flag;
        // it must not block the member-facing journey.
        const connect =
          changes.membershipStatus === "member" && !recordedConnect.eligible
            ? {
                ...recordedConnect,
                eligible: true,
                completed: false,
                source: "member_self_declaration",
                exception: "connect_confirmation_required",
              }
            : recordedConnect;
        identity = await ensureIdentity(db, matched, connect);
        if (identity)
          await db.query(
            "UPDATE review_records SET identity_id=$1 WHERE id=$2",
            [identity.id, rows[0]?.id],
          );
      } else if (manual) {
        if (rows[0]?.identity_id) {
          const existing = await db.query(
            "SELECT id,public_id,identity_number,role_code,status,connect_completed,connect_eligible,connect_source,connect_exception FROM tlc_identities WHERE id=$1",
            [rows[0].identity_id],
          );
          identity = existing[0] || null;
        }
        if (!identity) {
          const made = await db.query(
            "INSERT INTO tlc_identities(status,connect_completed,connect_eligible,connect_source) VALUES('provisional',false,false,'manual_review') RETURNING id",
          );
          await L.setIdentityPublicId(db, made[0].id, {
            roleCode:
              changes.membershipStatus === "visitor"
                ? "V"
                : changes.membershipStatus === "attendee"
                  ? "AT"
                  : null,
            source: "youcount_route",
          });
          await db.query(
            "UPDATE review_records SET identity_id=$1 WHERE id=$2",
            [made[0].id, rows[0]?.id],
          );
          const created = await db.query(
            "SELECT id,public_id,identity_number,role_code,status,connect_completed,connect_eligible,connect_source,connect_exception FROM tlc_identities WHERE id=$1",
            [made[0].id],
          );
          identity = created[0] || null;
        }
      }
      if (identity) {
        const leadershipCodes = new Set(["OP", "OM", "OA", "OD", "OC", "TL", "SG", "TM"]),
          desiredRole = leadershipCodes.has(identity.role_code)
            ? identity.role_code
            : identity.connect_eligible
              ? "CM"
              : changes.membershipStatus === "visitor"
                ? "V"
                : changes.membershipStatus === "attendee"
                  ? "AT"
                  : null;
        await L.setIdentityPublicId(db, identity.id, {
          roleCode: desiredRole,
          source: "youcount_submission",
        });
        const refreshed = await db.query(
          "SELECT id,public_id,identity_number,role_code,status,connect_completed,connect_eligible,connect_source,connect_exception FROM tlc_identities WHERE id=$1",
          [identity.id],
        );
        identity = refreshed[0] || identity;
        // An existing installed pass may contain the member's name, location or
        // role. Notify Wallet after every successful profile submission, but do
        // not let a third-party Wallet outage fail the underlying submission.
        try {
          await Wallet.notifyWalletUpdate(db, identity.id);
        } catch (error) {
          console.error("Wallet OTA notification failed", error.message);
        }
      }
      // The profile submission and TLC identity are already safely stored at
      // this point. Receipt delivery must never turn that successful write
      // into a member-facing submission failure.
      try {
        const receiptEmail = L.normalizeEmail(changes.email);
        if (identity && receiptEmail) {
          let emailOutcome = "not_configured";
          try {
            emailOutcome = await sendIdentityReceipt(
              db,
              receiptEmail,
              changes.firstName || matched[0]?.attributes?.first_name,
              identity,
              changes,
              !manual && Boolean(identity.connect_eligible),
            );
          } catch (error) {
            emailOutcome = "failed";
            console.error("Identity receipt delivery failed", error.message);
          }
          if (emailOutcome === "sent")
            await db.query(
              "UPDATE tlc_identities SET identity_email_sent_at=now() WHERE id=$1",
              [identity.id],
            );
          await L.audit(
            db,
            s.id,
            ipHash,
            "identity_email",
            null,
            emailOutcome,
          );
        }
      } catch (error) {
        console.error("Identity receipt processing failed", error.message);
      }
      return L.json(res, 200, {
        ok: true,
        recordId: rows[0]?.id,
        updated: Boolean(rows[0]?.updated),
        identity: identity
          ? {
              publicId: identity.public_id,
              status: identity.status,
              connectCompleted: identity.connect_completed,
              connectExempt: Boolean(identity.connect_exception),
              walletEligible: !manual && Boolean(identity.connect_eligible),
              googleWalletReady: Boolean(googleWalletConfig()),
            }
          : null,
      });
    }
    return L.json(res, 400, { ok: false });
  } catch (error) {
    console.error("Member API request failed", error.message);
    return L.json(res, 503, {
      ok: false,
      message: "The service is temporarily unavailable. Please try again.",
    });
  }
};

// Used by the controlled production verification script. The HTTP handler
// remains the only public route; these are not exposed over the network.
module.exports._createApplePass = createApplePass;
module.exports._ensureApplePassState = ensureApplePassState;
module.exports._sendIdentityReceipt = sendIdentityReceipt;
module.exports._redesignedIdentityEmail = redesignedIdentityEmail;
module.exports._identityNextSteps = identityNextSteps;
module.exports._displayGroupName = displayGroupName;
module.exports._includeJourneyGraphic = includeJourneyGraphic;
module.exports._googleWalletLink = googleWalletLink;
