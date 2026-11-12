const crypto = require("crypto");
const L = require("./_lib");

const POLICY_VERSION = "2026-09-21";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const genericOtp = {
  ok: true,
  message: "If this email is registered with TLC, a code is on its way.",
};
const scrypt = (value, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(value, salt, 64, (error, key) =>
      error ? reject(error) : resolve(key.toString("hex")),
    ),
  );

async function migrate(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS influence_accounts (
    id bigserial PRIMARY KEY, planning_center_id text UNIQUE NOT NULL, email text UNIQUE NOT NULL,
    first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '', password_hash text,
    password_salt text, policy_version text, policy_accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `ALTER TABLE influence_accounts ADD COLUMN IF NOT EXISTS headline text NOT NULL DEFAULT ''`,
  );
  await db.query(
    `ALTER TABLE influence_accounts ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT ''`,
  );
  await db.query(
    `ALTER TABLE influence_accounts ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT 'London'`,
  );
  await db.query(
    `ALTER TABLE influence_accounts ADD COLUMN IF NOT EXISTS avatar_data text NOT NULL DEFAULT ''`,
  );
  await db.query(
    `ALTER TABLE influence_accounts ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS influence_otps (
    id bigserial PRIMARY KEY, email_hash text NOT NULL, planning_center_id text,
    profile_payload text, code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0,
    used_at timestamptz, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS influence_otps_email_idx ON influence_otps(email_hash,created_at DESC)`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS influence_sessions (
    id bigserial PRIMARY KEY, account_id bigint NOT NULL REFERENCES influence_accounts(id) ON DELETE CASCADE,
    token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS influence_requests (
    id bigserial PRIMARY KEY, account_id bigint NOT NULL REFERENCES influence_accounts(id),
    category text NOT NULL, title text NOT NULL, detail text NOT NULL, location text NOT NULL DEFAULT 'London',
    status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS influence_responses (
    id bigserial PRIMARY KEY, request_id bigint NOT NULL REFERENCES influence_requests(id) ON DELETE CASCADE,
    account_id bigint NOT NULL REFERENCES influence_accounts(id), message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,account_id)
  )`);
  const seedRows = await db.query(
    `INSERT INTO influence_accounts(planning_center_id,email,first_name,last_name,headline,bio,location,policy_version,policy_accepted_at,profile_completed_at)
     VALUES('_influence_seed','network@influence.local','Influence','Team','Community team','Seeded community account','London',$1,now(),now())
     ON CONFLICT(planning_center_id) DO UPDATE SET updated_at=now() RETURNING id`,
    [POLICY_VERSION],
  );
  const seedId = seedRows[0]?.id;
  if (seedId) {
    const seeds = [
      [
        "career",
        "Looking for a product mentor",
        "I am moving into product management and would value one conversation with someone working in the field.",
      ],
      [
        "service",
        "Photographer for a community event",
        "We need a volunteer photographer for a Saturday youth employability workshop next month.",
      ],
      [
        "support",
        "Advice on registering a charity",
        "Could anyone with UK charity governance experience point me towards the right first steps?",
      ],
    ];
    for (const [category, title, detail] of seeds)
      await db.query(
        `INSERT INTO influence_requests(account_id,category,title,detail)
         SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM influence_requests WHERE account_id=$1 AND title=$3)`,
        [seedId, category, title, detail],
      );
  }
}

async function planningCenterMember(email) {
  let exact = [];
  try {
    const doc = await L.pcFetch(
      `/people?where[search_name_or_email]=${encodeURIComponent(email)}&include=emails&per_page=25`,
    );
    exact = L.contacts(doc).filter((person) =>
      person.emails.some((value) => L.normalizeEmail(value) === email),
    );
  } catch {}
  if (!exact.length) {
    const emailDoc = await L.pcFetch(
      `/emails?where[address]=${encodeURIComponent(email)}&include=person&per_page=25`,
    );
    const people = new Map(
      (emailDoc.included || [])
        .filter((item) => item.type === "Person" || item.type === "people")
        .map((item) => [String(item.id), item]),
    );
    exact = (emailDoc.data || [])
      .filter((item) => L.normalizeEmail(item.attributes?.address) === email)
      .map((item) => {
        const id = String(item.relationships?.person?.data?.id || "");
        const person = people.get(id);
        return person
          ? {
              id,
              attributes: person.attributes || {},
              emails: [email],
              phones: [],
            }
          : null;
      })
      .filter(Boolean);
  }
  if (exact.length !== 1) return null;
  const person = exact[0];
  return {
    id: person.id,
    email,
    firstName:
      person.attributes?.first_name || person.attributes?.nickname || "Member",
    lastName: person.attributes?.last_name || "",
  };
}

async function sendEmailCode(email, code) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("email_not_configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.INFLUENCE_FROM_EMAIL ||
        "Influence Network <network@thelibertychurchlondon.com>",
      to: [email],
      subject: `${code} is your Influence Network code`,
      html: `<div style="font-family:Arial,sans-serif;background:#f6f6fb;padding:32px"><div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:32px"><div style="font-size:13px;font-weight:800;color:#4a49fa;letter-spacing:.12em">INFLUENCE NETWORK</div><h1 style="color:#0d1030">Your verification code</h1><p style="color:#555970">Use this code to continue. It expires in 10 minutes.</p><div style="font-size:36px;font-weight:800;letter-spacing:.18em;color:#0d1030;margin:24px 0">${code}</div><p style="color:#777b91;font-size:13px">If you did not request this, you can ignore this email.</p></div></div>`,
    }),
  });
  if (!response.ok) throw new Error("email_delivery_failed");
}

