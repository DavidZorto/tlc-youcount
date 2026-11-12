const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const dbUrl = () => process.env.DATABASE_URL || process.env.tlc_DATABASE_URL;
const secret = () => process.env.SESSION_SECRET || "local-development-only";
const json = (res, status, body) => { res.setHeader("Cache-Control", "no-store"); return res.status(status).json(body); };
const id = () => crypto.randomUUID();
const hash = value => crypto.createHmac("sha256", secret()).update(String(value)).digest("hex");
function encrypt(value){const key=crypto.createHash("sha256").update(secret()).digest(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv),data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString("base64url")}
function decrypt(value){const raw=Buffer.from(value,"base64url"),key=crypto.createHash("sha256").update(secret()).digest(),decipher=crypto.createDecipheriv("aes-256-gcm",key,raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString("utf8"))}
const sign = value => crypto.createHmac("sha256", secret()).update(value).digest("base64url");
const token = payload => { const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); return `${body}.${sign(body)}`; };
const verify = raw => { try { const [body, mac] = String(raw || "").split("."); if (!body || !mac || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(body)))) return null; const data = JSON.parse(Buffer.from(body, "base64url")); return data.exp > Date.now() ? data : null; } catch { return null; } };
const cookies = req => Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim().split("=")).filter(x => x.length === 2));
const session = req => verify(cookies(req).tlc_portal);
const setSession = (res, person) => {const seconds=person.role==="member"?30*24*60*60:12*60*60;res.setHeader("Set-Cookie", `tlc_portal=${token({...person,exp:Date.now()+seconds*1000})}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${process.env.VERCEL ? "; Secure" : ""}`)};
const clearSession = res => res.setHeader("Set-Cookie", "tlc_portal=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
const clientIp=req=>String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
const requireRole = (user, roles) => user && roles.includes(user.role);
const pcAuth = () => `Basic ${Buffer.from(`${process.env.pc_clientid}:${process.env.pc_secret}`).toString("base64")}`;
async function pc(app, path) { if (!process.env.pc_clientid || !process.env.pc_secret) return null; const r = await fetch(`https://api.planningcenteronline.com/${app}/v2${path}`, {headers:{Authorization:pcAuth(),Accept:"application/json","User-Agent":"TLC Team Member Portal"}}); if (!r.ok) throw new Error("planning_center_unavailable"); return r.json(); }
async function pcAttempt(app,path){if(!process.env.pc_clientid||!process.env.pc_secret)return{status:503,doc:null,error:"credentials_missing"};const r=await fetch(`https://api.planningcenteronline.com/${app}/v2${path}`,{headers:{Authorization:pcAuth(),Accept:"application/json","User-Agent":"TLC Team Member Portal"}});let doc=null;try{doc=await r.json()}catch{}return{status:r.status,doc:r.ok?doc:null,error:r.ok?null:doc?.errors?.map(x=>({status:x.status,title:x.title,detail:x.detail})).slice(0,3)||null}}
async function database() { if (!dbUrl()) return null; return neon(dbUrl()); }
async function runMigrate(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS portal_join_requests (id text PRIMARY KEY, person_id text NOT NULL, person_name text NOT NULL, team_id text NOT NULL, team_name text NOT NULL, message text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', decided_by text, decision_note text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz)`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_role_assignments (id text PRIMARY KEY, person_id text NOT NULL, person_name text NOT NULL, role text NOT NULL, team_id text, team_name text, status text NOT NULL DEFAULT 'active', granted_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_documents (id text PRIMARY KEY, title text NOT NULL, summary text NOT NULL DEFAULT '', team_id text, team_name text NOT NULL DEFAULT 'All teams', file_type text NOT NULL DEFAULT 'GUIDE', source_url text, owner_id text NOT NULL, owner_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_document_versions (id text PRIMARY KEY, document_id text NOT NULL REFERENCES portal_documents(id) ON DELETE CASCADE, version integer NOT NULL, content text NOT NULL DEFAULT '', source_url text, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,version))`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_document_permissions (document_id text NOT NULL REFERENCES portal_documents(id) ON DELETE CASCADE, person_id text NOT NULL, permission text NOT NULL, granted_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id,person_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_audit (id bigserial PRIMARY KEY, actor_id text NOT NULL, actor_name text NOT NULL, action text NOT NULL, target text, detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_accounts (person_id text PRIMARY KEY, person_name text NOT NULL, email_hash text NOT NULL, status text NOT NULL DEFAULT 'active', verified_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`ALTER TABLE portal_accounts ADD COLUMN IF NOT EXISTS password_hash text`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS portal_accounts_email_idx ON portal_accounts(email_hash)`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_signup_challenges (id text PRIMARY KEY, token_hash text UNIQUE NOT NULL, payload text NOT NULL, attempts integer NOT NULL DEFAULT 0, sends integer NOT NULL DEFAULT 0, verified_at timestamptz, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_account_groups (person_id text NOT NULL REFERENCES portal_accounts(person_id) ON DELETE CASCADE, group_id text NOT NULL, group_name text NOT NULL, group_type_id text NOT NULL, status text NOT NULL DEFAULT 'claimed', confirmed_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(person_id,group_id))`);
  await db.query(`CREATE INDEX IF NOT EXISTS portal_signup_token_idx ON portal_signup_challenges(token_hash,expires_at)`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_rate_limits (bucket text NOT NULL,subject_hash text NOT NULL,window_started_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 1,PRIMARY KEY(bucket,subject_hash))`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_events (id text PRIMARY KEY,title text NOT NULL,team_id text NOT NULL,team_name text NOT NULL,event_date date NOT NULL,call_time time NOT NULL,start_time time NOT NULL,end_time time,location text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'published',created_by text NOT NULL,created_by_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_event_assignments (id text PRIMARY KEY,event_id text NOT NULL REFERENCES portal_events(id) ON DELETE CASCADE,person_id text NOT NULL REFERENCES portal_accounts(person_id) ON DELETE CASCADE,person_name text NOT NULL,position text NOT NULL,status text NOT NULL DEFAULT 'pending',response_note text NOT NULL DEFAULT '',responded_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,person_id))`);
  await db.query(`CREATE INDEX IF NOT EXISTS portal_events_team_date_idx ON portal_events(team_id,event_date)`);
  await db.query(`CREATE INDEX IF NOT EXISTS portal_assignments_person_idx ON portal_event_assignments(person_id,status)`);
}
// Every portal request calls migrate. The statements above run only when they
// change (once per deploy that edits them); otherwise this is one SELECT, or
// nothing once this server instance has checked.
const SCHEMA_VERSION = crypto.createHash("sha256").update(runMigrate.toString()).digest("hex").slice(0, 16);
let schemaReady = false;
async function migrate(db) {
  if (!db || schemaReady) return;
  let current = null;
  try { current = (await db.query("SELECT value FROM portal_schema_state WHERE name='schema_version' LIMIT 1"))[0]?.value; } catch {}
  if (current !== SCHEMA_VERSION) {
    await runMigrate(db);
    await db.query("CREATE TABLE IF NOT EXISTS portal_schema_state (name text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
    await db.query("INSERT INTO portal_schema_state(name,value) VALUES('schema_version',$1) ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=now()", [SCHEMA_VERSION]);
  }
  schemaReady = true;
}
async function consumeRate(db,bucket,subject,limit,minutes){const rows=await db.query(`INSERT INTO portal_rate_limits(bucket,subject_hash,window_started_at,attempts) VALUES($1,$2,now(),1) ON CONFLICT(bucket,subject_hash) DO UPDATE SET window_started_at=CASE WHEN portal_rate_limits.window_started_at<now()-($3::text||' minutes')::interval THEN now() ELSE portal_rate_limits.window_started_at END,attempts=CASE WHEN portal_rate_limits.window_started_at<now()-($3::text||' minutes')::interval THEN 1 ELSE portal_rate_limits.attempts+1 END RETURNING attempts`,[bucket,subject,minutes]);return Number(rows[0]?.attempts||1)<=limit}
function passwordHash(password){const salt=crypto.randomBytes(16).toString("base64url"),derived=crypto.scryptSync(String(password),salt,64).toString("base64url");return `scrypt:${salt}:${derived}`}
function passwordVerify(password,stored){try{const [kind,salt,expected]=String(stored||"").split(":");if(kind!=="scrypt"||!salt||!expected)return false;const actual=crypto.scryptSync(String(password),salt,64),target=Buffer.from(expected,"base64url");return actual.length===target.length&&crypto.timingSafeEqual(actual,target)}catch{return false}}
async function audit(db, user, action, target, detail={}) { if (db) await db.query("INSERT INTO portal_audit(actor_id,actor_name,action,target,detail) VALUES($1,$2,$3,$4,$5)",[user.id,user.name,action,target||null,JSON.stringify(detail)]); }
module.exports={json,id,hash,encrypt,decrypt,passwordHash,passwordVerify,session,setSession,clearSession,clientIp,consumeRate,requireRole,pc,pcAttempt,database,migrate,audit};