async function sendTwilioEmail(email) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !auth || !service) throw new Error("email_not_configured");
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: email, Channel: "email" }),
    },
  );
  if (!response.ok) throw new Error("email_delivery_failed");
}

async function checkTwilioEmail(email, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: email, Code: code }),
    },
  );
  if (!response.ok) return false;
  return (await response.json()).status === "approved";
}

function bearer(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function accountFor(db, req) {
  const raw = bearer(req);
  if (!raw) return null;
  const rows = await db.query(
    `SELECT a.* FROM influence_sessions s JOIN influence_accounts a ON a.id=s.account_id
     WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1`,
    [L.hash(raw)],
  );
  if (rows[0])
    await db.query(
      "UPDATE influence_sessions SET last_seen_at=now() WHERE token_hash=$1",
      [L.hash(raw)],
    );
  return rows[0] || null;
}

async function newSession(db, accountId) {
  const raw = L.token();
  await db.query(
    "INSERT INTO influence_sessions(account_id,token_hash,expires_at) VALUES($1,$2,now()+interval '90 days')",
    [accountId, L.hash(raw)],
  );
  return raw;
}

function publicAccount(account) {
  return {
    id: String(account.id),
    email: account.email,
    firstName: account.first_name,
    lastName: account.last_name,
    headline: account.headline || "",
    bio: account.bio || "",
    location: account.location || "London",
    avatarData: account.avatar_data || "",
    policyRequired: account.policy_version !== POLICY_VERSION,
    profileRequired: !account.profile_completed_at,
    policyVersion: POLICY_VERSION,
  };
}

async function feed(db, accountId) {
  const rows = await db.query(
    `SELECT r.id,r.category,r.title,r.detail,r.location,r.status,r.created_at AS "createdAt",
      a.first_name AS "firstName",a.last_name AS "lastName",a.avatar_data AS "avatarData",r.account_id=$1 AS "isMine",
      count(x.id)::int AS "responseCount"
     FROM influence_requests r JOIN influence_accounts a ON a.id=r.account_id
     LEFT JOIN influence_responses x ON x.request_id=r.id
     WHERE r.status='open' OR r.account_id=$1
     GROUP BY r.id,a.id ORDER BY (r.account_id=$1) DESC,r.created_at DESC LIMIT 200`,
    [accountId],
  );
  return rows.map((row) => ({ ...row, id: String(row.id) }));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") return L.json(res, 405, { ok: false });
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const db = await L.initDb();
    await migrate(db);
    const action = String(req.body?.action || "");
    const ipHash = L.hash(L.clientIp(req));

    if (action === "requestOtp") {
      const email = L.normalizeEmail(req.body?.email);
      if (!EMAIL_PATTERN.test(email))
        return L.json(res, 400, {
          ok: false,
          message: "Enter a valid email address.",
        });
      if (!(await L.consumeRate(db, "influence_otp_ip", ipHash, 8, 30)))
        return L.json(res, 429, {
          ok: false,
          message: "Please wait before requesting another code.",
        });
      let member = null;
      try {
        member = await planningCenterMember(email);
      } catch {}
      if (member) {
        const code = String(crypto.randomInt(100000, 1000000));
        const useResend = Boolean(process.env.RESEND_API_KEY);
        await db.query(
          `INSERT INTO influence_otps(email_hash,planning_center_id,profile_payload,code_hash,expires_at)
           VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,
          [
            L.hash(email),
            member.id,
            L.encrypt({
              ...member,
              otpProvider: useResend ? "resend" : "twilio",
            }),
            useResend ? L.hash(`${email}:${code}`) : "twilio",
          ],
        );
        try {
          await sendEmailCode(email, code);
        } catch (error) {
          if (useResend)
            console.error("Influence OTP delivery failed", error.message);
          else
            try {
              await sendTwilioEmail(email);
            } catch (twilioError) {
              console.error(
                "Influence OTP delivery failed",
                twilioError.message,
              );
            }
        }
      }
      return L.json(res, 200, genericOtp);
    }

    if (action === "verifyOtp") {
      const email = L.normalizeEmail(req.body?.email);
      const code = String(req.body?.code || "")
        .replace(/\D/g, "")
        .slice(0, 6);
      const rows = await db.query(
        `SELECT * FROM influence_otps WHERE email_hash=$1 AND used_at IS NULL AND expires_at>now()
         ORDER BY created_at DESC LIMIT 1`,
        [L.hash(email)],
      );
      const otp = rows[0];
      const otpProfile = otp?.profile_payload
        ? L.decrypt(otp.profile_payload)
        : null;
      let approved = Boolean(
        otp &&
        code.length === 6 &&
        otpProfile?.otpProvider !== "twilio" &&
        L.safeEqual(otp.code_hash, L.hash(`${email}:${code}`)),
      );
      if (otp && code.length === 6 && otpProfile?.otpProvider === "twilio") {
        try {
          approved = await checkTwilioEmail(email, code);
        } catch {}
      }
      if (!approved) {
        if (otp)
          await db.query(
            "UPDATE influence_otps SET attempts=attempts+1,used_at=CASE WHEN attempts>=4 THEN now() ELSE used_at END WHERE id=$1",
            [otp.id],
          );
        return L.json(res, 400, {
          ok: false,
          message: "That code is invalid or has expired.",
        });
      }
      await db.query("UPDATE influence_otps SET used_at=now() WHERE id=$1", [
        otp.id,
      ]);
      const profile = otpProfile;
      const existing = await db.query(
        "SELECT * FROM influence_accounts WHERE planning_center_id=$1 LIMIT 1",
        [profile.id],
      );
      if (existing[0]?.password_hash) {
        const session = await newSession(db, existing[0].id);
        return L.json(res, 200, {
          ok: true,
          existing: true,
          token: session,
          account: publicAccount(existing[0]),
        });
      }
      const setupToken = L.token();
      await db.query(
        `INSERT INTO verification_sessions(token_hash,ip_hash,payload,matched_payload,verified_at,expires_at)
         VALUES($1,$2,$3,$4,now(),now()+interval '20 minutes')`,
        [
          L.hash(setupToken),
          ipHash,
          L.encrypt({ purpose: "influence_setup", email }),
          L.encrypt(profile),
        ],
      );
      return L.json(res, 200, {
        ok: true,
        existing: false,
        setupToken,
        firstName: profile.firstName,
      });
    }

    if (action === "setPassword") {
      const setupToken = String(req.body?.setupToken || "");
      const password = String(req.body?.password || "");
      if (password.length < 10)
        return L.json(res, 400, {
          ok: false,
          message: "Use at least 10 characters.",
        });
      const rows = await db.query(
        `SELECT * FROM verification_sessions WHERE token_hash=$1 AND verified_at IS NOT NULL AND expires_at>now() LIMIT 1`,
        [L.hash(setupToken)],
      );
      if (!rows[0])
        return L.json(res, 400, {
          ok: false,
          message: "Verification expired. Start again.",
        });
      const purpose = L.decrypt(rows[0].payload);
      const profile = L.decrypt(rows[0].matched_payload);
      if (purpose.purpose !== "influence_setup")
        return L.json(res, 403, { ok: false });
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = await scrypt(password, salt);
      const accounts = await db.query(
        `INSERT INTO influence_accounts(planning_center_id,email,first_name,last_name,password_hash,password_salt)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(planning_center_id) DO UPDATE SET email=excluded.email,first_name=excluded.first_name,
           last_name=excluded.last_name,password_hash=excluded.password_hash,password_salt=excluded.password_salt,updated_at=now()
         RETURNING *`,
        [
          profile.id,
          purpose.email,
          profile.firstName,
          profile.lastName,
          passwordHash,
          salt,
        ],
      );
      await db.query(
        "UPDATE verification_sessions SET expires_at=now() WHERE id=$1",
        [rows[0].id],
      );
      const token = await newSession(db, accounts[0].id);
      return L.json(res, 200, {
        ok: true,
        token,
        account: publicAccount(accounts[0]),
      });
    }

    if (action === "login") {
      const email = L.normalizeEmail(req.body?.email);
      const password = String(req.body?.password || "");
      const rows = await db.query(
        "SELECT * FROM influence_accounts WHERE email=$1 LIMIT 1",
        [email],
      );
      const account = rows[0];
      const calculated = account?.password_salt
        ? await scrypt(password, account.password_salt)
        : "";
      if (
        !account?.password_hash ||
        !L.safeEqual(account.password_hash, calculated)
      )
        return L.json(res, 401, {
          ok: false,
          message: "Email or password is incorrect.",
        });
      const token = await newSession(db, account.id);
      return L.json(res, 200, {
        ok: true,
        token,
        account: publicAccount(account),
      });
    }

    const account = await accountFor(db, req);
    if (!account)
      return L.json(res, 401, { ok: false, message: "Please sign in again." });
    if (action === "bootstrap")
      return L.json(res, 200, {
        ok: true,
        account: publicAccount(account),
        requests: await feed(db, account.id),
      });
    if (action === "acceptPolicy") {
      await db.query(
        "UPDATE influence_accounts SET policy_version=$1,policy_accepted_at=now(),updated_at=now() WHERE id=$2",
        [POLICY_VERSION, account.id],
      );
      return L.json(res, 200, { ok: true });
    }
    if (account.policy_version !== POLICY_VERSION)
      return L.json(res, 403, {
        ok: false,
        message: "Please accept the community guidelines first.",
      });
    if (action === "saveProfile") {
      const firstName = String(req.body?.firstName || "")
        .trim()
        .slice(0, 80);
      const lastName = String(req.body?.lastName || "")
        .trim()
        .slice(0, 80);
      const headline = String(req.body?.headline || "")
        .trim()
        .slice(0, 120);
      const bio = String(req.body?.bio || "")
        .trim()
        .slice(0, 500);
      const location = String(req.body?.location || "London")
        .trim()
        .slice(0, 100);
      const avatarData = String(req.body?.avatarData || "");
      if (!firstName || headline.length < 3)
        return L.json(res, 400, {
          ok: false,
          message: "Add your name and a short professional headline.",
        });
      if (
        avatarData &&
        (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
          avatarData,
        ) ||
          avatarData.length > 1800000)
      )
        return L.json(res, 413, {
          ok: false,
          message: "Please choose a smaller JPEG, PNG or WebP photo.",
        });
      const rows = await db.query(
        `UPDATE influence_accounts SET first_name=$1,last_name=$2,headline=$3,bio=$4,location=$5,
          avatar_data=CASE WHEN $6='' THEN avatar_data ELSE $6 END,profile_completed_at=now(),updated_at=now()
         WHERE id=$7 RETURNING *`,
        [
          firstName,
          lastName,
          headline,
          bio,
          location || "London",
          avatarData,
          account.id,
        ],
      );
      return L.json(res, 200, { ok: true, account: publicAccount(rows[0]) });
    }
    if (action === "createRequest") {
      const category = ["service", "career", "support"].includes(
        req.body?.category,
      )
        ? req.body.category
        : "service";
      const title = String(req.body?.title || "")
        .trim()
        .slice(0, 120);
      const detail = String(req.body?.detail || "")
        .trim()
        .slice(0, 1200);
      if (title.length < 5 || detail.length < 15)
        return L.json(res, 400, {
          ok: false,
          message: "Add a clear title and a little more detail.",
        });
      await db.query(
        "INSERT INTO influence_requests(account_id,category,title,detail) VALUES($1,$2,$3,$4)",
        [account.id, category, title, detail],
      );
      return L.json(res, 200, {
        ok: true,
        requests: await feed(db, account.id),
      });
    }
    if (action === "respond") {
      const requestId = Number(req.body?.requestId);
      const message = String(req.body?.message || "")
        .trim()
        .slice(0, 1200);
      if (!requestId || message.length < 5)
        return L.json(res, 400, {
          ok: false,
          message: "Write a short, helpful response.",
        });
      const target = await db.query(
        "SELECT account_id,status FROM influence_requests WHERE id=$1 LIMIT 1",
        [requestId],
      );
      if (!target[0] || target[0].status !== "open")
        return L.json(res, 404, {
          ok: false,
          message: "This request is no longer open.",
        });
      if (String(target[0].account_id) === String(account.id))
        return L.json(res, 400, {
          ok: false,
          message: "You cannot respond to your own request.",
        });
      const existingResponse = await db.query(
        "SELECT id FROM influence_responses WHERE request_id=$1 AND account_id=$2 LIMIT 1",
        [requestId, account.id],
      );
      const count = await db.query(
        "SELECT count(*)::int AS count FROM influence_responses WHERE request_id=$1",
        [requestId],
      );
      if (!existingResponse[0] && Number(count[0]?.count) >= 5)
        return L.json(res, 409, {
          ok: false,
          message: "This request already has five responses.",
        });
      await db.query(
        `INSERT INTO influence_responses(request_id,account_id,message) VALUES($1,$2,$3)
         ON CONFLICT(request_id,account_id) DO UPDATE SET message=excluded.message,created_at=now()`,
        [requestId, account.id, message],
      );
      return L.json(res, 200, {
        ok: true,
        requests: await feed(db, account.id),
      });
    }
    if (action === "activity") {
      const rows = await db.query(
        `SELECT x.id,x.message,x.created_at AS "createdAt",r.title,r.id AS "requestId",
          a.first_name AS "firstName",a.last_name AS "lastName",a.avatar_data AS "avatarData"
         FROM influence_responses x JOIN influence_requests r ON r.id=x.request_id
         JOIN influence_accounts a ON a.id=x.account_id
         WHERE r.account_id=$1 ORDER BY x.created_at DESC LIMIT 100`,
        [account.id],
      );
      return L.json(res, 200, {
        ok: true,
        activity: rows.map((row) => ({
          ...row,
          id: String(row.id),
          requestId: String(row.requestId),
        })),
      });
    }
    if (action === "requestResponses") {
      const requestId = Number(req.body?.requestId);
      if (!requestId)
        return L.json(res, 400, { ok: false, message: "Choose a request." });
      const owned = await db.query(
        "SELECT id FROM influence_requests WHERE id=$1 AND account_id=$2 LIMIT 1",
        [requestId, account.id],
      );
      if (!owned[0])
        return L.json(res, 403, {
          ok: false,
          message: "Only the requester can view these private responses.",
        });
      const rows = await db.query(
        `SELECT x.id,x.message,x.created_at AS "createdAt",x.request_id AS "requestId",
          a.first_name AS "firstName",a.last_name AS "lastName",a.avatar_data AS "avatarData"
         FROM influence_responses x JOIN influence_accounts a ON a.id=x.account_id
         WHERE x.request_id=$1 ORDER BY x.created_at ASC`,
        [requestId],
      );
      return L.json(res, 200, {
        ok: true,
        responses: rows.map((row) => ({
          ...row,
          id: String(row.id),
          requestId: String(row.requestId),
        })),
      });
    }
    if (action === "logout") {
      await db.query("DELETE FROM influence_sessions WHERE token_hash=$1", [
        L.hash(bearer(req)),
      ]);
      return L.json(res, 200, { ok: true });
    }
    return L.json(res, 400, { ok: false });
  } catch (error) {
    console.error("Influence API error", error);
    return L.json(res, 503, {
      ok: false,
      message: "The service is temporarily unavailable.",
    });
  }
};
