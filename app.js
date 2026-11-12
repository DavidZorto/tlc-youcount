// TLC Member Care demo. All records and verification logic are local.
// Production should add server-side validation, RBAC, encrypted audit storage,
// secure API keys, atomic rate limiting, and Twilio SMS verification.

const firstNames = [
  "Abigail",
  "Adebayo",
  "Amara",
  "Andrew",
  "Blessing",
  "Chidi",
  "Deborah",
  "Daniel",
  "David",
  "Elizabeth",
  "Emmanuel",
  "Esther",
  "Femi",
  "Grace",
  "Hannah",
  "Isaac",
  "James",
  "Janet",
  "Joshua",
  "Kemi",
  "Michael",
  "Miriam",
  "Naomi",
  "Nathan",
  "Olivia",
  "Peter",
  "Rachel",
  "Rebecca",
  "Samuel",
  "Sarah",
  "Timothy",
  "Victoria",
];
const lastNames = [
  "Adebisi",
  "Adeyemi",
  "Allen",
  "Balogun",
  "Bennett",
  "Brown",
  "Campbell",
  "Chukwu",
  "Davies",
  "Edwards",
  "Evans",
  "George",
  "Johnson",
  "Lawal",
  "Lewis",
  "Morgan",
  "Nwosu",
  "Ogunleye",
  "Oluwatimilehin",
  "Okafor",
  "Osei",
  "Patel",
  "Roberts",
  "Smith",
  "Taylor",
  "Thomas",
  "Williams",
];
const streets = [
  "George Street",
  "Oakfield Road",
  "Kingston Avenue",
  "St Matthew's Close",
  "Rose Lane",
  "Norwich Road",
  "Millers Way",
];
const teams = [
  "Welcome Team",
  "Worship",
  "Kids Church",
  "Media",
  "Prayer",
  "Pastoral Care",
  "Youth",
  "Hospitality",
  "Outreach",
  "",
];
const groups = [
  "Northside Connect",
  "Thursday Fellowship",
  "Young Adults",
  "Families Group",
  "Sisters Circle",
  "",
  "Sunday Study",
];
const statuses = [
  "Active",
  "Active",
  "Active",
  "Worker",
  "Visitor",
  "Inactive",
  "Needs Review",
];
const verifs = ["Verified", "Unverified", "Updated", "Needs Review"];
const pick = (a, i, m = 1) => a[(i * m) % a.length];
function makeMembers() {
  const rows = [];
  for (let i = 1; i <= 168; i++) {
    let first = pick(firstNames, i, 7),
      last = pick(lastNames, i, 11),
      num = (i % 48) + 1,
      street = pick(streets, i, 3),
      post = `IP${(i % 8) + 1} ${2 + (i % 7)}${String.fromCharCode(65 + (i % 20))}${String.fromCharCode(65 + ((i * 3) % 20))}`;
    const incomplete = i % 5 === 0;
    rows.push({
      id: `TLC-${String(i).padStart(4, "0")}`,
      firstName: first,
      lastName: last,
      preferredName: i % 6 ? first : "",
      email:
        incomplete && i % 2
          ? ""
          : `${first}.${last}${i % 4 ? "" : i}@gmail.com`.toLowerCase(),
      phone:
        incomplete && i % 3 === 0
          ? ""
          : `07${String(700000000 + i * 613).slice(-9)}`,
      postcode: incomplete && i % 4 === 0 ? "" : post,
      addressLine1: incomplete && i % 3 === 1 ? "" : `${num} ${street}`,
      householdName: i % 4 ? `${last} Household` : "",
      memberStatus: pick(statuses, i, 5),
      department: incomplete && i % 2 === 0 ? "" : pick(teams, i, 3),
      smallGroup: incomplete ? "" : pick(groups, i, 5),
      lastAttendanceDate: `2026-0${(i % 7) + 1}-${String((i % 27) + 1).padStart(2, "0")}`,
      profileCompletenessScore: incomplete ? 55 + (i % 35) : 88 + (i % 13),
      verificationStatus: pick(verifs, i, 3),
      possibleDuplicateIds: [],
      adminNotes: "",
      createdAt: "2025-09-14",
      updatedAt: `2026-07-${String((i % 25) + 1).padStart(2, "0")}`,
    });
  }
  // Seed a recognisable high-value duplicate cluster for the campaign demo.
  Object.assign(rows[6], {
    firstName: "Timothy",
    lastName: "Oluwatimilehin",
    preferredName: "Tim",
    email: "timothy.o@gmail.com",
    phone: "07700900432",
    postcode: "IP1 3RH",
    addressLine1: "24 George Street",
    memberStatus: "Active",
    department: "Media",
    smallGroup: "Northside Connect",
    profileCompletenessScore: 96,
    verificationStatus: "Unverified",
    possibleDuplicateIds: ["CM 482193", "TM 735814"],
  });
  Object.assign(rows[41], {
    firstName: "Tim",
    lastName: "Oluwatimilehin",
    preferredName: "Bro Tim",
    email: "timothy.o@gmail.com",
    phone: "07700900432",
    postcode: "IP1 3RH",
    addressLine1: "24 George St",
    memberStatus: "Needs Review",
    department: "",
    smallGroup: "",
    profileCompletenessScore: 72,
    verificationStatus: "Needs Review",
    possibleDuplicateIds: ["CM 619427"],
  });
  Object.assign(rows[108], {
    firstName: "T.",
    lastName: "Oluwatimilehin",
    preferredName: "Tim Oluwatimilehin",
    email: "tim.old@outlook.com",
    phone: "",
    postcode: "IP1 3RH",
    addressLine1: "24 George Street",
    memberStatus: "Inactive",
    department: "Media",
    smallGroup: "",
    profileCompletenessScore: 69,
    verificationStatus: "Unverified",
    possibleDuplicateIds: ["CM 619427"],
  });
  return rows;
}
const members = makeMembers();
// Mock Planning Center-style service boundary. Replace these local operations with
// authenticated server-side API calls only after the integration is approved.
const memberService = {
  fetchMembers: () => Promise.resolve([...members]),
  searchPeople: (query) =>
    Promise.resolve(
      members
        .filter((m) =>
          [
            m.firstName,
            m.lastName,
            m.preferredName,
            m.email,
            m.phone,
            m.postcode,
          ].some((v) => norm(v).includes(norm(query))),
        )
        .slice(0, 5),
    ),
  submitProfileUpdate: (id, changes) => {
    const member = members.find((m) => m.id === id);
    if (member)
      Object.assign(member, changes, {
        updatedAt: new Date().toISOString().slice(0, 10),
      });
    return Promise.resolve(member);
  },
  flagDuplicates: (id, responses) =>
    Promise.resolve({
      profileId: id,
      responses,
      status: "Pending admin review",
    }),
  approveUpdate: (index) => Promise.resolve({ index, status: "Approved" }),
  reviewDuplicate: (clusterId, outcome) =>
    Promise.resolve({ clusterId, outcome }),
};
const DATA_TEAM_EMAIL = "datateam@thelibertychurchlondon.com";
const SERVESPACE_URL = "https://servespace.thelibertychurchlondon.com";
const PRODUCT_PATH = location.pathname.replace(/\/+$/, "") || "/";
const AUDIT_RETENTION_DAYS = 90;
const IS_LOCAL =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.protocol === "file:";
function browserSessionId() {
  const key = "tlc_browser_session";
  try {
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID().replaceAll("-", "");
      sessionStorage.setItem(key, value);
    }
    return value;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}temporary`;
  }
}
const BROWSER_SESSION_ID = browserSessionId();
const newPresenceId = () =>
  (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replaceAll(
    "-",
    "",
  );
function surveyBrowserId() {
  const key = "tlc_anonymous_survey_browser_v1";
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID().replaceAll("-", "");
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return crypto.randomUUID().replaceAll("-", "");
  }
}
const SURVEY_BROWSER_ID = surveyBrowserId();
function surveyAlreadySubmitted() {
  try {
    const submittedAt = Number(
      localStorage.getItem("tlc_anonymous_survey_submitted_at") || 0,
    );
    return submittedAt > Date.now() - 90 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
const DRAFT_KEY = "tlc_member_draft_v1";
function readDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    return draft && draft.expiresAt > Date.now() ? draft : null;
  } catch {
    return null;
  }
}
const SAVED_DRAFT = readDraft();
const state = {
  mode: "member",
  adminAuthenticated: false,
  pastoralAuthenticated: false,
  adminData: {
    records: [],
    audits: [],
    counts: {},
    pagination: {},
    operations: null,
    checkins: null,
    pastoral: null,
  },
  presenceId: newPresenceId(),
  step: 1,
  campaignStarted: false,
  journeyType: SAVED_DRAFT?.workflow?.journeyType || "",
  search: "",
  // Restore the secure session with the saved form. Previously the form draft
  // survived a refresh but its verification session did not, so the next
  // code-check reached the API without a session and returned HTTP 400.
  sessionToken: SAVED_DRAFT?.workflow?.sessionToken || "",
  results: [],
  candidates: [],
  selected: null,
  pendingUpdate: SAVED_DRAFT?.pendingUpdate || null,
  formDraft: SAVED_DRAFT?.formDraft || {},
  contactMatched: false,
  matchedDuplicateIds: [],
  duplicateCandidates: [],
  duplicateIndex: 0,
  internalReviewCount: 0,
  groupTypes: [],
  activeGroupTypeId: "",
  groupSelections: [],
  groupResults: [],
  photo: SAVED_DRAFT?.formDraft?.photo || null,
  existingPhoto: "",
  planningCenterPhoto: "",
  smallGroupSelection: null,
  otherGroupSelections: [],
  attempts: 0,
  verified: false,
  otpSent: false,
  verificationUnavailable: false,
  verificationError: "",
  deliveryMethod: "sms",
  providers: { sms: false, checked: false },
  manualReview: false,
  duplicateChoices: SAVED_DRAFT?.workflow?.duplicateChoices || {},
  lastIdentity: null,
  identityEmailMessage: "",
  completionStage: "survey",
  surveyReturnToCard: false,
  surveySkipped: false,
  surveySubmitted: surveyAlreadySubmitted(),
  surveyUnlocked: false,
  surveyData: [],
  surveyLocationFilter: "all",
  surveyCommentGroup: "barriers",
  profileFormPage: SAVED_DRAFT?.workflow?.profileFormPage || 1,
  adminPage: "Profile Reviews",
  adminSearch: "",
  adminStatusFilter: "all",
  adminSelectedRecordId: null,
  adminQueuesOpen: false,
  adminMenuOpen: false,
  adminPageNumber: 1,
  checkinLocation: (() => {
    const saved = localStorage.getItem("tlc_checkin_location");
    return saved === "Woodford"
      ? "Liberty Point Woodford"
      : saved || "Liberty Point Woodford";
  })(),
  checkinService: localStorage.getItem("tlc_checkin_service") || "Sunday Service",
  checkinNotify: false,
  checkinResult: null,
  checkinCameraActive: false,
  checkinDate: new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
  checkinHistoryLocation: "",
  checkinHistoryService: "",
  checkinHistorySearch: "",
  pastoralStatus: "active",
  updates: [
    {
      name: "Grace Osei",
      status: "Active",
      fields: "Phone, address",
      method: "2-field match",
      date: "25 Jul 2026",
      review: "Pending",
    },
    {
      name: "Daniel Edwards",
      status: "Worker",
      fields: "Team, small group",
      method: "Mock OTP",
      date: "24 Jul 2026",
      review: "Follow-up",
    },
    {
      name: "Sarah Adeyemi",
      status: "Active",
      fields: "Email",
      method: "2-field match",
      date: "23 Jul 2026",
      review: "Approved",
    },
    {
      name: "Peter Campbell",
      status: "Visitor",
      fields: "Address, consent",
      method: "3-field match",
      date: "22 Jul 2026",
      review: "Pending",
    },
  ],
  logs: [
    {
      type: "Successful",
      name: "Grace Osei",
      detail: "2 of 4 fields matched",
      time: "Today, 10:42",
    },
    {
      type: "Failed",
      name: "AT 842615",
      detail: "Attempt 2 of 3",
      time: "Today, 09:18",
    },
    {
      type: "Locked",
      name: "CM 482193",
      detail: "Manual review created",
      time: "Yesterday, 18:05",
    },
  ],
};
if (location.hash === "#survey") state.mode = "survey";
if (location.hash === "#faq") state.mode = "faq";
if (SAVED_DRAFT?.workflow) Object.assign(state, SAVED_DRAFT.workflow);
if (
  state.step === 6 &&
  !state.pendingUpdate &&
  Object.keys(state.formDraft || {}).length
)
  state.pendingUpdate = { ...state.formDraft };
function saveDraft() {
  try {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        expiresAt: Date.now() + 7200000,
        formDraft: state.formDraft,
        pendingUpdate: state.pendingUpdate,
        workflow: {
          step: state.step,
          search: state.search,
          sessionToken: state.sessionToken,
          selected: state.selected,
          manualReview: state.manualReview,
          verified: state.verified,
          otpSent: state.otpSent,
          verificationUnavailable: state.verificationUnavailable,
          deliveryMethod: state.deliveryMethod,
          matchedDuplicateIds: state.matchedDuplicateIds,
          duplicateCandidates: state.duplicateCandidates,
          duplicateChoices: state.duplicateChoices,
          duplicateIndex: state.duplicateIndex,
          internalReviewCount: state.internalReviewCount,
          groupSelections: state.groupSelections,
          activeGroupTypeId: state.activeGroupTypeId,
          profileFormPage: state.profileFormPage,
          journeyType: state.journeyType,
        },
      }),
    );
  } catch {}
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
  state.formDraft = {};
}
function resetMemberJourney() {
  Object.assign(state, {
    step: 1,
    campaignStarted: false,
    journeyType: "",
    search: "",
    sessionToken: "",
    results: [],
    candidates: [],
    selected: null,
    pendingUpdate: null,
    lastIdentity: null,
    identityEmailMessage: "",
    completionStage: "survey",
    surveyReturnToCard: false,
    surveySkipped: false,
    contactMatched: false,
    matchedDuplicateIds: [],
    duplicateCandidates: [],
    duplicateIndex: 0,
    internalReviewCount: 0,
    groupTypes: [],
    activeGroupTypeId: "",
    groupSelections: [],
    groupResults: [],
    photo: null,
    existingPhoto: "",
    planningCenterPhoto: "",
    profileFormPage: 1,
    attempts: 0,
    verified: false,
    otpSent: false,
    verificationUnavailable: false,
    verificationError: "",
    deliveryMethod: "sms",
    manualReview: false,
    duplicateChoices: {},
    presenceId: newPresenceId(),
  });
  clearDraft();
}
function restartJourneyChoice() {
  Object.assign(state, {
    step: 1,
    journeyType: "",
    search: "",
    sessionToken: "",
    selected: null,
    pendingUpdate: null,
    contactMatched: false,
    matchedDuplicateIds: [],
    duplicateCandidates: [],
    duplicateIndex: 0,
    attempts: 0,
    verified: false,
    otpSent: false,
    verificationUnavailable: false,
    manualReview: false,
    groupSelections: [],
    groupResults: [],
    photo: null,
    existingPhoto: "",
    planningCenterPhoto: "",
    profileFormPage: 1,
  });
  clearDraft();
  state.campaignStarted = true;
  render();
  scrollTo(0, 0);
}
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const searchKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
function maskName(m) {
  let n = `${m.preferredName || m.firstName} ${m.lastName}`;
  return (
    n.slice(0, 9) +
    "•".repeat(Math.min(10, Math.max(4, n.length - 11))) +
    n.slice(-3)
  );
}
function maskEmail(s) {
  if (!s) return "Not provided";
  let [a, b] = s.split("@");
  return a.slice(0, Math.min(4, a.length)) + "••••@" + b;
}
function maskPhone(s) {
  return s ? s.slice(0, 2) + "••••••" + s.slice(-3) : "Not provided";
}
function maskAddress(m) {
  return m.addressLine1
    ? `${m.postcode ? m.postcode.slice(0, 3) + " •••" : "Postcode missing"}, ${m.addressLine1.split(" ")[1] || ""} ${m.addressLine1.split(" ").slice(2).join(" ").slice(0, 1)}••••`
    : "Not provided";
}
function badge(v) {
  const c = /Needs|Pending|Incomplete/.test(v)
    ? "warn"
    : /Locked|Failed|Inactive/.test(v)
      ? "red"
      : /Updated|Follow/.test(v)
        ? "blue"
        : "";
  return `<span class="badge ${c}">${esc(v)}</span>`;
}
function header() {
  return `<header class="topbar member-topbar"><div class="member-wordmark">${campaignWordmark()}<span class="member-care-title">YouCount</span></div><button class="journey-close" id="profileClose" aria-label="Close profile update"><span>Close</span> ×</button></header>`;
}
function stepper(n) {
  return `<div class="stepper">${[1, 2, 3, 4, 5, 6, 7].map((x) => `<i class="${x <= n ? "on" : ""}"></i>`).join("")}</div>`;
}
function maskEnteredName(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .map((part) =>
      part.length <= 4
        ? `${part[0] || ""}${"•".repeat(Math.max(1, part.length - 2))}${part.at(-1) || ""}`
        : `${part[0]}•••${part.slice(-3)}`,
    )
    .join(" ");
}
function audit(type, name, detail) {
  state.logs.unshift({
    type,
    name: name || "Anonymous",
    detail,
    time: new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
}
function member() {
  if (state.step === 1) return campaignHome();
  const profileEditing = state.step === 5,
    completionPage = state.step >= 7,
    intro = profileEditing || completionPage
      ? ""
      : `<section class="member-copy"><span class="eyebrow">Your details, safely handled</span><h2>${["", "Enter your name", "Confirm two details", "Check your messages", "Is this you?", "Complete your profile", "One last check", "All done"][state.step]}</h2><p class="lede">${["", "Start with your full name.", "Re-enter details you already know. We never display them.", "Enter the final verification code.", "Confirm before we show the editable profile.", state.manualReview ? "Share your current details so our team can safely match your profile." : "Review your details and complete anything that is missing.", state.manualReview ? "Our team will safely match your submission." : "Similar records are always reviewed by a person.", "Thank you for helping us care well."][state.step]}</p></section>`;
  return `<div class="app ${profileEditing ? "profile-editing" : ""} ${completionPage ? "completion-page" : ""}">${header()}<main class="member-shell"><div class="member-grid">${intro}<section class="portal-card">${completionPage ? "" : completionProgress("profile", false)}${profileEditing || completionPage ? "" : `${stepper(state.step)}${state.step > 1 ? `<button class="step-back" id="stepBack" aria-label="Go back one step">← Back</button>` : ""}`}${memberStep()}</section></div></main><button class="admin-dot" id="adminDot" aria-label="Staff access" title="Staff access"></button></div>`;
}
function campaignHome() {
  if (!state.campaignStarted)
    return `<div class="app campaign-home"><main class="campaign-hero campaign-welcome"><div class="campaign-shade"></div><header class="campaign-header campaign-welcome-header">${campaignWordmark()}</header><section class="campaign-welcome-copy"><h1>YouCount<span>.</span></h1><div class="campaign-typing-wrap"><span class="campaign-typed" aria-hidden="true">You matter. You are seen.</span><span class="sr-only">You matter. You are seen.</span></div><div class="campaign-entry-actions"><button class="campaign-continue" id="campaignContinue">Get my YouCount Number <span aria-hidden="true">→</span></button><button class="campaign-survey-link" id="openSurvey">Church health survey</button><button class="campaign-survey-link" id="openFaq">Questions? Read the FAQ</button></div></section><p class="campaign-private">Private, secure and designed for your phone.</p></main><button class="admin-dot campaign-admin-dot" id="adminDot" aria-label="Staff access" title="Staff access"></button></div>`;
  if (!state.journeyType)
    return `<div class="app campaign-home"><main class="campaign-hero campaign-form-stage"><div class="campaign-shade"></div><header class="campaign-header">${campaignWordmark()}<button class="journey-close" id="profileClose" aria-label="Close profile update"><span>Close</span> ×</button></header><section class="campaign-form-panel journey-choice-panel"><span class="campaign-kicker">Before we begin</span><h1>Which best describes you?</h1><p>This helps us give you the right, shortest journey.</p><div class="journey-choices"><button data-journey="member"><b>I am a TLC member</b><span>I have completed Connect.</span></button><button data-journey="attendee"><b>I attend TLC</b><span>I have not completed Connect, or I’m unsure.</span></button><button data-journey="visitor"><b>I’m new or visiting</b><span>I’m attending TLC for the first time or still exploring.</span></button></div><small>You can correct this choice before submitting.</small>${privacyNotice(true)}</section></main><button class="admin-dot campaign-admin-dot" id="adminDot" aria-label="Staff access" title="Staff access"></button></div>`;
  return `<div class="app campaign-home"><main class="campaign-hero campaign-form-stage"><div class="campaign-shade"></div><header class="campaign-header">${campaignWordmark()}<button class="journey-close" id="profileClose" aria-label="Close profile update"><span>Close</span> ×</button></header><section class="campaign-form-panel"><span class="campaign-kicker">Your profile matters</span><h1>Let’s begin with your name.</h1><p>Use the first name you registered with at TLC. A short form is fine, such as Tolu for Toluwalope, Funmi for Olufunmilayo, Chi for Chioma or Sam for Samuel.</p><div class="field searchbox"><span>⌕</span><input id="search" placeholder="First name or short form" value="${esc(state.search)}" autocomplete="name" aria-label="First name or short form used at TLC"></div><button class="btn full" id="searchBtn">Continue securely <span aria-hidden="true">→</span></button><small>The short name must contain at least 3 characters from your registered first name. No member list is shown.</small>${privacyNotice(true)}</section></main><button class="admin-dot campaign-admin-dot" id="adminDot" aria-label="Staff access" title="Staff access"></button></div>`;
}
function campaignWordmark() {
  return `<div class="campaign-wordmark"><img src="/assets/youcount-card/logo-white.png" alt="The Liberty Church"></div>`;
}
function privacyNotice(compact = false) {
  return `<details class="data-privacy ${compact ? "compact" : ""}"><summary>How we use and protect your information</summary><div><p><b>What we collect:</b> Your contact, identity, residence, background, family connections at TLC, date of birth, skills, baptism, church involvement, profile photo and the updates you submit.</p><p><b>Why:</b> To keep church records accurate, support member care and communication, maintain your YouCount identity and develop relevant opportunities.</p><p><b>Who can access it:</b> Authorised Data Team members of The Liberty Church Global only.</p><p><b>How it is protected:</b> Your information is securely stored, encrypted where appropriate, and accessible only to authorised church staff. If you use the postcode finder, the postcode is securely checked by a trusted address-lookup supplier to return address choices. We use appropriate technical and organisational safeguards to protect your information from unauthorised access, loss or misuse.</p><p><b>How long:</b> Profile submissions and photos are retained securely while needed for member identity and data care. Security audit events are retained for 90 days. Anonymous church-health survey answers are stored separately and removed after 90 days.</p><p>Questions? <a href="mailto:${DATA_TEAM_EMAIL}">${DATA_TEAM_EMAIL}</a></p></div></details>`;
}
function communicationMethodField() {
  const selected = Array.isArray(state.formDraft?.communicationPreference)
    ? state.formDraft.communicationPreference
    : String(state.formDraft?.communicationPreference || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  const options = ["Email", "SMS / text message", "Phone call", "WhatsApp", "Postal mail"];
  return `<fieldset class="field communication-methods"><legend>How may we contact you? <span class="required-mark">Required</span></legend><p class="hint">Choose all that apply.</p><div class="checkbox-grid">${options.map((value) => `<label><input type="checkbox" name="communicationPreference" value="${value}" ${selected.includes(value) ? "checked" : ""}><span>${value}</span></label>`).join("")}</div><p class="communication-error" role="alert" hidden>Choose at least one contact method.</p></fieldset>`;
}
const FAQS = [
  ["What is YouCount?", "YouCount is how The Liberty Church keeps its member records accurate. You confirm or update your details once and receive a YouCount Number, which is yours for life."],
  ["How do I get my YouCount Number?", "Tap “Get my YouCount Number”, enter your name, then confirm the last three digits of your phone number and your full email address. We send you a one-time code, and once it is confirmed you can check and update your profile."],
  ["Why do you ask me to verify who I am?", "To protect your information. We never show a list of members or confirm whether a record exists, and your profile only opens after you enter the one-time code sent to your email or phone."],
  ["My one-time code has not arrived. What should I do?", `Check your spam or junk folder and wait a minute before asking for a new code. If it still does not arrive, choose to contact the Data Team on that screen or email <a href="mailto:${DATA_TEAM_EMAIL}">${DATA_TEAM_EMAIL}</a>.`],
  ["When will my changes appear in church records?", "Your updates are reviewed by the Data Team before church records are changed, so they may not appear straight away."],
  ["I have lost my YouCount Number.", `We email your YouCount Number when you complete your profile, so search your inbox for it first. If you cannot find it, contact <a href="mailto:${DATA_TEAM_EMAIL}">${DATA_TEAM_EMAIL}</a>.`],
  ["Who can see my information?", "Only authorised members of the Data Team at The Liberty Church Global. Your information is stored securely and is never shown to other members."],
  ["Is the church health survey anonymous?", "Yes. It does not ask for your name, contact details or YouCount Number, and your answers are kept apart from your profile. Responses are deleted after 90 days."],
  ["I used a shared or church phone. Is my information left on it?", "When you finish, tap “Start again”. This clears your details from the phone, ready for the next person."],
];
function faqList() {
  return `<div class="faq-list">${FAQS.map(([question, answer]) => `<details class="faq-item"><summary>${question}</summary><p>${answer}</p></details>`).join("")}</div><div class="notice faq-contact"><b>Still have a question?</b> Email the Data Team at <a href="mailto:${DATA_TEAM_EMAIL}">${DATA_TEAM_EMAIL}</a>.</div>`;
}
function faqPage() {
  return `<div class="survey-page"><header>${campaignWordmark()}<button class="journey-close" id="faqClose" aria-label="Close FAQ"><span>Close</span> ×</button></header><main class="survey-card"><span class="campaign-kicker">Frequently asked questions</span><h1>Questions, answered.</h1><p class="survey-intro">Everything you need to know about YouCount, your number and how we look after your information.</p>${faqList()}<button class="btn full" id="faqHome">Return home</button></main></div>`;
}
function faqHelp() {
  return `<button class="faq-fab" id="faqFab" aria-haspopup="dialog"><i aria-hidden="true">?</i>Help</button><dialog class="faq-sheet" id="faqSheet" aria-labelledby="faqSheetTitle"><header><div><span class="campaign-kicker">Need help?</span><h2 id="faqSheetTitle">Questions, answered.</h2></div><button id="faqSheetClose" aria-label="Close help">×</button></header>${faqList()}</dialog>`;
}
function surveyScale(name, label) {
  return `<fieldset class="survey-question"><legend>${label}</legend><div class="survey-scale">${[5, 4, 3, 2, 1].map((value) => `<label><input type="radio" name="${name}" value="${value}" required><span>${value}</span></label>`).join("")}</div><div class="survey-scale-labels"><span>Strongly agree</span><span>Strongly disagree</span></div></fieldset>`;
}
function surveyPage() {
  if (state.surveySubmitted)
    return `<div class="survey-page"><header>${campaignWordmark()}</header><main class="survey-card survey-thanks">${state.surveyReturnToCard ? completionProgress("card", true) : ""}<div class="success-icon">✓</div><span class="campaign-kicker">Thank you</span><h1>Your voice counts.</h1><p>Your anonymous response has been received. It is not attached to your profile and will be removed after 90 days.</p><button class="btn" id="surveyHome">Return home</button></main></div>`;
  return `<div class="survey-page"><header>${campaignWordmark()}<button class="journey-close" id="surveyClose" aria-label="Close survey"><span>Close</span> ×</button></header><main class="survey-card">${state.surveyReturnToCard ? completionProgress("survey", false) : ""}<span class="campaign-kicker">Church health survey</span><h1>Help us listen well.</h1><p class="survey-intro">This survey is anonymous. We do not ask for your name, contact details or YouCount Number, and your answers are not attached to your profile. Responses are available only to the authorised survey team and are deleted after 90 days.</p><form id="healthSurvey"><div class="field"><label>Location</label><select name="campus"><option value="">Choose a location</option><option>Liberty Point Woodford</option><option>Canary Wharf</option><option>Croydon</option><option>Birmingham</option><option>Lagos</option><option>Houston</option><option>e-TLC</option></select></div>${surveyScale("belonging", "I feel that I belong at The Liberty Church.")}${surveyScale("spiritualGrowth", "TLC is helping me grow spiritually.")}${surveyScale("worship", "Our worship services help me engage with God.")}${surveyScale("pastoralCare", "I know how to access pastoral care when I need it.")}${surveyScale("groups", "I have meaningful opportunities to build relationships.")}${surveyScale("serving", "I have meaningful opportunities to use my gifts and serve.")}${surveyScale("communication", "Church communication is clear and useful.")}${surveyScale("safety", "I feel safe, respected and able to raise concerns.")}${surveyScale("recommend", "I would recommend TLC to someone looking for a church.")}<div class="field"><label>What makes it harder to connect, grow or participate?</label><textarea name="barriers" rows="3" placeholder="Share only what you are comfortable sharing"></textarea></div><div class="field"><label>What should the church strengthen or improve?</label><textarea name="support" rows="3"></textarea></div><div class="field"><label>Anything else you would like leadership to hear?</label><textarea name="comments" rows="4"></textarea></div><div class="notice survey-warning"><b>Please do not include your name or contact details.</b> Because this survey is anonymous, we cannot respond personally. Contact the Data Team or pastoral team directly if you need support.</div><button class="btn full" id="surveySubmit">Submit anonymous survey</button></form></main></div>`;
}
function visitorFormMarkup() {
  const firstName =
      state.formDraft.firstName || state.selected?.firstName || "",
    lastName = state.formDraft.lastName || state.selected?.lastName || "";
  return `<div class="visitor-intro"><span class="campaign-kicker">Welcome to TLC</span><h3>Tell us a little about you.</h3><p>This shorter form helps us welcome you without asking for member-only information.</p><div class="journey-summary"><span>New or visiting TLC</span><button type="button" id="changeJourney">Change</button></div></div>${privacyNotice()}<form id="updateForm" class="visitor-form"><div class="form-grid"><div class="profile-section-title"><b>Your details</b><span>Fields marked required help us contact you. The background and address questions are optional.</span></div><div class="field"><label>First name</label><input name="firstName" autocomplete="given-name" value="${esc(firstName)}" required></div><div class="field"><label>Last name</label><input name="lastName" autocomplete="family-name" value="${esc(lastName)}" required></div><div class="field"><label>Mobile number</label><input name="phone" type="tel" autocomplete="tel" value="${esc(state.formDraft.phone || "")}" required></div><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" value="${esc(state.formDraft.email || "")}" required></div><div class="profile-section-title"><b>About you</b><span>These details are optional and help us understand the people visiting TLC.</span></div><div class="field"><label>Gender <span class="optional">Optional</span></label><select name="gender"><option value="">Choose one</option><option>Female</option><option>Male</option></select></div><div class="field"><label>Country of origin <span class="optional">Optional</span></label><select name="countryOfOrigin" autocomplete="country-name">${countryOptions()}</select></div><div class="field"><label>Ethnicity <span class="optional">Optional</span></label><select name="ethnicity"><option value="">Choose one</option>${ETHNICITY_OPTIONS.map((value) => `<option>${value}</option>`).join("")}</select><p class="hint">Country of origin is collected separately from ethnic background.</p></div><div class="profile-section-title"><b>Where you live</b><span>You can use the postcode finder or enter the address yourself.</span></div><div class="field"><label>Country of residence <span class="optional">Optional</span></label><select name="countryOfResidence" autocomplete="country-name">${countryOptions()}</select></div><div class="field postcode-field"><label>Postcode / ZIP code <span class="optional">Optional</span></label><input name="postcode" autocomplete="postal-code" inputmode="text" placeholder="Start typing your postcode"></div><div class="field"><label>Residential address <span class="optional">Optional</span></label><input name="addressLine1" autocomplete="street-address" placeholder="Choose an address or type it here"></div><div class="profile-section-title"><b>Your visit</b><span>A few details to help us welcome and support you.</span></div><div class="field"><label>TLC location attended</label><select name="tlcLocation" required><option value="">Choose one</option>${TLC_LOCATIONS.map((value) => `<option>${value}</option>`).join("")}</select></div><div class="field"><label>Is this your first visit?</label><select name="firstVisit" required><option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option></select></div><div class="field"><label>How did you hear about TLC?</label><select name="heardAbout" required><option value="">Choose one</option><option>Invited by someone</option><option>Social media</option><option>Online search</option><option>Event or conference</option><option>Passed by a TLC location</option><option>Other</option></select></div><div class="field" id="visitorInvitedBy" hidden><label>Who invited you?</label><input name="invitedBy" placeholder="Enter their name"></div><div class="field"><label>Would you like information about Connect?</label><select name="connectInterest" required><option value="">Choose one</option><option value="yes">Yes, please</option><option value="no">Not right now</option><option value="unsure">I’m not sure yet</option></select></div><div class="field"><label>Preferred communication method</label><select name="communicationPreference" required><option value="">Choose one</option><option>Email</option><option>SMS / text message</option><option>Phone call</option><option>WhatsApp</option><option>Essential messages only</option></select></div><div class="field"><label>Communication consent</label><select name="consent" required><option value="">Choose one</option><option>Yes, keep me informed</option><option>Essential messages only</option><option>No, thank you</option></select></div><input type="hidden" name="membershipStatus" value="visitor"><input type="hidden" name="connectCompleted" value="no"></div><div class="notice"><b>Your number is yours to keep.</b><br>We’ll issue a YouCount Number now. Your card becomes available after Connect is confirmed.</div><button class="btn full">Review my details →</button></form>`;
}
function memberStep() {
  const m = state.selected;
  if (state.step === 1)
    return `<h3>Enter your name</h3><p class="hint">Use the first name you registered with at TLC. A short form is fine, such as Tolu for Toluwalope, Funmi for Olufunmilayo, Chi for Chioma or Sam for Samuel.</p><div class="field searchbox"><span>⌕</span><input id="search" placeholder="First name or short form" value="${esc(state.search)}" autocomplete="name" aria-label="First name or short form used at TLC"></div><button class="btn full" id="searchBtn">Continue</button><p class="privacy">The short name must contain at least 3 characters from your registered first name. No member list is shown.</p>`;
  if (state.step === 2)
    return `<div class="masked minimal-profile"><strong>${esc(maskEnteredName(state.search))}</strong></div><h3>Confirm details you already know</h3><p class="hint">Enter the final three digits of your phone and your complete email address. We do not display anything held in the church system.</p><form id="contactForm"><div class="form-grid"><div class="field"><label>Last 3 phone digits</label><input id="phoneLast3" inputmode="numeric" maxlength="3" pattern="[0-9]{3}" placeholder="e.g. 432" required></div><div class="field"><label>Full email address</label><input id="emailConfirm" type="email" autocomplete="email" placeholder="you@example.com" required></div></div><button class="btn full">Continue</button></form><p class="privacy">We return the same response for matching and non-matching details.</p>`;
  if (state.step === 3) {
    const locked = state.attempts >= 3;
    if (state.verificationUnavailable)
      return `<div class="verification-unavailable"><span class="campaign-kicker">Automatic verification unavailable</span><h3>We couldn’t verify the details entered.</h3><p class="lede">They may differ from the information currently held. For your protection, we cannot display or confirm a profile without successful text-message verification.</p><div class="notice"><b>You can still continue.</b><br>Check the details and try again, or send your current information securely for the data team to review.</div><div class="verification-options"><button class="btn secondary full" id="retryEvidence">Check and try again</button><button class="btn full" id="manualRoute">Continue without verification</button></div></div>`;
    if (!state.otpSent) {
      const smsReady = IS_LOCAL || state.providers.sms;
      return `<h3>Verify by text message</h3><p class="hint">We’ll send a six-digit verification code to the phone already on file. We never display the number held in the church system.</p><button class="btn full" id="sendOtp" ${smsReady ? "" : "disabled"}>Send text verification code</button><div class="changed-details"><p><b>Can’t use the phone number on file?</b><br><span class="hint">Choose this only if you no longer have access to that number. You can submit your current details securely for the Data Team to review.</span></p><button class="btn ghost full" id="manualRoute">Continue without text verification</button></div>`;
    }
    return `<h3>Enter your verification code</h3><p class="hint">If all details matched, a six-digit code was sent by text message. We don’t confirm whether a record exists.</p>${state.verificationError ? `<div class="notice red" role="alert">${esc(state.verificationError)}</div>` : ""}${state.attempts ? `<div class="notice ${locked ? "red" : ""}">${locked ? "This session is locked after three attempts. Use the alternative route below." : `We couldn’t complete verification. ${3 - state.attempts} ${3 - state.attempts === 1 ? "try" : "tries"} remaining.`}</div>` : ""}${IS_LOCAL ? `<div class="notice green">Local interface preview. Production sends a real provider code.</div>` : ""}<div class="actions"><input class="input otp-input" id="otp" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" aria-label="Six-digit verification code" placeholder="6-digit code"><button class="btn secondary" id="otpBtn" ${locked ? "disabled" : ""}>Verify code</button></div><button class="btn ghost full" id="resendOtp" style="margin-top:9px" ${locked ? "disabled" : ""}>Send another code</button><div class="changed-details"><p><b>Didn’t receive the text or changed your number?</b><br><span class="hint">You can submit your current details securely for the Data Team to match and review. Your existing record stays hidden.</span></p><button class="btn ghost full" id="manualRoute">Continue without text verification</button></div>`;
  }
  if (state.step === 4) {
    const confirmedName = [m?.firstName, m?.lastName].filter(Boolean).join(" ") || "Your TLC profile",
      confirmedLocation = m?.tlcLocation || m?.homeLocation || "";
    return `<div class="success identity-confirmation"><span class="campaign-kicker">Verification complete</span>${state.existingPhoto ? `<img class="identity-confirmation-photo" src="${esc(state.existingPhoto)}" alt="Profile photograph for ${esc(confirmedName)}">` : `<div class="identity-confirmation-initials" aria-hidden="true">${esc(confirmedName.split(/\s+/).map((part) => part[0]).slice(0, 2).join(""))}</div>`}<h3>Is this you?</h3><strong>${esc(confirmedName)}</strong>${confirmedLocation ? `<p>${esc(confirmedLocation)}</p>` : ""}<p class="lede">Confirm before we open this profile.</p><div class="verification-options"><button class="btn full" id="thisIsMe">Yes, continue</button><button class="btn ghost full" id="notMe">No, this isn’t me</button></div></div>`;
  }
  if (state.step === 5) {
    if (state.journeyType === "visitor") return visitorFormMarkup();
    const value = (k) =>
      state.manualReview
        ? k === "firstName"
          ? m.firstName
          : k === "lastName"
            ? m.lastName
            : ""
        : m[k];
    return `<h3>${state.manualReview ? "Share your current details" : "Review your profile"}</h3><p class="hint">${state.manualReview ? "Complete each section so our data team can safely find and review your profile." : "Work through each section, check what is already there and fill in anything missing."}</p>${privacyNotice()}<form id="updateForm"><div class="form-grid">${field("First name", "firstName", value("firstName"))}${field("Last name", "lastName", value("lastName"))}${field("Preferred name", "preferredName", value("preferredName"))}${selectField("Gender", "gender", ["", "Female", "Male", "Prefer not to say", "Self-describe"], value("gender"))}${field("Current email", "email", value("email"))}${field("Current phone", "phone", value("phone"))}${field("Postcode", "postcode", value("postcode"))}${field("Residential address", "addressLine1", value("addressLine1"))}<div class="field"><label>Preferred communication method</label><select name="communicationPreference"><option value="">Choose one</option><option>Email</option><option>SMS / text message</option><option>Phone call</option><option>WhatsApp</option><option>Postal mail</option><option>Essential messages only</option><option>No communications</option></select></div><div class="field"><label>Communication consent</label><select name="consent"><option>Yes, keep me informed</option><option>Essential messages only</option><option>No, thank you</option></select></div></div><div class="group-picker-section"></div><div class="field serving-section"><label>Teams you currently serve in</label><p class="hint">Type the team name as you know it. Add another field if you serve in more than one team.</p><div id="servingTeams"><div class="team-entry"><input name="servingTeams" placeholder="e.g. Welcome Team"><button type="button" class="remove-team" aria-label="Remove team">×</button></div></div><button type="button" class="btn ghost add-team" id="addTeam">+ Add another team</button></div><button class="btn full">Save and continue</button></form>`;
  }
  if (state.step === 6) {
    const review = memberReviewCard();
    if (state.journeyType === "visitor")
      return `${review}<div class="notice green"><b>Ready when you are.</b><br>Check that these details are correct. You’ll receive a YouCount Number after submitting.</div><button class="btn full" id="submitFinal">Submit my details</button><p class="privacy">Your details will appear in the separate visitor review queue for the authorised data team.</p>`;
    if (state.manualReview)
      return `${review}<div class="notice green"><b>Ready for the data team.</b><br>We have not displayed or changed the existing profile. The team will safely match your request in Planning Center.</div><button class="btn full" id="submitFinal">Send to data team</button><p class="privacy">No possible records are shown without verification.</p>`;
    if (state.duplicateCandidates.length) {
      const d = state.duplicateCandidates[state.duplicateIndex],
        choice = state.duplicateChoices[d.id];
      return `${review}<p class="hint">We found another possible profile using the details you verified. We show only one candidate at a time.</p><div class="duplicate-card single-candidate"><div class="masked minimal-profile"><strong>${esc(maskEnteredName(d.name))}</strong><p>Profile status: ${esc(d.status)}</p><p>${d.updatedAt ? `Last updated: ${new Date(d.updatedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : "Update date unavailable"}</p></div><p><b>Does this profile also belong to you?</b></p><div class="choice-row">${["This is also me", "This is not me", "I’m not sure"].map((label, index) => `<button class="choice ${choice === index ? "active" : ""}" data-choice="${index}" data-id="${esc(d.id)}">${label}</button>`).join("")}</div><div class="candidate-progress">Possible profile ${state.duplicateIndex + 1} of ${state.duplicateCandidates.length}</div></div><div class="actions">${state.duplicateIndex > 0 ? `<button class="btn ghost" id="previousDuplicate">Previous</button>` : ""}${state.duplicateIndex < state.duplicateCandidates.length - 1 ? `<button class="btn secondary" id="nextDuplicate" ${choice === undefined ? "disabled" : ""}>Next profile</button>` : `<button class="btn" id="submitFinal" ${choice === undefined ? "disabled" : ""}>Submit for review</button>`}</div><p class="privacy">Records are never merged automatically. The data team makes the final decision in Planning Center.</p>`;
    }
    return `${review}${state.internalReviewCount ? `<div class="notice"><b>We may have found another record for the data team to review.</b><br>For your privacy, we do not display contactless or weakly matched profiles here.</div>` : `<div class="notice green">Your update is ready for review.</div>`}<button class="btn full" id="submitFinal">Submit for review</button><p class="privacy">Records are never merged automatically.</p>`;
  }
  return memberSuccessMarkup();
}
function completionProgress(active = "survey", surveyDone = false) {
  const steps = [
    ["profile", "Profile"],
    ["survey", "Survey"],
    ["card", "Your card"],
  ];
  const activeIndex = steps.findIndex(([key]) => key === active);
  return `<div class="completion-progress" aria-label="YouCount journey progress"><b>${active === "card" && surveyDone ? "All 3 steps done" : `Step ${activeIndex + 1} of 3`}</b><div>${steps.map(([key, label], index) => { const done = index < activeIndex || (key === "survey" && surveyDone); const status = key === active && !done ? "Now" : done ? "Done" : "Next"; return `<section class="${done ? "done" : key === active ? "now" : "next"}"><i></i><strong>${label}</strong><span>${done ? "✓ " : ""}${status}</span></section>`; }).join("")}</div></div>`;
}
function memberSuccessMarkup() {
  const identity = state.lastIdentity,
    verified = Boolean(identity?.walletEligible),
    changes = state.pendingUpdate || {},
    memberName = `${changes.firstName || ""} ${changes.lastName || ""}`.trim() || "TLC member",
    isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    isDesktop = !isMobile;
  if (state.completionStage !== "card")
    return `<div class="success identity-success completion-journey">${completionProgress("survey", false)}<div class="completion-confirmation"><i>✓</i><span><b>Profile saved.</b> We’ve emailed you your YouCount number.</span></div><span class="campaign-kicker">Share your voice</span><h2>Tell us honestly how church life is for you.</h2><p class="lede">The survey is anonymous. Your answers are kept apart from your profile.</p><button class="btn full" id="takeSurvey">Start the survey</button><button class="completion-quiet-link" id="skipSurvey">Skip for now and get my card</button></div>`;
  const publicIdParts = String(identity?.publicId || "").trim().split(/\s+/),
    cardRoleCode = publicIdParts.length > 1 ? publicIdParts.shift() : "YC",
    cardNumber = publicIdParts.join(" ") || String(identity?.publicId || ""),
    cardPreview = identity ? `<div class="youcount-card-preview"><img src="/assets/youcount-card/logo-white.png" alt="The Liberty Church"><span><b>YouCount</b><small>Counted ${new Date().getFullYear()}</small></span><div><div class="youcount-card-number"><em>${esc(cardRoleCode)}</em><b>${esc(cardNumber)}</b></div><strong>${esc(memberName)}</strong><small>${esc(changes.tlcLocation || "The Liberty Church")}</small></div></div>` : "";
  const apple = verified ? `<form method="post" action="/api/apple-pass" class="wallet-pass-form"><input type="hidden" name="session" value="${esc(state.sessionToken)}"><button class="apple-wallet-button" type="submit"><span></span> Add to Apple Wallet</button></form>` : "";
  const google = verified ? `<form method="post" action="/api/google-wallet" class="wallet-pass-form google-wallet-form"><input type="hidden" name="session" value="${esc(state.sessionToken)}"><button class="google-wallet-button" type="submit" aria-label="Add to Google Wallet"><img src="/assets/google-wallet/add-to-google-wallet-en-gb.png" width="283" height="50" alt="Add to Google Wallet"></button><p class="wallet-action-status" role="status" aria-live="polite"></p></form>` : "";
  const desktopQr = verified && isDesktop ? `<div class="wallet-page-qr"><img src="/assets/youcount-phone-qr.png" alt="QR code to open YouCount on a phone"><span>Open YouCount on your phone</span></div>` : "";
  const identityContent = identity ? `${cardPreview}${verified ? `<div class="wallet-actions">${apple}${google}${desktopQr}</div>` : `<p class="completion-connect-note">Complete Connect to unlock your digital YouCount Card.</p>`}<button class="completion-email-link" id="resendIdentityEmail">Email my number to me</button>${state.identityEmailMessage ? `<p class="identity-email-message" role="status">${esc(state.identityEmailMessage)}</p>` : ""}` : `<div class="notice green">The Data Team will match your submission and confirm your YouCount identity.</div>`;
  return `<div class="success identity-success completion-journey completion-card-screen">${completionProgress("card", state.surveySubmitted)}<span class="campaign-kicker">You’re counted.</span><h2>Thank you, ${esc(changes.firstName || "")}.</h2><p class="lede">This number is yours for life.</p>${identityContent}${state.surveySkipped && !state.surveySubmitted ? `<button class="completion-quiet-link" id="takeSurvey">Take the survey</button>` : ""}<button class="btn ghost full" id="restart">Start again</button><p class="completion-reset-note">Clears your details from this phone, ready for the next person.</p></div>`;
}
function memberReviewCard() {
  const changes = state.pendingUpdate || {},
    hidden = new Set(["photo", "groups", "smallGroup", "otherGroups", "ethnicityCode", "ethnicityVariant", "ethnicityOther"]),
    rows = Object.entries(changes).filter(
      ([key, value]) =>
        !hidden.has(key) &&
        value !== "" &&
        value != null &&
        (!Array.isArray(value) || value.length),
    );
  return `<section class="member-review"><div><span class="campaign-kicker">Final review</span><h3>Check your information</h3><p>Review everything before submitting it to the data team.</p></div><button class="btn ghost" id="editProfile">Edit details</button><div class="member-review-grid">${rows.map(([key, value]) => `<div><span>${esc(adminLabels[key] || key)}</span><b>${key === "ethnicity" ? esc(ethnicityDisplay(value, changes.ethnicityVariant, changes.ethnicityOther)) : typeof value === "object" ? esc(Array.isArray(value) ? value.map((item) => item.name || item).join(", ") : value.name || "Provided") : esc(value)}</b></div>`).join("")}</div></section>`;
}
function field(label, name, value) {
  return `<div class="field ${value ? "" : "missing"}"><label>${label}</label><input name="${name}" value="${esc(value)}"></div>`;
}
function selectField(label, name, options, value) {
  return `<div class="field ${value ? "" : "missing"}"><label>${label}</label><select name="${name}">${options.map((x) => `<option ${x === value ? "selected" : ""}>${x || "Choose one"}</option>`).join("")}</select></div>`;
}
function groupChip(group) {
  return group
    ? `<span class="group-chip" data-selected-group-id="${esc(group.id)}"><span><b>${esc(group.name)}</b><small>${esc(group.typeName)} · ${esc(group.location)}</small></span><button type="button" data-remove-group data-group-id="${esc(group.id)}" aria-label="Remove ${esc(group.name)}">×</button></span>`
    : "";
}

function isSmallGroup(group) {
  return /^small groups?$/i.test(String(group?.typeName || "").trim());
}

function isTeamGroup(group) {
  return (
    group?.selectionKind === "team" ||
    (!isSmallGroup(group) &&
      /team|department|serv|ministry/i.test(String(group?.typeName || "")))
  );
}

function isTeamType(type) {
  return /team|department|serv|ministry|volunteer/i.test(
    String(type?.name || ""),
  );
}
function masked(m) {
  return `<div class="masked"><strong>${maskName(m)}</strong><p>Email: ${maskEmail(m.email)}</p><p>Phone: ${maskPhone(m.phone)}</p><p>Address: ${maskAddress(m)}</p></div>`;
}
function admin() {
  const nav = [
    "Profile Reviews",
    "Live Operations",
    "Check-ins",
    "Pastoral Care",
    "Updated Records",
    "Confirmed Duplicates",
    "Visitors",
    "Escalated Cases",
    "Audit Log",
    "Health Survey",
  ];
  const records = state.adminData.records || [],
    serverCounts = state.adminData.counts || {},
    counts = {
      "Profile Reviews": [
        "profile_update",
        "possible_duplicate",
        "visitor",
        "manual_review",
      ].reduce((total, key) => total + Number(serverCounts[key] || 0), 0),
      "Live Operations": Number(
        state.adminData.operations?.summary?.active || 0,
      ),
      "Check-ins": Number(state.adminData.checkins?.total || 0),
      "Pastoral Care": Number(
        (state.adminData.pastoral?.cases || []).filter((item) => ["open", "contacted"].includes(item.status)).length,
      ),
      "Updated Records":
        serverCounts.profile_update ??
        records.filter((r) => r.kind === "profile_update").length,
      "Confirmed Duplicates":
        serverCounts.possible_duplicate ??
        records.filter((r) => r.kind === "possible_duplicate").length,
      Visitors:
        serverCounts.visitor ??
        records.filter((r) => r.kind === "visitor").length,
      "Escalated Cases":
        serverCounts.manual_review ??
        records.filter((r) => r.kind === "manual_review").length,
      "Audit Log": serverCounts.audit ?? (state.adminData.audits || []).length,
      "Health Survey": state.surveyUnlocked ? state.surveyData.length : "PIN",
    };
  const icons = ["⌂", "●", "▣", "♥", "↻", "◎", "+", "!", "≡", "◇"];
  const navLabels = {
    "Live Operations": "Live Service",
    "Check-ins": "Check-ins",
    "Pastoral Care": "Pastoral Care",
    "Updated Records": "Profile Updates",
    "Confirmed Duplicates": "Duplicate Review",
    Visitors: "Visitor Care",
    "Escalated Cases": "Verification Support",
    "Audit Log": "Security Audit",
    "Health Survey": "Health Survey",
  };
  const primaryNav = ["Profile Reviews", "Live Operations", "Check-ins", "Pastoral Care", "Audit Log", "Health Survey"],
    queueNav = ["Updated Records", "Confirmed Duplicates", "Visitors", "Escalated Cases"],
    navButton = (page) => {
      const index = nav.indexOf(page);
      return `<button class="nav-btn ${state.adminPage === page ? "active" : ""}" data-page="${page}"><span>${icons[index]}</span><b>${navLabels[page] || page}</b><em>${counts[page]}</em></button>`;
    };
  const queueNotice = ![
    "Profile Reviews",
    "Live Operations",
    "Check-ins",
    "Pastoral Care",
    "Health Survey",
  ].includes(state.adminPage);
  const header = state.adminPage === "Profile Reviews"
    ? `<div class="admin-compact-head"><label><span>⌕</span><input id="adminGlobalSearch" value="${esc(state.adminSearch)}" placeholder="Search people, YouCount Number or location"></label><div class="avatar"><span>Data Team</span><i>DT</i><button class="switch" id="logoutAdmin">Log out</button></div></div>`
    : `<div class="admin-head"><div><span class="eyebrow">Data & Insights</span><h2>${state.adminPage} <small>(${counts[state.adminPage]})</small></h2><p>${adminSubtitle()}</p></div><div class="avatar"><span>Data Team</span><i>DT</i><button class="switch" id="logoutAdmin">Log out</button></div></div>`;
  return `<div class="admin ${state.adminMenuOpen ? "admin-menu-open" : ""}"><button class="admin-menu-button" id="adminMenuButton" aria-label="Open navigation" aria-expanded="${state.adminMenuOpen}"><i></i><i></i><i></i></button><button class="admin-menu-shade" id="adminMenuShade" aria-label="Close navigation"></button><aside class="sidebar premium-sidebar"><div class="admin-brand">${campaignWordmark()}<b>Data & Insights</b><small>Data team workspace</small></div><div class="nav-label">Workspace</div>${primaryNav.slice(0, 4).map(navButton).join("")}<button class="queue-toggle ${state.adminQueuesOpen ? "open" : ""}" id="queueToggle" aria-expanded="${state.adminQueuesOpen}"><span>Review queues</span><i>⌄</i><em>${queueNav.reduce((total, page) => total + Number(counts[page] || 0), 0)}</em></button><div class="queue-nav ${state.adminQueuesOpen ? "open" : ""}">${queueNav.map(navButton).join("")}</div><div class="nav-label">Governance</div>${primaryNav.slice(4).map(navButton).join("")}<div class="source-note"><b>Check-ins are recorded here.</b><br>Planning Center links are retained for later reconciliation.</div></aside><main class="admin-main">${header}${queueNotice ? `<div class="notice green"><b>Review here, action in Planning Center.</b> Compare active and inactive profiles before manually merging or deleting anything.</div>` : ""}${adminBody()}</main></div>`;
}
function adminSubtitle() {
  return {
    "Profile Reviews":
      "Review every submitted person from one clear, searchable workspace.",
    "Live Operations":
      "See live progress during service, spot stalled journeys and respond before people give up.",
    "Check-ins":
      "Scan YouCount Cards, prevent duplicate arrivals and monitor attendance by location and service.",
    "Pastoral Care":
      "Turn sustained absence into a clear, accountable care workflow for the pastoral and welfare team.",
    "Updated Records":
      "Review submitted changes, then update the matching Planning Center profile.",
    "Confirmed Duplicates":
      "Records members said are also theirs. Compare status before acting in Planning Center.",
    Visitors:
      "New and visiting people who completed the welcome form and received a YouCount Number.",
    "Escalated Cases":
      "Profiles that could not be safely verified or need a person to investigate.",
    "Audit Log": `Protected verification events are retained for ${AUDIT_RETENTION_DAYS} days, then deleted.`,
    "Health Survey":
      "Anonymous responses are separated from identity records and restricted by an additional PIN.",
  }[state.adminPage];
}
const incomplete = () => members.filter((m) => m.profileCompletenessScore < 80);
function adminBody() {
  if (state.adminPage === "Profile Reviews") return memberCareBody();
  if (state.adminPage === "Live Operations") return liveOperationsBody();
  if (state.adminPage === "Check-ins") return checkinBody();
  if (state.adminPage === "Pastoral Care") return pastoralCareBody();
  if (state.adminPage === "Health Survey") return surveyAdminBody();
  if (!IS_LOCAL) return liveAdminBody();
  if (state.adminPage === "Updated Records") return updateTable();
  if (state.adminPage === "Confirmed Duplicates") return confirmedDuplicates();
  if (state.adminPage === "Visitors") return escalatedCases();
  if (state.adminPage === "Escalated Cases") return escalatedCases();
  return logTable();
}
function relativeAdminTime(value) {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
function liveOperationsBody() {
  const ops = state.adminData.operations || {},
    summary = ops.summary || {},
    journeys = ops.journeys || [],
    stages = ops.stages || [];
  const attendance = Number(summary.serviceAttendance || 0),
    complete = Number(summary.completedToday || 0);
  const percent = attendance
    ? Math.min(100, Math.round((complete / attendance) * 100))
    : 0;
  return `<section class="ops-dashboard">
    <div class="ops-toolbar"><div><b>Service progress</b><span>Refreshes automatically every 15 seconds · last checked ${ops.refreshedAt ? relativeAdminTime(ops.refreshedAt) : "just now"}</span></div><form id="attendanceForm"><label>People in service today</label><input id="serviceAttendance" type="number" min="0" max="50000" value="${attendance || ""}" placeholder="e.g. 750"><button class="btn secondary">Save</button></form></div>
    <div class="ops-metrics"><article class="live"><span>Active now</span><b>${summary.active || 0}</b><small>seen in the last 5 minutes</small></article><article><span>Completed today</span><b>${complete}</b><small>secure submissions</small></article><article class="${summary.stalled ? "attention" : ""}"><span>May need help</span><b>${summary.stalled || 0}</b><small>over 5 minutes on one step</small></article><article class="${summary.failedLastHour ? "attention" : ""}"><span>Verification issues</span><b>${summary.failedLastHour || 0}</b><small>during the last hour</small></article></div>
    <div class="service-progress"><div><b>${attendance ? `${complete} of ${attendance}` : `${complete} completed`}</b><span>${attendance ? `${percent}% of today’s entered attendance` : "Enter today’s service attendance to compare campaign completion."}</span></div><div class="progress-track"><i style="width:${percent}%"></i></div></div>
    <div class="ops-grid"><section class="ops-panel"><header><div><span class="eyebrow">Live funnel</span><h3>Where people are now</h3></div><small>No names are shown before verification.</small></header><div class="stage-pipeline">${stages.length ? stages.map((stage) => `<article><b>${stage.count}</b><span>${esc(stage.label)}</span></article>`).join("") : `<div class="empty-queue">No active journeys right now.</div>`}</div></section>
    <section class="ops-panel"><header><div><span class="eyebrow">Support view</span><h3>Active journeys</h3></div><small>Oldest step first</small></header><div class="active-journeys">${
      journeys.length
        ? journeys
            .map((journey) => {
              const minutes = Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(journey.stageEnteredAt).getTime()) /
                    60000,
                ),
              );
              return `<article class="${minutes >= 5 ? "stalled" : ""}"><div class="journey-person"><i>${journey.verified ? "✓" : "•"}</i><div><b>${esc(journey.displayName)}</b><span>${esc(journey.journeyType || "journey")} · ${journey.verified ? "verified" : "identity hidden"}</span></div></div><div><b>${esc(journey.stageLabel)}</b><span>${minutes < 1 ? "just arrived" : `${minutes} min on this step`}</span>${journey.blocker ? `<em>${esc(journey.blocker)}</em>` : ""}</div></article>`;
            })
            .join("")
        : `<div class="empty-queue">No one is currently moving through the portal.</div>`
    }</div></section></div>
    <div class="privacy-strip"><b>Privacy guardrail:</b> people remain anonymous until they have verified. Live presence is deleted after 48 hours and is not a second member database.</div>
  </section>`;
}
function checkinBody() {
  const data = state.adminData.checkins || {},
    rows = data.checkins || [],
    locations = data.locations || ["Liberty Point Woodford", "North London", "Canary Wharf", "Croydon", "Birmingham", "Lagos", "Houston", "e-TLC"],
    services = data.services || [],
    result = state.checkinResult,
    headcounts = data.headcounts || [],
    roomTotal = headcounts.reduce((total, item) => total + Number(item.total || 0), 0);
  const resultCard = result
    ? `<article class="scan-result ${result.error ? "error" : result.duplicate ? "duplicate" : "success"}">
        ${result.photoRecordId ? `<img src="/api/photo?record=${encodeURIComponent(result.photoRecordId)}" alt="">` : `<i>${result.error ? "!" : result.duplicate ? "↻" : "✓"}</i>`}
        <div><span>${result.error ? "Card needs attention" : result.duplicate ? "Already checked in" : "Check-in complete"}</span><h3>${esc(result.name || result.message || "")}</h3>${result.publicId ? `<p>${esc(result.publicId)} · ${esc(result.location || state.checkinLocation)} · ${esc(result.service || state.checkinService)}</p>` : ""}</div>
      </article>`
    : `<div class="scanner-ready"><i>▣</i><div><b>Scanner ready</b><span>Present the QR code or enter the YouCount Number.</span></div></div>`;
  return `<section class="checkin-workspace">
    <form class="attendance-filters" id="checkinFilters"><label><span>Calendar date</span><input type="date" name="date" value="${esc(state.checkinDate)}"></label><label><span>Location</span><select name="location"><option value="">All locations</option>${locations.map((location) => `<option value="${esc(location)}" ${state.checkinHistoryLocation === location ? "selected" : ""}>${esc(location)}</option>`).join("")}</select></label><label><span>Service</span><select name="service"><option value="">All services</option>${services.map((service) => `<option value="${esc(service)}" ${state.checkinHistoryService === service ? "selected" : ""}>${esc(service)}</option>`).join("")}</select></label><label><span>Find a person</span><input name="search" value="${esc(state.checkinHistorySearch)}" placeholder="Name or YouCount Number"></label><button class="btn secondary">Apply filters</button><button class="btn ghost" type="button" id="clearCheckinFilters">Clear</button></form>
    <div class="checkin-command">
      <section class="scanner-card">
        <header><div><span class="eyebrow">Welcome team scanner</span><h3>Scan a YouCount Card</h3></div><span class="scanner-live">● Ready</span></header>
        <div class="scanner-context">
          <label><span>Location</span><select id="checkinLocation">${locations.map((location) => `<option ${state.checkinLocation === location ? "selected" : ""}>${esc(location)}</option>`).join("")}</select></label>
          <label><span>Service</span><input id="checkinService" value="${esc(state.checkinService)}" placeholder="e.g. First Service"></label>
        </div>
        <div class="camera-shell" id="cameraShell"><video id="checkinCamera" playsinline muted></video><div><b>Camera scanner</b><span>Keep the QR code inside the frame.</span></div></div>
        <div class="scanner-actions"><button class="btn secondary" id="startCheckinCamera">${state.checkinCameraActive ? "Stop camera" : "Use phone camera"}</button><span>or use a USB/Bluetooth scanner below</span></div>
        <form id="checkinScanForm"><label class="scan-input"><span>QR code or YouCount Number</span><input id="checkinCode" autocomplete="off" autocapitalize="characters" placeholder="Scan or type 482193" required autofocus></label><label class="checkin-email-choice"><input id="checkinNotify" type="checkbox" ${state.checkinNotify ? "checked" : ""}> Send a check-in email</label><button class="btn full">Check in</button></form>
        ${resultCard}
      </section>
      <section class="checkin-summary"><header><div><span class="eyebrow">Today</span><h3>${data.total || 0} checked in</h3></div><button class="btn ghost" id="refreshCheckins">Refresh</button></header>
        <div class="checkin-breakdown">${(data.summary || []).map((item) => `<article><b>${item.count}</b><span>${esc(item.location)}</span><small>${esc(item.service)}</small></article>`).join("") || `<div class="empty-queue">The first scan will appear here.</div>`}</div>
        <div class="admin-headcount"><div><span>Manual room count</span><b>${roomTotal}</b><small>${data.total || 0} identified check-ins${roomTotal ? ` · ${Math.round(((data.total || 0) / roomTotal) * 100)}% identified` : ""}</small></div>${headcounts.map((item) => `<p><b>${esc(item.location)} · ${esc(item.service)}</b><span>${item.male} male · ${item.female} female · ${item.children} children</span></p>`).join("") || `<p>No headcount submitted for this view.</p>`}<a href="/check-in">Open attendance workspace →</a></div>
      </section>
    </div>
    <section class="checkin-ledger"><header><div><span class="eyebrow">Attendance ledger</span><h3>Recent arrivals</h3></div><small>Planning Center write-back is intentionally pending.</small></header>
      <div class="checkin-table"><div class="checkin-row checkin-head"><span>Person</span><span>Location</span><span>Service</span><span>Time</span><span>PC link</span></div>${rows.map((row) => `<div class="checkin-row"><span class="checkin-person">${row.photoRecordId ? `<img src="/api/photo?record=${encodeURIComponent(row.photoRecordId)}" alt="">` : `<i>${esc((row.name || "?")[0])}</i>`}<b>${esc(row.name)}</b><small>${esc(row.publicId)}</small></span><span>${esc(row.location)}</span><span>${esc(row.service)}</span><span>${new Date(row.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><span>${row.planningCenterIds?.length ? `<a href="https://people.planningcenteronline.com/people/AC/people/${encodeURIComponent(row.planningCenterIds[0])}" target="_blank" rel="noreferrer">Linked</a>` : "Pending"}</span></div>`).join("") || `<div class="empty-queue">No check-ins recorded today.</div>`}</div>
    </section>
  </section>`;
}
function pastoralCareBody() {
  const data = state.adminData.pastoral || {},
    cases = data.cases || [],
    monitoring = data.monitoring || {},
    statusLabels = { open: "Needs contact", contacted: "Contacted", resolved: "Resolved", dismissed: "Dismissed" };
  return `<section class="pastoral-workspace">
    <div class="pastoral-rule"><div><span class="eyebrow">Attendance care rule</span><h3>Two missed Sundays</h3><p>${esc(monitoring.rule || "A care case is created after two consecutive missed Sundays following a first recorded Sunday check-in.")}</p></div><div><b>${monitoring.olderSunday ? new Date(`${monitoring.olderSunday}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</b><span>and</span><b>${monitoring.latestSunday ? new Date(`${monitoring.latestSunday}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</b></div></div>
    <div class="pastoral-toolbar"><div><b>${cases.length} ${state.pastoralStatus === "active" ? "active" : state.pastoralStatus} case${cases.length === 1 ? "" : "s"}</b><span>Only members with a previous Sunday check-in enter this workflow.</span></div><label>Status<select id="pastoralStatus"><option value="active" ${state.pastoralStatus === "active" ? "selected" : ""}>Active cases</option>${["all", "open", "contacted", "resolved", "dismissed"].map((value) => `<option value="${value}" ${state.pastoralStatus === value ? "selected" : ""}>${value[0].toUpperCase() + value.slice(1)}</option>`).join("")}</select></label></div>
    <div class="pastoral-cases">${cases.length ? cases.map((item) => `<article class="pastoral-case ${esc(item.status)}"><header>${item.photoRecordId ? `<img src="/api/photo?record=${encodeURIComponent(item.photoRecordId)}" alt="">` : `<i>${esc((item.name || "?")[0])}</i>`}<div><span>${esc(statusLabels[item.status] || item.status)}</span><h3>${esc(item.name)}</h3><p>${esc(item.publicId)} · Last attended ${item.lastAttended ? new Date(`${item.lastAttended}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "not recorded"}${item.lastLocation ? ` at ${esc(item.lastLocation)}` : ""}</p></div><strong>${item.missedCount} Sundays</strong></header><div class="pastoral-contact"><a href="tel:${esc(item.phone)}">${esc(item.phone || "No phone recorded")}</a><a href="mailto:${esc(item.email)}">${esc(item.email || "No email recorded")}</a></div><form class="pastoral-case-form" data-case-id="${item.id}"><label>Assigned to<input name="assignedTo" value="${esc(item.assignedTo)}" placeholder="Pastor or welfare team member"></label><label>Status<select name="status">${["open", "contacted", "resolved", "dismissed"].map((value) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${esc(statusLabels[value])}</option>`).join("")}</select></label><label class="wide">Outcome / resolution<input name="resolution" value="${esc(item.resolution)}" placeholder="e.g. Spoke with member; travelling and doing well"></label><label class="wide">Add a private care note<textarea name="note" rows="2" placeholder="Record the contact or agreed next step"></textarea></label><button class="btn full">Save care update</button></form>${item.notes?.length ? `<details><summary>${item.notes.length} care note${item.notes.length === 1 ? "" : "s"}</summary>${item.notes.map((note) => `<p><b>${new Date(note.createdAt).toLocaleString("en-GB")}</b>${esc(note.note)}</p>`).join("")}</details>` : ""}</article>`).join("") : `<div class="empty-queue">No pastoral attendance cases match this view.</div>`}</div>
  </section>`;
}
function memberCareBody() {
  const records = state.adminData.records || [],
    selected = records.find(
      (record) => String(record.id) === String(state.adminSelectedRecordId),
    );
  if (selected)
    return `<div class="record-detail-head"><button class="btn ghost" id="closeRecordDetail">← Back to member list</button><span>Submission #${esc(selected.id)}</span></div><div class="review-records single">${reviewRecordCard(selected)}</div>`;
  const statusFilter = state.adminStatusFilter || "all",
    query = searchKey(state.adminSearch);
  const rows = records.filter((record) => {
    const changes = record.submission?.changes || {},
      text = searchKey(
        `${record.id} ${record.identity?.publicId || ""} ${changes.firstName || ""} ${changes.lastName || ""} ${changes.email || ""} ${changes.phone || ""} ${changes.tlcLocation || ""}`,
      );
    const statusMatches =
      statusFilter === "all" ||
      (statusFilter === "pending" && record.status === "pending") ||
      (statusFilter === "follow_up" && record.status === "follow_up") ||
      (statusFilter === "completed" &&
        ["completed", "updated_pc", "rejected"].includes(record.status));
    return statusMatches && (!query || text.includes(query));
  });
  const counts = state.adminData.counts || {},
    cards = [
      ["Profile updates", counts.profile_update || 0, "Updated Records", "↻"],
      [
        "Duplicates",
        counts.possible_duplicate || 0,
        "Confirmed Duplicates",
        "◎",
      ],
      ["Visitors", counts.visitor || 0, "Visitors", "+"],
      ["Escalations", counts.manual_review || 0, "Escalated Cases", "!"],
    ];
  const typeLabel = {
    profile_update: "Profile update",
    possible_duplicate: "Possible duplicate",
    visitor: "Visitor",
    manual_review: "Verification support",
  };
  const statusLabel = {
    pending: "Needs review",
    follow_up: "Follow-up",
    updated_pc: "Updated in PC",
    completed: "Completed",
    rejected: "No action",
  };
  return `<section class="member-care-crm">
    <div class="crm-greeting"><div><span class="eyebrow">Data & Insights workspace</span><h3>Good day, Data Team</h3><p>Here are the people and profile requests that need your attention.</p></div></div>
    <div class="crm-summary-cards">${cards.map(([label, count, page, icon]) => `<button data-page="${page}"><i>${icon}</i><div><b>${count}</b><span>${label}</span></div><em>›</em></button>`).join("")}</div>
    <section class="people-list-card"><div class="people-list-toolbar"><div class="crm-tabs">${[
      ["all", "All"],
      ["pending", "Needs review"],
      ["follow_up", "Follow-up"],
      ["completed", "Completed"],
    ]
      .map(
        ([value, label]) =>
          `<button class="${statusFilter === value ? "active" : ""}" data-admin-filter="${value}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="people-tools"><label><span>⌕</span><input id="adminSearch" value="${esc(state.adminSearch)}" placeholder="Search by name, YouCount Number or location"></label><button class="filter-button" type="button">Filter</button></div></div>
      <div class="people-table"><div class="people-row people-head"><span>Person</span><span>YouCount Number</span><span>Location</span><span>Request category</span><span>Status</span><span>Last updated</span><span></span></div>${
        rows.length
          ? rows
              .map((record) => {
                const changes = record.submission?.changes || {},
                  name =
                    `${changes.firstName || ""} ${changes.lastName || ""}`.trim() ||
                    `Submission #${record.id}`,
                  initials =
                    `${changes.firstName?.[0] || ""}${changes.lastName?.[0] || ""}`.toUpperCase() ||
                    "?",
                  location =
                    changes.tlcLocation || changes.location || "Not provided";
                return `<button class="people-row" data-open-record="${record.id}"><span class="person-cell"><i><span>${esc(initials)}</span><img src="/api/photo?record=${encodeURIComponent(record.id)}" alt="" loading="lazy"></i><strong>${esc(name)}</strong></span><span>${esc(record.identity?.publicId || "Pending")}</span><span>${esc(location)}</span><span><em class="case-pill kind-${esc(record.kind)}">${esc(typeLabel[record.kind] || "Review")}</em></span><span><em class="status-pill status-${esc(record.status)}">${esc(statusLabel[record.status] || record.status)}</em></span><span>${new Date(record.updatedAt || record.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span><span class="row-chevron">›</span></button>`;
              })
              .join("")
          : `<div class="empty-queue">No people match this view.</div>`
      }</div>
      <footer class="people-list-footer"><span>Showing ${rows.length} of the latest ${records.length} records</span><small>Click a name to open the complete submitted record.</small></footer>
    </section>
  </section>`;
}
function reviewOverviewBody() {
  const counts = state.adminData.counts || {},
    ops = state.adminData.operations?.summary || {};
  const cards = [
    ["Updated records", counts.profile_update || 0, "Updated Records"],
    [
      "Possible duplicates",
      counts.possible_duplicate || 0,
      "Confirmed Duplicates",
    ],
    ["Visitors", counts.visitor || 0, "Visitors"],
    ["Escalated cases", counts.manual_review || 0, "Escalated Cases"],
  ];
  return `<section class="crm-overview"><div class="crm-welcome"><span class="campaign-kicker">Today at a glance</span><h3>${ops.completedToday || 0} people completed their journey today.</h3><p>${ops.active || 0} are active now and ${ops.stalled || 0} may need help.</p><button class="btn secondary" data-page="Live Operations">Open live operations</button></div><div class="crm-queue-grid">${cards.map(([label, count, page]) => `<button data-page="${page}"><span>${label}</span><b>${count}</b><small>Open queue →</small></button>`).join("")}</div></section>`;
}
function surveyAdminBody() {
  if (!state.surveyUnlocked)
    return `<section class="survey-admin-lock"><span class="campaign-kicker">Restricted survey team</span><h3>Enter the survey access PIN</h3><p>Identity-review access does not automatically grant access to anonymous survey responses.</p><form id="surveyPinForm"><div class="field"><label>Secure PIN</label><input id="surveyPin" type="password" inputmode="numeric" autocomplete="one-time-code" required></div><div class="notice red" id="surveyPinError" hidden>That PIN was not recognised.</div><button class="btn full">Open survey results</button></form></section>`;
  const allRows = state.surveyData || [],
    metrics = [
      ["Belonging", "belonging"], ["Spiritual growth", "spiritualGrowth"],
      ["Worship", "worship"], ["Pastoral care", "pastoralCare"],
      ["Relationships", "groups"], ["Serving", "serving"],
      ["Communication", "communication"], ["Safety and trust", "safety"],
      ["Recommendation", "recommend"],
    ],
    locationKey = (row) => String(row.answers?.campus || "Prefer not to say"),
    locationCounts = allRows.reduce((counts, row) => {
      const location = locationKey(row);
      counts[location] = (counts[location] || 0) + 1;
      return counts;
    }, {}),
    locationEntries = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]),
    selectedLocation = state.surveyLocationFilter || "all",
    rows = selectedLocation === "all" ? allRows : allRows.filter((row) => locationKey(row) === selectedLocation),
    valuesFor = (key) => rows.map((row) => Number(row.answers?.[key])).filter((value) => value >= 1 && value <= 5),
    averageFor = (key) => {
      const values = valuesFor(key);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    },
    allScores = metrics.flatMap(([, key]) => valuesFor(key)),
    overall = allScores.length ? allScores.reduce((sum, value) => sum + value, 0) / allScores.length : 0,
    favourable = allScores.length ? Math.round((allScores.filter((value) => value >= 4).length / allScores.length) * 100) : 0,
    distributionScores = [5, 4, 3, 2, 1],
    distribution = distributionScores.map((score) => allScores.filter((value) => value === score).length),
    distributionMax = Math.max(1, ...distribution),
    dates = rows.map((row) => new Date(row.createdAt)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a - b),
    range = dates.length ? `${dates[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to ${dates.at(-1).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "No responses yet",
    palette = ["#0b4b82", "#e81889", "#f5b323", "#3f8fc1", "#6f4bb8", "#36a47b", "#df6b55", "#8296aa"],
    donutSegments = (() => {
      let start = 0;
      return locationEntries.map(([, count], index) => {
        const end = start + (allRows.length ? (count / allRows.length) * 360 : 0), segment = `${palette[index % palette.length]} ${start}deg ${end}deg`;
        start = end;
        return segment;
      }).join(", ");
    })(),
    commentGroups = [
      ["barriers", "Barriers", "What makes it harder to connect, grow or participate?"],
      ["support", "What to strengthen", "What should the church strengthen or improve?"],
      ["comments", "Additional comments", "Anything else leadership should hear"],
    ],
    activeCommentKey = commentGroups.some(([key]) => key === state.surveyCommentGroup) ? state.surveyCommentGroup : "barriers",
    activeComment = commentGroups.find(([key]) => key === activeCommentKey),
    commentRows = rows.filter((row) => String(row.answers?.[activeCommentKey] || "").trim());
  return `<section class="survey-insights">
    <header class="survey-insights-head"><div><span class="eyebrow">Anonymous church health survey</span><h3>Leadership insights</h3><p>Understand church health, compare locations and review written feedback by theme.</p></div><div class="survey-filter"><label>Location</label><select id="surveyLocationFilter"><option value="all">All locations</option>${locationEntries.map(([location]) => `<option value="${esc(location)}" ${selectedLocation === location ? "selected" : ""}>${esc(location)}</option>`).join("")}</select><small>${esc(range)}</small></div></header>
    <div class="survey-kpis"><article><span>Total responses</span><b>${rows.length}</b><small>${selectedLocation === "all" ? "Across every location" : esc(selectedLocation)}</small></article><article><span>Overall health score</span><b>${overall ? overall.toFixed(1) : "0.0"}<em>/ 5</em></b><small>Across nine indicators</small></article><article><span>Favourable responses</span><b>${favourable}<em>%</em></b><small>Scores of 4 or 5</small></article><article><span>Recommendation</span><b>${averageFor("recommend") ? averageFor("recommend").toFixed(1) : "0.0"}<em>/ 5</em></b><small>Likelihood to recommend TLC</small></article></div>
    <div class="survey-visual-grid"><article class="survey-visual scorecard"><header><div><span class="visual-kicker">Health indicators</span><h4>Average score by question</h4></div><small>${rows.length} responses selected</small></header><div class="question-score-list">${metrics.map(([label, key]) => { const average = averageFor(key), count = valuesFor(key).length; return `<div><span>${esc(label)}</span><div class="score-track"><i style="width:${Math.round((average / 5) * 100)}%"></i></div><b>${average ? average.toFixed(1) : "0.0"}</b><small>${count}</small></div>`; }).join("")}</div></article>
      <article class="survey-visual distribution-card"><header><div><span class="visual-kicker">Response spread</span><h4>All score selections</h4></div></header><div class="survey-bars">${distribution.map((count, index) => `<div><span>${count}</span><i style="height:${Math.max(4, Math.round((count / distributionMax) * 100))}%"></i><b>${distributionScores[index]}</b></div>`).join("")}</div><div class="scale-caption"><span>Strongly agree</span><span>Strongly disagree</span></div></article>
      <article class="survey-visual location-card"><header><div><span class="visual-kicker">Location mix</span><h4>Where responses came from</h4></div><small>${allRows.length} total</small></header><div class="location-viz"><div class="survey-donut" style="background:conic-gradient(${donutSegments || "#e8eef3 0deg 360deg"})"><span><b>${allRows.length}</b><small>responses</small></span></div><div class="location-legend">${locationEntries.map(([location, count], index) => `<button data-survey-location="${esc(location)}"><i style="background:${palette[index % palette.length]}"></i><span>${esc(location)}</span><b>${count}</b><em>${allRows.length ? Math.round((count / allRows.length) * 100) : 0}%</em></button>`).join("") || `<p>No location data yet.</p>`}</div></div></article></div>
    <article class="survey-feedback-panel"><header><div><span class="visual-kicker">Written feedback</span><h4>Responses grouped by question</h4><p>Comments remain anonymous and are not linked to member records.</p></div><strong>${commentRows.length}<small>responses in view</small></strong></header><nav class="feedback-tabs">${commentGroups.map(([key, label]) => { const count = rows.filter((row) => String(row.answers?.[key] || "").trim()).length; return `<button class="${activeCommentKey === key ? "active" : ""}" data-survey-comment="${key}"><span>${esc(label)}</span><em>${count}</em></button>`; }).join("")}</nav><div class="feedback-question"><b>${esc(activeComment[2])}</b><span>${esc(selectedLocation === "all" ? "All locations" : selectedLocation)}</span></div><div class="feedback-responses">${commentRows.length ? commentRows.map((row, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><p>${esc(row.answers?.[activeCommentKey])}</p></article>`).join("") : `<div class="empty-queue">No responses have been recorded for this question and location.</div>`}</div></article>
    <div class="privacy-strip"><b>Anonymous by design:</b> Do not attempt to identify respondents from their wording. Survey responses are stored separately and removed automatically after 90 days.</div>
  </section>`;
}
const adminLabels = {
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  maidenName: "Maiden / previous surname",
  gender: "Gender",
  maritalStatus: "Marital status",
  email: "Email",
  phone: "Phone",
  postcode: "Postcode",
  addressLine1: "Address",
  membershipStatus: "TLC membership",
  invitedBy: "Invited by",
  firstVisit: "First visit",
  heardAbout: "How they heard about TLC",
  connectInterest: "Interested in Connect",
  countryOfResidence: "Country of residence",
  residenceRegion: "Residential state / region",
  residenceLga: "Local government area",
  residenceBorough: "Residential London borough",
  ethnicity: "Ethnic group",
  tlcLocation: "TLC location",
  attendanceFrequency: "Attendance frequency",
  yearStartedAttending: "Year started attending TLC",
  pastoralFollowUp: "Interested in",
  familyAttends: "Family attends TLC",
  familyAttendees: "Family members attending TLC",
  skills: "Skills",
  volunteeringInterests: "Skills available for serving",
  teamMember: "Team member",
  smallGroupMember: "Small-group member",
  smallGroupOther: "Small Group name (typed)",
  householdName: "Household / family",
  communicationPreference: "Communication preference",
  consent: "Communication consent",
  industry: "Industry",
  employer: "Employer / organisation",
  jobRole: "Role / job title",
  countryOfOrigin: "Nationality",
  workStatus: "Work status",
  regionOfOrigin: "Region / state of origin",
  boroughOfOrigin: "London borough of origin",
  birthDay: "Birth day",
  birthMonth: "Birth month",
  birthYear: "Birth year",
  ageGroup: "Age group",
  connectCompleted: "Connect completed (member response)",
  baptised: "Baptised",
  baptismChurch: "Baptism church",
  baptismYear: "Baptism year",
  householdMembers: "Household members",
  photo: "Profile photo",
  otherNames: "Other names or spellings",
  servingTeams: "Serving teams",
  groups: "Groups",
  smallGroup: "Small group",
  otherGroups: "Other groups",
};
function pcProfileLink(id, label) {
  return `<a class="pc-link" href="https://people.planningcenteronline.com/people/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">${esc(label || id)} ↗</a>`;
}
function displayAdminValue(value) {
  if (value == null || value === "")
    return `<span class="empty-value">Not provided</span>`;
  if (Array.isArray(value)) {
    if (!value.length) return `<span class="empty-value">None selected</span>`;
    return `<div class="value-list">${value.map((item) => `<span>${displayAdminValue(item)}</span>`).join("")}</div>`;
  }
  if (typeof value === "object") {
    if ("relationship" in value)
      return `<div class="household-admin-value"><b>${esc(value.name || "Family member")}</b><small>Relationship: ${esc(value.relationship || "Not provided")}</small><small>TLC location: ${esc(value.location || "Not provided")}</small></div>`;
    if ("sameAddress" in value || "birthDay" in value)
      return `<div class="household-admin-value"><b>${esc(value.name || "Household member")}</b><small>Date of birth: ${esc([value.birthDay, value.birthMonth, value.birthYear].filter(Boolean).join(" / ") || "Not provided")}</small><small>Lives at member address: ${value.sameAddress === "yes" ? "Yes" : value.sameAddress === "no" ? "No" : "Not provided"}</small>${value.sameAddress === "no" ? `<small>Known address: ${esc(value.address || "NA")}</small>` : ""}</div>`;
    const details = [
      value.name,
      value.relationship,
      value.typeName,
      value.location,
      value.schedule,
    ].filter(Boolean);
    return details.length
      ? `<div class="group-admin-value"><b>${esc(value.name || "Selected group")}</b><small>${esc(details.slice(1).join(" · "))}</small><code>Planning Center group ID: ${esc(value.id || "Not available")}</code></div>`
      : `<code>${esc(JSON.stringify(value))}</code>`;
  }
  return esc(value);
}
function reviewRecordCard(record) {
  const changes = record.submission?.changes || {},
    choices = record.submission?.choices || {},
    ids = record.planningCenterIds || [],
    roleCodes = ["", "V", "AT", "CM", "TM", "SG", "TL", "OC", "OD", "OA", "OM", "OP"],
    roleControl = record.identity
      ? `<div class="identity-role-control"><label>Role code<select data-role-code>${roleCodes.map((code) => `<option value="${code}" ${String(record.identity.roleCode || "") === code ? "selected" : ""}>${code || "Provisional / no code"}</option>`).join("")}</select></label><button class="btn secondary" data-save-role data-identity-id="${record.identity.id}">Save role</button></div>`
      : "",
    connectFlag = record.identity?.connectException === "connect_confirmation_required"
      ? `<div class="connect-confirmation-flag"><b>Connect record requires confirmation</b><small>The member selected the Connect route but was not found in the imported Connect list. Their card remains active while the Data Team reviews this.</small></div>`
      : "";
  return `<article class="review-record"><header><div><span class="eyebrow">Submission #${esc(record.id)}</span><h3>${esc(changes.firstName || "")} ${esc(changes.lastName || "")}</h3><p>${new Date(record.createdAt).toLocaleString("en-GB")}</p></div>${badge(record.status)}</header><div class="admin-member-identity"><div><span>Member identity</span><strong>${esc(changes.firstName || "")} ${esc(changes.lastName || "")}</strong></div><div><span>${"YouCount Number"}</span><strong>${esc(record.identity?.publicId || "Pending identity match")}</strong></div></div><div class="pc-records"><b>Planning Center records</b>${ids.length ? ids.map((id, index) => `<div>${pcProfileLink(id, index === 0 ? `Verified profile · ${id}` : `Possible duplicate · ${id}`)}</div>`).join("") : `<span class="empty-value">Manual match required</span>`}</div>${connectFlag}<div class="identity-panel"><div><span>Identity status</span><b>${record.identity?.status === "full" ? "Full TLC identity" : "Provisional identity"}</b><small>${record.identity?.connectCompleted ? "Connect confirmed" : record.identity?.connectException === "connect_confirmation_required" ? "Member card active · confirmation pending" : "Connect not yet confirmed"}</small></div>${ids.length ? `<div class="identity-actions"><button class="btn secondary" data-connect-status="true" data-record-id="${record.id}">Confirm Connect</button><button class="btn ghost" data-connect-status="false" data-record-id="${record.id}">Mark not completed</button></div>` : ""}${roleControl}</div><details class="submitted-details"><summary>Submitted information <span>Open details</span></summary><div class="change-grid">${Object.entries(
    adminLabels,
  )
    .map(
      ([key, label]) =>
        `<div class="change-item"><span>${label}</span><div>${key === "photo" && (changes.photo?.pathname || ids.length) ? `<img class="admin-photo" src="/api/photo?record=${encodeURIComponent(record.id)}" alt="${changes.photo?.pathname ? "Submitted member photo" : "Planning Center profile photo"}"><small>${changes.photo?.pathname ? esc(changes.photo.name || "Newly submitted photo") : "Current Planning Center profile photo"}</small>` : key === "ethnicity" ? esc(ethnicityDisplay(changes[key], changes.ethnicityVariant, changes.ethnicityOther)) : displayAdminValue(changes[key])}</div></div>`,
    )
    .join("")}</div></details>${
    Object.keys(choices).length
      ? `<div class="duplicate-responses"><b>Member duplicate responses</b>${Object.entries(
          choices,
        )
          .map(
            ([id, value]) =>
              `<div>${pcProfileLink(id, id)} <span>${["This is also me", "This is not me", "I’m not sure"][value] || "No answer"}</span></div>`,
          )
          .join("")}</div>`
      : ""
  }<footer class="record-workflow"><label>Review outcome<select data-record-status data-record-id="${record.id}"><option value="pending" ${record.status === "pending" ? "selected" : ""}>Pending review</option><option value="follow_up" ${record.status === "follow_up" ? "selected" : ""}>Needs follow-up</option><option value="updated_pc" ${record.status === "updated_pc" ? "selected" : ""}>Updated in Planning Center</option><option value="rejected" ${record.status === "rejected" ? "selected" : ""}>Rejected / no action</option><option value="completed" ${record.status === "completed" ? "selected" : ""}>Completed</option></select></label></footer></article>`;
}
function adminPagination() {
  const pagination = state.adminData.pagination || {},
    page = Number(pagination.page || 1),
    totalPages = Math.max(
      1,
      Math.ceil(
        Number(pagination.total || 0) / Number(pagination.pageSize || 50),
      ),
    );
  if (totalPages <= 1) return "";
  return `<nav class="admin-pagination" aria-label="Admin records pages"><button class="btn ghost" data-admin-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>← Previous</button><span>Page ${page} of ${totalPages}</span><button class="btn ghost" data-admin-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Next →</button></nav>`;
}
function auditEventLabel(event) {
  const labels = {
    admin_login: "Admin sign in",
    survey_admin_unlock: "Survey access",
    name_submitted: "Name search submitted",
    contact_evidence_submitted: "Contact details checked",
    otp_sent: "Verification code sent",
    otp_verified: "Verification completed",
    verification_failed: "Verification failed",
    manual_review_requested: "Manual review requested",
    profile_submitted: "Profile submitted",
    visitor_submitted: "Visitor details submitted",
    record_status_changed: "Review status changed",
    service_attendance_updated: "Service attendance updated",
    verified_session_network_changed: "Verified session network changed",
  };
  return labels[event] || String(event || "System event").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
function auditCategory(event) {
  const value = String(event || "");
  if (/admin|survey_admin|staff|login/.test(value)) return "Staff access";
  if (/name|contact|otp|verif|session|evidence|manual/.test(value)) return "Member verification";
  if (/submit|record|identity|status|attendance|photo/.test(value)) return "Record activity";
  return "System activity";
}
function auditContext(value) {
  if (!value) return "No additional details";
  if (typeof value !== "object") return esc(value);
  const parts = Object.entries(value)
    .filter(([, item]) => item != null && item !== "")
    .slice(0, 4)
    .map(([key, item]) => `<span><b>${esc(key.replaceAll("_", " "))}</b>${esc(Array.isArray(item) ? item.join(", ") : item)}</span>`);
  return parts.length ? parts.join("") : "No additional details";
}
function securityAuditBody(audits) {
  const categories = ["Staff access", "Member verification", "Record activity", "System activity"];
  return `<section class="security-audit"><div class="audit-intro"><div><span class="eyebrow">Protected activity history</span><h3>Security audit</h3><p>Events are grouped by purpose so the data team can understand what happened quickly. Verification codes are never stored.</p></div><strong>${audits.length}<small>events on this page</small></strong></div><div class="audit-groups">${categories
    .map((category) => {
      const rows = audits.filter((event) => auditCategory(event.event) === category);
      if (!rows.length) return "";
      return `<details class="audit-group" ${category === "Member verification" ? "open" : ""}><summary><span>${esc(category)}</span><em>${rows.length}</em><i>⌄</i></summary><div class="audit-event-list">${rows.map((event) => `<article><div><b>${esc(auditEventLabel(event.event))}</b><small>${new Date(event.createdAt).toLocaleString("en-GB")}</small></div><div class="audit-context">${auditContext(event.entered)}</div><span class="audit-outcome outcome-${esc(String(event.outcome || "unknown").toLowerCase())}">${esc(String(event.outcome || "Recorded").replaceAll("_", " "))}</span></article>`).join("")}</div></details>`;
    })
    .join("")}</div><div class="privacy-strip"><b>Retention:</b> Security events are retained for ${AUDIT_RETENTION_DAYS} days and then removed automatically.</div></section>${adminPagination()}`;
}
function liveAdminBody() {
  const records = state.adminData.records || [],
    audits = state.adminData.audits || [];
  if (state.adminPage === "Audit Log") return securityAuditBody(audits);
  const kind =
    state.adminPage === "Updated Records"
      ? "profile_update"
      : state.adminPage === "Confirmed Duplicates"
        ? "possible_duplicate"
        : state.adminPage === "Visitors"
          ? "visitor"
          : "manual_review";
  const query = searchKey(state.adminSearch),
    rows = records
      .filter((r) => r.kind === kind)
      .filter(
        (r) =>
          !query ||
          searchKey(`${r.id} ${r.identity?.publicId || ""} ${JSON.stringify(r.planningCenterIds || [])} ${JSON.stringify(r.submission?.changes || {})}`).includes(query),
      );
  return `<div class="admin-search"><input id="adminSearch" value="${esc(state.adminSearch)}" placeholder="Search this page by name, email, phone, submission or Planning Center ID"><span>${rows.length} on this page</span></div><div class="review-records">${rows.map(reviewRecordCard).join("") || `<div class="empty-queue">No matching records in this queue.</div>`}</div>${adminPagination()}`;
}
function operationsHub() {
  const tiles = [
    { id: "hubData", tone: "blue", icon: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 7h18v18H7zM11 12h10M11 16h10M11 20h6"/></svg>`, label: "Data Team", title: "Data & Insights", copy: "Identity review, submissions, survey insights and governance.", meta: "Data workspace" },
    { id: "hubPastoral", tone: "rose", icon: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 26S5 20 5 12.5C5 8 10.5 6 16 11c5.5-5 11-3 11 1.5C27 20 16 26 16 26Z"/><path d="M11 17h3l2-5 2 8 2-3h2"/></svg>`, label: "Pastoral Care & Welfare", title: "Member Care", copy: "Follow up sensitively with people who may need care or connection.", meta: "Protected care workspace" },
    { id: "hubAttendance", tone: "gold", icon: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8h20v17H6zM10 5v6M22 5v6M6 13h20"/><path d="m11 19 3 3 7-7"/></svg>`, label: "Attendance Team", title: "Service Check-in", copy: "Scan member cards, record room counts and review attendance.", meta: "Welcoming team workspace" },
    { id: "hubEvents", tone: "mint", icon: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8h20v18H6zM10 5v6M22 5v6M6 13h20M11 18h4M11 22h8"/></svg>`, label: "Events", title: "Event Operations", copy: "Create events, registrations, tickets and event check-in.", meta: "Coming soon", disabled: true },
  ];
  return `<div class="ops-hub"><div class="ops-hub-glow"></div><header>${campaignWordmark()}<button id="hubBack" aria-label="Back to You Count"><span>←</span> Back to You Count</button></header><main><div class="ops-hub-intro"><span class="eyebrow">TLC Operations</span><h1>Staff applications</h1><p>Choose a secure workspace.</p></div><div class="ops-app-launcher"><div class="ops-app-grid">${tiles.map((tile) => `<button id="${tile.id}" class="ops-app ${tile.tone}" ${tile.disabled ? "disabled aria-disabled=\"true\"" : ""}><i>${tile.icon}</i><h2>${tile.title}</h2><span>${tile.label}</span><p>${tile.copy}</p><em>${tile.meta}</em></button>`).join("")}</div></div></main></div>`;
}
function pastoralLogin() {
  return `<div class="workspace-login pastoral-login"><button class="login-back" id="pastoralBack">← ${PRODUCT_PATH === "/member-care" ? "ServeSpace" : "All workspaces"}</button><section class="simple-workspace-login"><div class="workspace-login-mark"><i>♥</i><span>Pastoral Care & Welfare</span></div><h1>Member Care</h1><p>Enter your PIN to continue.</p><form id="pastoralLoginForm"><label>PIN<input id="pastoralPin" type="password" inputmode="numeric" autocomplete="current-password" required autofocus></label><div class="notice red login-error" id="pastoralLoginError" hidden>That PIN was not recognised.</div><button class="btn full">Continue</button></form></section></div>`;
}
function pastoralWorkspace() {
  const total = state.adminData.pastoral?.cases?.length || 0;
  return `<div class="care-app"><header><div><i>♥</i><span><b>Member Care</b><small>Pastoral care & welfare</small></span></div><button id="pastoralLogout">Log out</button></header><main><div class="care-heading"><button id="pastoralHub">← ${PRODUCT_PATH === "/member-care" ? "ServeSpace" : "Workspaces"}</button><span class="eyebrow">Member Care CRM</span><h1>People, not cases.</h1><p>Use attendance patterns as a prompt for thoughtful human follow-up.</p><strong>${total} active follow-up${total === 1 ? "" : "s"}</strong></div>${pastoralCareBody()}</main></div>`;
}
function adminLogin() {
  return `<div class="login-page"><button class="login-back" id="loginBack">← ${PRODUCT_PATH === "/data" ? "ServeSpace" : "All workspaces"}</button><section class="login-card"><div class="login-wordmark">${campaignWordmark()}</div><span class="eyebrow">Authorised staff only</span><h2>Data & Insights</h2><p class="lede">Enter the staff password to open the data workspace.</p><form id="adminLoginForm"><div class="field"><label>Password</label><input id="adminPassword" type="password" autocomplete="current-password" required autofocus></div><div class="notice red login-error" id="loginError" hidden>That password was not recognised.</div><button class="btn full">Open Data & Insights</button></form><p class="privacy">Access is protected by a server-side session and restricted to the church data team.</p></section></div>`;
}
function eventOperationsComingSoon() {
  return `<div class="workspace-login"><button class="login-back" id="eventBack">← ServeSpace</button><section class="simple-workspace-login"><div class="workspace-login-mark"><i>◇</i><span>Events Team</span></div><h1>Event Operations</h1><p>Registration, ticketing and event check-in will appear here when the event workspace is ready.</p><a class="btn full" href="${SERVESPACE_URL}">Return to ServeSpace</a></section></div>`;
}
function overview() {
  const metrics = [
    ["Total records", members.length, "Database", "↑ 12 this month"],
    [
      "Verified profiles",
      members.filter((x) => x.verificationStatus === "Verified").length,
      "✓",
      "Campaign in progress",
    ],
    [
      "Updated profiles",
      members.filter((x) => x.verificationStatus === "Updated").length,
      "↻",
      "Awaiting or reviewed",
    ],
    ["Incomplete profiles", incomplete().length, "!", "Needs attention"],
    [
      "Possible duplicates",
      members.filter((x) => x.possibleDuplicateIds.length).length,
      "◎",
      "3 high confidence",
    ],
    ["Manual review cases", 12, "◫", "5 newly added"],
    ["Locked attempts", 4, "⊘", "3-attempt limit"],
    [
      "Active members",
      members.filter((x) => x.memberStatus === "Active").length,
      "♟",
      "Recently attending",
    ],
    [
      "Visitors",
      members.filter((x) => x.memberStatus === "Visitor").length,
      "◇",
      "Welcome follow-up",
    ],
    [
      "Workers",
      members.filter((x) => x.memberStatus === "Worker").length,
      "✦",
      "Serving teams",
    ],
    [
      "Inactive records",
      members.filter((x) => x.memberStatus === "Inactive").length,
      "–",
      "Retention review",
    ],
  ];
  return `<div class="metrics">${metrics.map((m) => `<div class="metric"><div class="metric-top"><span>${m[0]}</span><span class="metric-icon">${m[2]}</span></div><div class="metric-value">${m[1]}</div><div class="metric-sub">${m[3]}</div></div>`).join("")}</div><div class="admin-grid"><div class="card"><div class="card-head"><h3>Verification activity</h3><small>Last 7 days</small></div><div class="bars">${[38, 62, 47, 88, 69, 94, 76].map((v, i) => `<div class="bar-col"><div class="bar" style="height:${v}%"></div><small>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</small></div>`).join("")}</div></div><div class="card"><div class="card-head"><h3>Record health</h3><small>Live</small></div>${[
    ["Complete", 61],
    ["Verified", 42],
    ["Needs review", 19],
  ]
    .map(
      (x) =>
        `<div class="quality-row"><div><span>${x[0]}</span><b>${x[1]}%</b></div><div class="progress"><i style="width:${x[1]}%"></i></div></div>`,
    )
    .join("")}</div></div>${updateTable(true)}`;
}
function updateTable(compact = false) {
  return `<div class="table-wrap"><div class="table-toolbar"><h3>${compact ? "Recent member updates" : "Submitted updates"}</h3><input placeholder="Search updates…"></div><table><thead><tr><th>Name</th><th>Status</th><th>Fields updated</th><th>Verification</th><th>Submitted</th><th>Review status</th><th>Actions</th></tr></thead><tbody>${state.updates.map((u, i) => `<tr><td><strong>${u.name}</strong></td><td>${badge(u.status)}</td><td>${u.fields}</td><td>${u.method}</td><td>${u.date}</td><td>${badge(u.review)}</td><td><button class="icon-btn" data-view="${i}" title="View details">◉</button> <button class="icon-btn" data-approve="${i}" title="Approve update">✓</button> <button class="icon-btn" data-reject="${i}" title="Reject update">×</button> <button class="icon-btn" data-follow="${i}" title="Mark for follow-up">⚑</button></td></tr>`).join("")}</tbody></table></div>`;
}
function memberTable(rows, title) {
  return `<div class="table-wrap"><div class="table-toolbar"><h3>${title}</h3><input placeholder="Search records…"></div><table><thead><tr><th>Member</th><th>Status</th><th>Completeness</th><th>Missing fields</th><th>Last attendance</th><th>Action</th></tr></thead><tbody>${rows
    .slice(0, 18)
    .map((m) => {
      let miss = [
        "email",
        "phone",
        "postcode",
        "addressLine1",
        "householdName",
        "department",
        "smallGroup",
      ]
        .filter((k) => !m[k])
        .map((x) =>
          x
            .replace("addressLine1", "address")
            .replace("householdName", "household"),
        )
        .join(", ");
      return `<tr><td><strong>${m.firstName} ${m.lastName}</strong><small>${m.id}</small></td><td>${badge(m.memberStatus)}</td><td><div class="progress" style="width:90px"><i style="width:${m.profileCompletenessScore}%"></i></div> ${m.profileCompletenessScore}%</td><td>${miss || "—"}</td><td>${m.lastAttendanceDate}</td><td><button class="btn ghost" style="padding:7px 10px">Review</button></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function duplicates() {
  const a = members[6],
    b = members[41],
    c = members[108];
  return `<div class="card cluster"><div class="cluster-top"><div><h3>Cluster #D-1042</h3><p class="hint">3 possible records · member response: <b>Not sure</b></p></div>${badge("High confidence")}</div><div class="cluster-people"><div class="person"><strong>${a.firstName} ${a.lastName}</strong><small>${a.email}<br>${a.phone}<br>${a.addressLine1}</small></div><span>⇄</span><div class="person"><strong>${b.preferredName} ${b.lastName}</strong><small>${b.email}<br>${b.phone}<br>${b.addressLine1}</small></div></div><div class="match"><b>Matching reasons:</b> Exact email · Exact phone · Similar address · Similar name</div><div class="actions"><button class="btn secondary">Mark duplicate</button><button class="btn ghost">Not duplicate</button><button class="btn ghost">Needs review</button></div><button class="btn danger full" disabled style="margin-top:10px">Merge records · Demo only — complete carefully in the main church system</button></div><div class="card cluster"><div class="cluster-top"><div><h3>Cluster #D-1098</h3><p class="hint">2 possible records · member response: <b>Yes</b></p></div>${badge("Medium confidence")}</div><div class="match"><b>Matching reasons:</b> Similar surname · Same household address · Different contact details</div><div class="actions"><button class="btn secondary">Review comparison</button><button class="btn ghost">Assign to admin</button></div></div>`;
}
function confirmedDuplicates() {
  const a = members[6],
    b = members[41];
  return `<div class="card cluster"><div class="cluster-top"><div><h3>Member-confirmed match</h3><p class="hint">Reference #D-1042 · submitted today</p></div>${badge("Confirmed by member")}</div><div class="cluster-people"><div class="person"><strong>${a.firstName} ${a.lastName}</strong><small>${a.id} · ${a.memberStatus}<br>${a.email}<br>Last attended ${a.lastAttendanceDate}</small></div><span>⇄</span><div class="person"><strong>${b.preferredName} ${b.lastName}</strong><small>${b.id} · ${b.memberStatus}<br>${b.email}<br>Last attended ${b.lastAttendanceDate}</small></div></div><div class="match"><b>Why flagged:</b> Exact email · Exact phone · Similar address · Member selected “This is also me”</div><div class="notice"><b>Decision needed:</b> Check which Planning Center record is active and which is inactive before manually merging or removing a profile.</div><div class="actions"><button class="btn secondary">Mark reviewed</button><button class="btn ghost">Escalate decision</button></div><button class="btn danger full" disabled style="margin-top:10px">No merge here — complete manually in Planning Center</button></div>`;
}
function escalatedCases() {
  const cases = [
    {
      id: "CM 482193",
      reason: "Three failed verification attempts",
      status: "Locked",
      date: "Today, 10:42",
    },
    {
      id: "CM 573904",
      reason: "Fewer than two verification fields available",
      status: "Manual review",
      date: "Yesterday, 13:20",
    },
    {
      id: "V 294761",
      reason: "Member unsure about possible duplicate",
      status: "Needs Review",
      date: "25 Jul 2026",
    },
  ];
  return `<div class="table-wrap"><div class="table-toolbar"><h3>Cases needing a person</h3><input placeholder="Search cases…"></div><table><thead><tr><th>Profile</th><th>Reason</th><th>Status</th><th>Created</th><th>Next step</th></tr></thead><tbody>${cases.map((c) => `<tr><td><strong>${c.id}</strong></td><td>${c.reason}</td><td>${badge(c.status)}</td><td>${c.date}</td><td><button class="btn ghost" style="padding:7px 10px">Review in Planning Center</button></td></tr>`).join("")}</tbody></table></div>`;
}
function logTable() {
  return `<div class="notice">OTP values are never stored. Production audit events are encrypted, access-controlled and automatically deleted after ${AUDIT_RETENTION_DAYS} days.</div><div class="table-wrap"><div class="table-toolbar"><h3>Verification events</h3><input placeholder="Filter logs…"></div><table><thead><tr><th>Event</th><th>Entered name</th><th>Detail</th><th>Time</th><th>Risk</th></tr></thead><tbody>${state.logs
    .concat([
      {
        type: "Manual review",
        name: "CM 573904",
        detail: "Fewer than 2 fields available",
        time: "Yesterday, 13:20",
      },
      {
        type: "Successful",
        name: "Sarah Adeyemi",
        detail: "2 of 3 fields matched",
        time: "23 Jul, 16:11",
      },
    ])
    .map(
      (l) =>
        `<tr><td>${badge(l.type)}</td><td><strong>${esc(l.name)}</strong></td><td>${esc(l.detail)}</td><td>${esc(l.time)}</td><td>${/Failed|Locked/.test(l.type) ? badge("Elevated") : badge("Normal")}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
function quality() {
  const missing = [
    "Email",
    "Phone",
    "Postcode",
    "Address",
    "Household",
    "Department",
    "Small group",
  ].map((n, i) => [n, [19, 28, 22, 17, 34, 39, 45][i]]);
  return `<div class="metrics">${[
    ["Average completeness", "79%", "⌁", "↑ 4% this month"],
    ["Duplicate risk", "11", "◎", "6.5% of records"],
    ["Verified / updated", "71", "✓", "42% campaign reach"],
    ["Recently updated", "24", "↻", "Last 30 days"],
  ]
    .map(
      (m) =>
        `<div class="metric"><div class="metric-top"><span>${m[0]}</span><span class="metric-icon">${m[2]}</span></div><div class="metric-value">${m[1]}</div><div class="metric-sub">${m[3]}</div></div>`,
    )
    .join(
      "",
    )}</div><div class="admin-grid"><div class="card"><div class="card-head"><h3>Missing fields summary</h3><small>Records</small></div>${missing.map((x) => `<div class="quality-row"><div><span>${x[0]}</span><b>${x[1]}</b></div><div class="progress"><i style="width:${x[1] * 2}%"></i></div></div>`).join("")}</div><div class="card"><div class="card-head"><h3>Completeness distribution</h3></div><div class="bars">${[23, 48, 82, 55].map((v, i) => `<div class="bar-col"><div class="bar" style="height:${v}%"></div><small>${["0–49%", "50–69%", "70–89%", "90–100%"][i]}</small></div>`).join("")}</div><div class="notice green">Records above 90% are growing steadily.</div></div></div>`;
}
function render() {
  document.getElementById("app").innerHTML =
    state.mode === "survey"
      ? surveyPage()
      : state.mode === "faq"
      ? faqPage()
      : state.mode === "member"
        ? member()
        : state.mode === "workspace-hub"
          ? operationsHub()
          : state.mode === "admin-login"
            ? adminLogin()
            : state.mode === "pastoral-login"
              ? pastoralLogin()
              : state.mode === "pastoral"
                ? pastoralWorkspace()
                : state.mode === "events"
                  ? eventOperationsComingSoon()
                : admin();
  if (state.mode === "survey" || (state.mode === "member" && (state.campaignStarted || state.step > 1)))
    document.getElementById("app").insertAdjacentHTML("beforeend", faqHelp());
  bind();
  scheduleJourneyPresence();
  scheduleAdminRefresh();
}
async function api(action, body = {}) {
  const response = await fetch("/api/member", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, session: state.sessionToken, ...body }),
  });
  const data = await response.json().catch(() => ({
    ok: false,
    message: "The service is temporarily unavailable.",
  }));
  if (!response.ok) throw new Error(data.message || "Service unavailable");
  return data;
}
async function ensureVisitorSession(force = false) {
  if (!force && state.sessionToken) return state.sessionToken;
  const result = await api("visitorStart", {
    browserId: BROWSER_SESSION_ID,
  });
  if (!result.session) throw new Error("The secure photo session could not be created.");
  state.sessionToken = result.session;
  state.manualReview = true;
  saveDraft();
  return result.session;
}
async function surveyApi(answers) {
  const response = await fetch("/api/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ answers, surveyId: SURVEY_BROWSER_ID }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok) throw new Error(data.message || "Survey unavailable");
  return data;
}
async function adminApi(action, body = {}) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok) {
    const error = new Error(data.message || data.code || "admin_request_failed");
    error.status = response.status;
    throw error;
  }
  return data;
}
let presenceTimer = null,
  adminRefreshTimer = null,
  checkinQrScanner = null,
  lastPresenceSignature = "",
  lastPresenceAt = 0;
async function stopCheckinCamera() {
  if (checkinQrScanner) {
    try { await checkinQrScanner.stop(); } catch {}
    try { checkinQrScanner.destroy(); } catch {}
  }
  checkinQrScanner = null;
  state.checkinCameraActive = false;
}
async function submitCheckinCode(code) {
  const value = String(code || "").trim();
  if (!value) return;
  try {
    const result = await adminApi("checkinScan", {
      code: value,
      location: state.checkinLocation,
      service: state.checkinService,
      device: navigator.userAgent.includes("Mobile") ? "Welcome team phone" : "Welcome desk scanner",
      notify: state.checkinNotify,
    });
    state.checkinResult = { ...result.checkin, duplicate: result.duplicate };
    if (navigator.vibrate) navigator.vibrate(result.duplicate ? [80, 60, 80] : 120);
  } catch (error) {
    state.checkinResult = {
      error: true,
      message: error.message === "admin_request_failed" ? "The card could not be checked in." : error.message,
    };
  }
  await stopCheckinCamera();
  try { state.adminData.checkins = await adminApi("checkinOverview"); } catch {}
  render();
  setTimeout(() => document.querySelector("#checkinCode")?.focus(), 0);
}
async function startCheckinCamera() {
  if (state.checkinCameraActive) {
    await stopCheckinCamera();
    render();
    return;
  }
  const video = document.querySelector("#checkinCamera");
  if (!video) return;
  try {
    const module = await import("/vendor/qr-scanner.min.js"),
      QrScanner = module.default;
    checkinQrScanner = new QrScanner(
      video,
      (scan) => submitCheckinCode(scan?.data || scan),
      { preferredCamera: "environment", returnDetailedScanResult: true, highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 5 },
    );
    await checkinQrScanner.start();
    state.checkinCameraActive = true;
    document.querySelector("#cameraShell")?.classList.add("active");
    const button = document.querySelector("#startCheckinCamera");
    if (button) button.textContent = "Stop camera";
  } catch {
    await stopCheckinCamera();
    state.checkinResult = { error: true, message: "Camera access was unavailable. Allow camera permission or use a handheld scanner." };
    render();
  }
}
function currentJourneyPresence() {
  if (state.mode !== "member" || !state.campaignStarted || state.step < 1)
    return null;
  let stage = "journey_choice",
    label = "Choosing a journey",
    formPage = null,
    blocker = "";
  if (state.journeyType && state.step === 1)
    [stage, label] = ["name_search", "Starting secure lookup"];
  if (state.step === 2)
    [stage, label] = ["contact_match", "Confirming contact details"];
  if (state.step === 3) {
    if (state.verificationUnavailable)
      [stage, label, blocker] = [
        "contact_match",
        "Could not verify details",
        "Verification did not match",
      ];
    else if (state.otpSent) [stage, label] = ["otp_entry", "Entering SMS code"];
    else [stage, label] = ["otp_waiting", "Requesting SMS code"];
  }
  if (state.step === 4)
    [stage, label] = ["identity_check", "Confirming identity"];
  if (state.step === 5) {
    if (state.journeyType === "visitor")
      [stage, label] = ["form_identity", "Visitor details"];
    else {
      formPage = state.profileFormPage;
      [stage, label] =
        formPage === 1
          ? ["form_identity", "Identity & contact"]
          : formPage === 2
            ? ["form_home", "Home & faith"]
            : ["form_church", "Church & work"];
    }
  }
  if (state.step === 6)
    [stage, label] = ["review", "Reviewing before submission"];
  if (state.step >= 7) [stage, label] = ["complete", "Completed"];
  return {
    journeyId: state.presenceId,
    journeyType: state.journeyType || "unknown",
    stage,
    stageLabel: label,
    formPage,
    blocker,
    status: state.step >= 7 ? "completed" : "active",
  };
}
function sendJourneyPresence(statusOverride = "", keepalive = false) {
  const presence = currentJourneyPresence();
  if (!presence) return;
  if (statusOverride) presence.status = statusOverride;
  const signature = JSON.stringify(presence),
    now = Date.now();
  if (
    !statusOverride &&
    signature === lastPresenceSignature &&
    now - lastPresenceAt < 25000
  )
    return;
  lastPresenceSignature = signature;
  lastPresenceAt = now;
  fetch("/api/member", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      action: "presence",
      session: state.sessionToken,
      ...presence,
    }),
    keepalive,
  }).catch(() => {});
}
function scheduleJourneyPresence() {
  clearInterval(presenceTimer);
  if (!currentJourneyPresence()) return;
  sendJourneyPresence();
  presenceTimer = setInterval(() => sendJourneyPresence(), 30000);
}
function scheduleAdminRefresh() {
  clearInterval(adminRefreshTimer);
  if (
    state.mode !== "admin" ||
    !["Live Operations", "Check-ins"].includes(state.adminPage) ||
    IS_LOCAL
  )
    return;
  adminRefreshTimer = setInterval(async () => {
    // Re-rendering replaces the live video element and interrupts its stream.
    if (state.adminPage === "Check-ins" && state.checkinCameraActive) return;
    try {
      await loadAdmin();
      render();
    } catch {}
  }, 15000);
}
async function loadAdmin() {
  if (state.adminPage === "Check-ins") {
    const checkins = await adminApi("checkinOverview", {
      date: state.checkinDate,
      location: state.checkinHistoryLocation,
      service: state.checkinHistoryService,
      search: state.checkinHistorySearch,
    });
    state.adminData = {
      ...state.adminData,
      checkins,
    };
    return;
  }
  if (state.adminPage === "Pastoral Care") {
    const pastoral = await adminApi("pastoralCases", {
      status: state.pastoralStatus,
    });
    state.adminData = { ...state.adminData, pastoral };
    return;
  }
  if (state.adminPage === "Profile Reviews") {
    const [overview, operations] = await Promise.all([
      adminApi("overview"),
      adminApi("operations"),
    ]);
    state.adminData = {
      records: overview.records || [],
      audits: [],
      counts: overview.counts || {},
      pagination: {
        page: 1,
        pageSize: 150,
        total: overview.records?.length || 0,
      },
      operations,
      checkins: state.adminData.checkins,
      pastoral: state.adminData.pastoral,
    };
    return;
  }
  const kind =
      state.adminPage === "Confirmed Duplicates"
        ? "possible_duplicate"
        : state.adminPage === "Visitors"
          ? "visitor"
          : state.adminPage === "Escalated Cases"
            ? "manual_review"
            : "profile_update",
    [data, operations] = await Promise.all([
      adminApi("list", {
        kind,
        page: state.adminPageNumber,
        includeAudits: state.adminPage === "Audit Log",
      }),
      adminApi("operations"),
    ]);
  state.adminData = {
    records: data.records || [],
    audits: data.audits || [],
    counts: data.counts || {},
    pagination: data.pagination || {},
    operations,
    checkins: state.adminData.checkins,
    pastoral: state.adminData.pastoral,
  };
}
async function loadProviderStatus() {
  try {
    const response = await fetch("/api/service-status", {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data = await response.json();
      state.providers = { sms: Boolean(data.delivery?.sms), checked: true };
      if (state.step === 3 && !state.otpSent) render();
    }
  } catch {
    state.providers.checked = true;
  }
}
function manualCandidate() {
  const parts = state.search.trim().split(/\s+/);
  return {
    id: `MANUAL-${Date.now()}`,
    firstName: parts.shift() || "",
    lastName: parts.join(" "),
    preferredName: "",
    email: "",
    phone: "",
    postcode: "",
    addressLine1: "",
    householdName: "",
    memberStatus: "Needs Review",
    department: "",
    smallGroup: "",
    possibleDuplicateIds: [],
  };
}
function acceptVerification(result) {
  if (result.ok && result.manualReview) {
    state.verified = true;
    state.selected = manualCandidate();
    state.manualReview = true;
    state.step = 5;
  } else if (result.ok) {
    state.verified = true;
    const previous = result.pendingSubmission || {};
    state.selected = { id: "verified", ...result.profile, ...previous };
    state.formDraft = {
      ...result.profile,
      ...previous,
      ...state.formDraft,
      membershipStatus: state.journeyType || "attendee",
      connectCompleted: state.journeyType === "member" ? "yes" : "no_or_unsure",
    };
    state.photo = previous.photo || null;
    state.existingPhoto = result.existingPhoto || "";
    state.planningCenterPhoto = result.existingPhoto || "";
    state.groupSelections =
      previous.groups || result.profile.groups || state.groupSelections;
    state.matchedDuplicateIds = result.profile.possibleDuplicateIds || [];
    state.duplicateCandidates = result.profile.duplicateCandidates || [];
    state.internalReviewCount = result.profile.internalReviewCount || 0;
    state.duplicateIndex = 0;
    state.step = 4;
  } else {
    state.attempts = 3 - (result.remaining || 0);
  }
}
function bind() {
  if ($("#openSurvey"))
    $("#openSurvey").onclick = () => {
      state.mode = "survey";
      history.replaceState(null, "", "#survey");
      render();
      scrollTo(0, 0);
    };
  if ($("#openFaq"))
    $("#openFaq").onclick = () => {
      state.mode = "faq";
      history.replaceState(null, "", "#faq");
      render();
      scrollTo(0, 0);
    };
  if ($("#faqFab")) {
    const sheet = $("#faqSheet");
    $("#faqFab").onclick = () => sheet.showModal();
    $("#faqSheetClose").onclick = () => sheet.close();
    sheet.onclick = (event) => {
      if (event.target === sheet) sheet.close();
    };
  }
  for (const id of ["#faqClose", "#faqHome"])
    if ($(id))
      $(id).onclick = () => {
        state.mode = "member";
        state.campaignStarted = false;
        history.replaceState(null, "", location.pathname);
        render();
      };
  if ($("#surveyClose"))
    $("#surveyClose").onclick = () => {
      if (
        $("#healthSurvey") &&
        !confirm(
          "Close the survey? Answers that have not been submitted will be cleared.",
        )
      )
        return;
      state.mode = "member";
      state.campaignStarted = false;
      history.replaceState(null, "", location.pathname);
      render();
    };
  if ($("#surveyHome"))
    $("#surveyHome").onclick = () => {
      state.mode = "member";
      history.replaceState(null, "", location.pathname);
      render();
    };
  const surveyCampus = document.querySelector(
    '#healthSurvey select[name="campus"]',
  );
  if (
    surveyCampus &&
    ![...surveyCampus.options].some(
      (option) => option.value === "Liberty Point Woodford",
    )
  ) {
    const woodford = new Option(
        "Liberty Point Woodford",
        "Liberty Point Woodford",
      ),
      northLondon = [...surveyCampus.options].find(
        (option) => option.value === "North London",
      );
    surveyCampus.insertBefore(
      woodford,
      northLondon || surveyCampus.options[1] || null,
    );
  }
  const surveyOnline = [...(surveyCampus?.options || [])].find(
    (option) => option.value === "Other / online",
  );
  if (surveyOnline) {
    surveyOnline.value = "e-TLC";
    surveyOnline.textContent = "e-TLC";
  }
  const surveyIntro = document.querySelector(".survey-intro");
  if (surveyIntro)
    surveyIntro.textContent = surveyIntro.textContent.replace(
      "TLC ID",
      "YouCount Number",
    );
  if ($("#healthSurvey")) {
    const healthSurvey = $("#healthSurvey");
    healthSurvey.noValidate = true;
    healthSurvey
      .querySelectorAll('.survey-question input[type="radio"]')
      .forEach((input) =>
        input.addEventListener("change", () => {
          input.closest(".survey-question")?.classList.remove(
            "survey-question-error",
          );
          input.closest(".survey-question")?.removeAttribute("aria-invalid");
          healthSurvey.querySelector(".survey-validation-message")?.remove();
        }),
      );
    healthSurvey.onsubmit = async (event) => {
      event.preventDefault();
      if (!validateSurveyForm(event.currentTarget)) return;
      const button = $("#surveySubmit");
      button.disabled = true;
      try {
        await surveyApi(Object.fromEntries(new FormData(event.target)));
        state.surveySubmitted = true;
        try {
          localStorage.setItem(
            "tlc_anonymous_survey_submitted_at",
            String(Date.now()),
          );
        } catch {}
        if (state.surveyReturnToCard) {
          state.mode = "member";
          state.completionStage = "card";
          state.surveySkipped = false;
          state.surveyReturnToCard = false;
          history.replaceState(null, "", location.pathname);
        }
        render();
        scrollTo(0, 0);
      } catch (error) {
        button.disabled = false;
        alert(error.message || "We could not submit the survey.");
      }
    };
  }
  if ($("#campaignContinue"))
    $("#campaignContinue").onclick = () => {
      state.campaignStarted = true;
      render();
    };
  document.querySelectorAll("[data-journey]").forEach((button) => {
    button.onclick = () => {
      state.journeyType = button.dataset.journey;
      if (state.journeyType === "visitor") {
        state.groupSelections = [];
        state.groupResults = [];
      }
      state.formDraft = {
        ...state.formDraft,
        membershipStatus: state.journeyType,
        connectCompleted:
          state.journeyType === "member"
            ? "yes"
            : state.journeyType === "attendee"
              ? "no_or_unsure"
              : "no",
      };
      if (state.journeyType === "visitor") {
        state.search = "";
        state.selected = manualCandidate();
        state.manualReview = true;
        state.verified = false;
        state.step = 5;
      }
      saveDraft();
      render();
    };
  });
  const journeyStartPanel = document.querySelector(".campaign-form-panel");
  if (
    journeyStartPanel &&
    state.step === 1 &&
    state.journeyType &&
    $("#search") &&
    !$("#changeJourney")
  ) {
    const labels = {
        member: "TLC member · Connect completed",
        attendee: "Regular attendee · Connect not completed or unsure",
        visitor: "New or visiting TLC",
      },
      summary = document.createElement("div");
    summary.className = "journey-summary journey-summary-start";
    summary.innerHTML = `<span>${labels[state.journeyType]}</span><button type="button" id="changeJourney">Change</button>`;
    journeyStartPanel.querySelector(".campaign-kicker")?.before(summary);
  }
  if ($("#changeJourney")) $("#changeJourney").onclick = restartJourneyChoice;
  if ($("#profileClose"))
    $("#profileClose").onclick = () => {
      if (
        !confirm(
          "Close your profile update? Information that has not been submitted will be cleared from this device.",
        )
      )
        return;
      sendJourneyPresence("closed", true);
      resetMemberJourney();
      state.mode = "member";
      history.replaceState(null, "", location.pathname);
      render();
      scrollTo(0, 0);
    };
  if ($("#adminDot"))
    $("#adminDot").onclick = () => {
      state.mode = "workspace-hub";
      render();
    };
  if ($("#hubBack")) $("#hubBack").onclick = () => { state.mode = "member"; render(); };
  if ($("#hubData")) $("#hubData").onclick = () => { state.mode = "admin-login"; render(); };
  if ($("#hubPastoral")) $("#hubPastoral").onclick = () => { state.mode = "pastoral-login"; render(); };
  if ($("#hubAttendance")) $("#hubAttendance").onclick = () => { location.href = "/check-in"; };
  if ($("#pastoralBack")) $("#pastoralBack").onclick = () => { if (PRODUCT_PATH === "/member-care") location.href = SERVESPACE_URL; else { state.mode = "workspace-hub"; render(); } };
  if ($("#pastoralHub")) $("#pastoralHub").onclick = () => { if (PRODUCT_PATH === "/member-care") location.href = SERVESPACE_URL; else { state.mode = "workspace-hub"; render(); } };
  if ($("#eventBack")) $("#eventBack").onclick = () => { location.href = SERVESPACE_URL; };
  if ($("#pastoralLoginForm"))
    $("#pastoralLoginForm").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button");
      button.disabled = true;
      try {
        await adminApi("pastoralLogin", { pin: $("#pastoralPin").value });
        state.adminData.pastoral = await adminApi("pastoralWorkspace", { status: state.pastoralStatus });
        state.pastoralAuthenticated = true;
        state.mode = "pastoral";
        render();
      } catch (error) {
        $("#pastoralLoginError").textContent = error.message || "That PIN was not recognised.";
        $("#pastoralLoginError").hidden = false;
        $("#pastoralPin").value = "";
        $("#pastoralPin").focus();
        button.disabled = false;
      }
    };
  if ($("#pastoralLogout"))
    $("#pastoralLogout").onclick = async () => {
      try { await adminApi("pastoralLogout"); } catch {}
      state.pastoralAuthenticated = false;
      state.mode = "workspace-hub";
      render();
    };
  if ($("#stepBack"))
    $("#stepBack").onclick = () => {
      if (state.step === 3 && state.otpSent) {
        state.otpSent = false;
      } else if (state.step === 3 && state.verificationUnavailable) {
        state.verificationUnavailable = false;
        state.step = 2;
      } else if (state.step === 5 && state.manualReview) {
        state.manualReview = false;
        state.pendingUpdate = null;
        state.step = 3;
      } else state.step = Math.max(1, state.step - 1);
      render();
    };
  if ($("#loginBack"))
    $("#loginBack").onclick = () => {
      if (PRODUCT_PATH === "/data") location.href = SERVESPACE_URL;
      else {
        state.mode = "workspace-hub";
        render();
      }
    };
  if ($("#logoutAdmin"))
    $("#logoutAdmin").onclick = async () => {
      try {
        await adminApi("logout");
      } catch {}
      state.adminAuthenticated = false;
      state.mode = "workspace-hub";
      render();
    };
  if ($("#adminLoginForm"))
    $("#adminLoginForm").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector("button");
      button.disabled = true;
      try {
        await adminApi("login", { password: $("#adminPassword").value });
        state.adminPage = "Profile Reviews";
        await loadAdmin();
        state.adminAuthenticated = true;
        state.mode = "admin";
        render();
      } catch {
        $("#loginError").hidden = false;
        $("#adminPassword").value = "";
        $("#adminPassword").focus();
        button.disabled = false;
      }
    };
  if ($("#attendanceForm"))
    $("#attendanceForm").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button"),
        attendance = Number($("#serviceAttendance").value || 0);
      button.disabled = true;
      try {
        await adminApi("operationsTarget", { attendance });
        await loadAdmin();
        render();
      } catch {
        button.disabled = false;
        alert("Could not save today’s service attendance.");
      }
    };
  if ($("#checkinScanForm"))
    $("#checkinScanForm").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button");
      button.disabled = true;
      await submitCheckinCode($("#checkinCode").value);
    };
  if ($("#checkinLocation"))
    $("#checkinLocation").onchange = (event) => {
      state.checkinLocation = event.target.value;
      localStorage.setItem("tlc_checkin_location", state.checkinLocation);
    };
  if ($("#checkinService"))
    $("#checkinService").onchange = (event) => {
      state.checkinService = event.target.value.trim() || "Sunday Service";
      localStorage.setItem("tlc_checkin_service", state.checkinService);
    };
  if ($("#checkinNotify"))
    $("#checkinNotify").onchange = (event) => {
      state.checkinNotify = event.target.checked;
    };
  if ($("#startCheckinCamera"))
    $("#startCheckinCamera").onclick = startCheckinCamera;
  if ($("#refreshCheckins"))
    $("#refreshCheckins").onclick = async () => {
      await loadAdmin();
      render();
    };
  if ($("#checkinFilters"))
    $("#checkinFilters").onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      state.checkinDate = String(data.get("date") || state.checkinDate);
      state.checkinHistoryLocation = String(data.get("location") || "");
      state.checkinHistoryService = String(data.get("service") || "");
      state.checkinHistorySearch = String(data.get("search") || "").trim();
      await stopCheckinCamera();
      await loadAdmin();
      render();
    };
  if ($("#clearCheckinFilters"))
    $("#clearCheckinFilters").onclick = async () => {
      state.checkinDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      state.checkinHistoryLocation = "";
      state.checkinHistoryService = "";
      state.checkinHistorySearch = "";
      await loadAdmin();
      render();
    };
  if ($("#pastoralStatus"))
    $("#pastoralStatus").onchange = async (event) => {
      state.pastoralStatus = event.target.value;
      if (state.mode === "pastoral")
        state.adminData.pastoral = await adminApi("pastoralWorkspace", { status: state.pastoralStatus });
      else await loadAdmin();
      render();
    };
  document.querySelectorAll(".pastoral-case-form").forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector("button"),
        data = new FormData(form);
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        await adminApi(state.mode === "pastoral" ? "pastoralWorkspaceUpdate" : "pastoralCaseUpdate", {
          caseId: Number(form.dataset.caseId),
          status: String(data.get("status") || "open"),
          assignedTo: String(data.get("assignedTo") || ""),
          resolution: String(data.get("resolution") || ""),
          note: String(data.get("note") || ""),
        });
        if (state.mode === "pastoral")
          state.adminData.pastoral = await adminApi("pastoralWorkspace", { status: state.pastoralStatus });
        else await loadAdmin();
        render();
      } catch (error) {
        button.disabled = false;
        button.textContent = "Save care update";
        alert(error.message || "The care update could not be saved.");
      }
    };
  });
  if ($("#surveyPinForm"))
    $("#surveyPinForm").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.target.querySelector("button");
      button.disabled = true;
      try {
        await adminApi("surveyUnlock", { pin: $("#surveyPin").value });
        const data = await adminApi("surveyList");
        state.surveyUnlocked = true;
        state.surveyData = data.responses || [];
        render();
      } catch (error) {
        const message = $("#surveyPinError");
        message.textContent =
          error.status === 429
            ? "Too many incorrect attempts. Please wait 30 minutes or ask an administrator for help."
            : "That PIN was not recognised. Please check it and try again.";
        message.hidden = false;
        $("#surveyPin").value = "";
        button.disabled = false;
      }
    };
  if ($("#surveyLocationFilter"))
    $("#surveyLocationFilter").onchange = (event) => {
      state.surveyLocationFilter = event.target.value;
      render();
    };
  document.querySelectorAll("[data-survey-location]").forEach((button) => {
    button.onclick = () => {
      state.surveyLocationFilter = button.dataset.surveyLocation;
      render();
      document.querySelector(".survey-insights")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
  document.querySelectorAll("[data-survey-comment]").forEach((button) => {
    button.onclick = () => {
      state.surveyCommentGroup = button.dataset.surveyComment;
      render();
      document.querySelector(".survey-feedback-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
  document.querySelectorAll("[data-step]").forEach(
    (b) =>
      (b.onclick = () => {
        state.step = +b.dataset.step;
        render();
      }),
  );
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (state.adminPage === "Check-ins" && b.dataset.page !== "Check-ins")
          await stopCheckinCamera();
        state.adminPage = b.dataset.page;
        state.adminPageNumber = 1;
        state.adminSearch = "";
        state.adminSelectedRecordId = null;
        state.adminMenuOpen = false;
        if (!IS_LOCAL)
          try {
            await loadAdmin();
            if (state.adminPage === "Health Survey" && state.surveyUnlocked) {
              const survey = await adminApi("surveyList");
              state.surveyData = survey.responses || [];
            }
          } catch {}
        render();
      }),
  );
  if ($("#adminMenuButton"))
    $("#adminMenuButton").onclick = () => {
      state.adminMenuOpen = !state.adminMenuOpen;
      render();
    };
  if ($("#adminMenuShade"))
    $("#adminMenuShade").onclick = () => {
      state.adminMenuOpen = false;
      render();
    };
  if ($("#queueToggle"))
    $("#queueToggle").onclick = () => {
      state.adminQueuesOpen = !state.adminQueuesOpen;
      render();
    };
  document.querySelectorAll("[data-admin-filter]").forEach((button) => {
    button.onclick = () => {
      state.adminStatusFilter = button.dataset.adminFilter;
      state.adminSelectedRecordId = null;
      render();
    };
  });
  document.querySelectorAll("[data-open-record]").forEach((button) => {
    button.onclick = () => {
      state.adminSelectedRecordId = button.dataset.openRecord;
      render();
      scrollTo(0, 0);
    };
  });
  if ($("#closeRecordDetail"))
    $("#closeRecordDetail").onclick = () => {
      state.adminSelectedRecordId = null;
      render();
    };
  document.querySelectorAll("[data-connect-status]").forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await adminApi("identityConnect", {
            id: Number(button.dataset.recordId),
            completed: button.dataset.connectStatus === "true",
          });
          await loadAdmin();
          render();
        } catch {
          button.disabled = false;
          alert("The YouCount Number status could not be updated.");
        }
      }),
  );
  document.querySelectorAll("[data-save-role]").forEach((button) => {
    button.onclick = async () => {
      const select = button.closest(".identity-role-control")?.querySelector("[data-role-code]");
      button.disabled = true;
      try {
        await adminApi("identityRole", {
          identityId: Number(button.dataset.identityId),
          roleCode: select?.value || "",
        });
        await loadAdmin();
        render();
      } catch (error) {
        button.disabled = false;
        alert(error.message || "The role code could not be updated.");
      }
    };
  });
  if ($("#searchBtn")) $("#searchBtn").onclick = search;
  if ($("#adminSearch"))
    $("#adminSearch").oninput = (event) => {
      const value = event.target.value,
        position = event.target.selectionStart;
      state.adminSearch = value;
      render();
      const next = $("#adminSearch");
      next?.focus();
      next?.setSelectionRange(position, position);
    };
  if ($("#adminGlobalSearch"))
    $("#adminGlobalSearch").oninput = (event) => {
      const value = event.target.value,
        position = event.target.selectionStart;
      state.adminSearch = value;
      render();
      const next = $("#adminGlobalSearch");
      next?.focus();
      next?.setSelectionRange(position, position);
    };
  document.querySelectorAll(".person-cell img").forEach((image) => {
    image.removeAttribute("onerror");
    image.onerror = () => image.remove();
  });
  if ($("#search"))
    $("#search").onkeydown = (e) => {
      if (e.key === "Enter") search();
    };
  if ($("#contactForm"))
    $("#contactForm").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector("button");
      button.disabled = true;
      try {
        const result = await api("evidence", {
          last3: $("#phoneLast3").value,
          email: $("#emailConfirm").value,
        });
        if (result.testProfile) {
          const verified = await api("verify", { testProfile: true });
          acceptVerification(verified);
          render();
          return;
        }
        state.providers = { ...result.delivery, checked: true };
        state.otpSent = false;
        state.verificationUnavailable = !result.verificationAvailable;
        state.deliveryMethod = "sms";
        state.step = 3;
        saveDraft();
        render();
      } catch {
        button.disabled = false;
        alert("The service is temporarily unavailable. Please try again.");
      }
    };
  if ($("#retryEvidence"))
    $("#retryEvidence").onclick = () => {
      state.verificationUnavailable = false;
      state.otpSent = false;
      state.step = 2;
      saveDraft();
      render();
    };
  if ($("#sendOtp"))
    $("#sendOtp").onclick = async () => {
      if (!state.deliveryMethod) return;
      $("#sendOtp").disabled = true;
      try {
        await api("send", { method: state.deliveryMethod });
        state.otpSent = true;
        state.verificationError = "";
        saveDraft();
        render();
      } catch (error) {
        state.verificationError =
          error.message || "We could not send a code right now. Please try again.";
        render();
      }
    };
  if ($("#resendOtp"))
    $("#resendOtp").onclick = async () => {
      $("#resendOtp").disabled = true;
      try {
        await api("send", { method: state.deliveryMethod });
        render();
      } catch {
        render();
      }
    };
  if ($("#manualRoute"))
    $("#manualRoute").onclick = async () => {
      const button = $("#manualRoute");
      button.disabled = true;
      try {
        await api("manualRoute");
        state.selected = state.selected || manualCandidate();
        state.manualReview = true;
        state.verified = false;
        audit(
          "Manual review",
          state.search,
          `OTP not received or contact details outdated; route ${DATA_TEAM_EMAIL}`,
        );
        state.step = 5;
        render();
      } catch (error) {
        button.disabled = false;
        alert(
          error.message ||
            "We could not open the manual-review form. Please try again.",
        );
      }
    };
  if ($("#otpBtn"))
    $("#otpBtn").onclick = async () => {
      const code = $("#otp").value.replace(/\D/g, "");
      if (code.length !== 6) {
        state.verificationError = "Enter all six digits from the text message.";
        render();
        return;
      }
      $("#otpBtn").disabled = true;
      try {
        const result = await api("verify", { code });
        state.verificationError = "";
        acceptVerification(result);
        saveDraft();
        render();
      } catch (error) {
        state.verificationError =
          error.message ||
          "We could not check that code. Please send another code or continue without text verification.";
        render();
      }
    };
  if ($("#thisIsMe"))
    $("#thisIsMe").onclick = () => {
      audit("Confirmed", state.search, 'Member selected "This is me"');
      state.step = 5;
      render();
    };
  if ($("#notMe"))
    $("#notMe").onclick = () => {
      audit("Rejected match", state.search, 'Member selected "No, this isn’t me"');
      state.selected = null;
      state.verified = false;
      state.existingPhoto = "";
      state.planningCenterPhoto = "";
      state.search = "";
      state.step = 1;
      render();
    };
  if ($("#addTeam"))
    $("#addTeam").onclick = () => {
      const wrap = $("#servingTeams");
      if (wrap.children.length >= 6) return;
      const row = document.createElement("div");
      row.className = "team-entry";
      row.innerHTML =
        '<input name="servingTeams" placeholder="Another team"><button type="button" class="remove-team" aria-label="Remove team">×</button>';
      wrap.appendChild(row);
      bindTeamRemove();
    };
  bindTeamRemove();
  if (state.journeyType === "visitor" && state.step === 5) {
    bindPhotoUpload();
    restoreFormDraft();
    bindVisitorFields();
    bindEthnicityQuestion();
    bindCommunicationOptions();
    applyProfileTerminology();
    bindAgeGroupField();
    bindSearchableLongSelects();
    bindPostcodeLookup();
    bindDraftAutosave();
  } else {
    bindCensusFields();
    applyJourneyClassification();
    bindJobFields();
    bindPhotoUpload();
    restoreFormDraft();
    bindCommunicationOptions();
    applyProfileTerminology();
    bindAgeGroupField();
    bindProfileWizard();
    bindLocationFields();
    bindEthnicityQuestion();
    bindSearchableLongSelects();
    bindPostcodeLookup();
    bindDraftAutosave();
    bindGroupPickers();
    bindTailoredInterestOptions();
  }
  if ($("#updateForm")) {
    // Keep validation inside our handler so an off-screen invalid field cannot
    // make the mobile review button appear unresponsive.
    $("#updateForm").noValidate = true;
    $("#updateForm").onsubmit = async (e) => {
      e.preventDefault();
      if (
        state.journeyType === "visitor" &&
        !validateVisitorForm(e.currentTarget)
      )
        return;
      if (
        typeof e.currentTarget._validateWizard === "function" &&
        !e.currentTarget._validateWizard()
      )
        return;
      const submitButton = e.submitter;
      if (submitButton) {
        submitButton.disabled = true;
        if (state.journeyType === "visitor")
          submitButton.textContent = "Preparing your review…";
      }
      const data = new FormData(e.target);
      const changes = Object.fromEntries(data);
      changes.communicationPreference = [
        ...new Set(
          data
            .getAll("communicationPreference")
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      ];
      const mayContact = changes.consent === "Yes";
      if (mayContact && !changes.communicationPreference.length) {
        const group = e.currentTarget.querySelector(".communication-methods"),
          error = group?.querySelector(".communication-error");
        if (error) error.hidden = false;
        group?.scrollIntoView({ behavior: "smooth", block: "center" });
        submitButton && (submitButton.disabled = false);
        return;
      }
      if (!mayContact) changes.communicationPreference = [];
      delete changes.ethnicitySelection;
      changes.volunteeringInterests = [
        ...new Set(
          data
            .getAll("volunteeringInterests")
            .map((value) => String(value).trim())
            .filter(Boolean),
        ),
      ];
      for (const scope of ["Origin", "Residence"]) {
        const key = `countryOf${scope}`,
          otherKey = `${key}Other`;
        if (changes[key] === "OTHER") changes[key] = changes[otherKey] || "";
        else if (changes[key]) changes[key] = countryName(changes[key]);
        delete changes[otherKey];
      }
      changes.servingTeams = data
        .getAll("servingTeams")
        .map((x) => String(x).trim())
        .filter(Boolean);
      changes.servingTeams = [
        ...new Set([
          ...changes.servingTeams,
          ...state.groupSelections
            .filter(isTeamGroup)
            .map((group) => group.name),
        ]),
      ];
      changes.familyAttendees = collectFamilyAttendees(data);
      [
        "familyAttendeeName",
        "familyAttendeeRelationship",
        "familyAttendeeLocation",
      ].forEach((key) => delete changes[key]);
      const eligibleGroups =
        changes.membershipStatus === "visitor" ? [] : state.groupSelections;
      changes.groups = eligibleGroups;
      changes.smallGroup = eligibleGroups.find(isSmallGroup) || null;
      changes.otherGroups = eligibleGroups.filter(
        (group) => group.id !== changes.smallGroup?.id,
      );
      changes.photo = state.photo;
      // Persist the complete form before any network request. A visitor keeps
      // every answer if session creation, review preparation or connectivity
      // fails, and can retry without re-entering the form.
      state.formDraft = changes;
      state.pendingUpdate = changes;
      saveDraft();
      if (state.journeyType === "visitor") {
        try {
          const startVisitorSession = async () => {
            state.search =
              `${changes.firstName || ""} ${changes.lastName || ""}`.trim();
            await ensureVisitorSession(true);
          };
          if (!state.sessionToken) await ensureVisitorSession();
          try {
            await api("manualRoute", { kind: "visitor" });
          } catch {
            // A visitor may return to a saved form after the original secure
            // session expired. Create one fresh session and retry once rather
            // than leaving the review button apparently unresponsive.
            state.sessionToken = "";
            await startVisitorSession();
            await api("manualRoute", { kind: "visitor" });
          }
          state.selected = manualCandidate();
          state.manualReview = true;
          state.verified = false;
          state.matchedDuplicateIds = [];
        } catch {
          if (submitButton) submitButton.disabled = false;
          alert(
            "We could not securely save your details right now. Please try again.",
          );
          return;
        }
      }
      state.step = 6;
      saveDraft();
      render();
      scrollTo(0, 0);
    };
  }
  document.querySelectorAll("[data-choice]").forEach(
    (b) =>
      (b.onclick = () => {
        state.duplicateChoices[b.dataset.id] = +b.dataset.choice;
        saveDraft();
        render();
      }),
  );
  if ($("#previousDuplicate"))
    $("#previousDuplicate").onclick = () => {
      state.duplicateIndex = Math.max(0, state.duplicateIndex - 1);
      saveDraft();
      render();
    };
  if ($("#nextDuplicate"))
    $("#nextDuplicate").onclick = () => {
      if (
        state.duplicateChoices[
          state.duplicateCandidates[state.duplicateIndex].id
        ] === undefined
      )
        return;
      state.duplicateIndex = Math.min(
        state.duplicateCandidates.length - 1,
        state.duplicateIndex + 1,
      );
      saveDraft();
      render();
    };
  if ($("#submitFinal"))
    $("#submitFinal").onclick = async () => {
      $("#submitFinal").disabled = true;
      try {
        const result = await api("submit", {
          changes: state.pendingUpdate || {},
          choices: state.duplicateChoices,
          manual: state.manualReview,
        });
        state.lastIdentity = result.identity || null;
        state.identityEmailMessage = "";
        state.completionStage = state.surveySubmitted ? "card" : "survey";
        state.surveySkipped = false;
        clearDraft();
        state.step = 7;
        render();
      } catch (error) {
        render();
        alert(
          error.message || "We could not submit this update. Please try again.",
        );
      }
    };
  if ($("#editProfile"))
    $("#editProfile").onclick = () => {
      state.formDraft = { ...(state.pendingUpdate || {}) };
      state.profileFormPage = 1;
      state.step = 5;
      saveDraft();
      render();
    };
  if ($("#resendIdentityEmail"))
    $("#resendIdentityEmail").onclick = async () => {
      const button = $("#resendIdentityEmail");
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        const result = await api("resendIdentityEmail");
        state.identityEmailMessage = result.message;
      } catch (error) {
        state.identityEmailMessage =
          error.message ||
          "The email could not be sent. Please try again later.";
      }
      render();
    };
  const googleWalletForm = document.querySelector(".google-wallet-form");
  if (googleWalletForm)
    googleWalletForm.onsubmit = async (event) => {
      event.preventDefault();
      const button = googleWalletForm.querySelector(".google-wallet-button"),
        status = googleWalletForm.querySelector(".wallet-action-status");
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      status.classList.remove("error");
      status.textContent = "Preparing your Google Wallet card…";
      try {
        const result = await api("googleWallet", { response: "json" });
        const target = new URL(result.url);
        if (
          target.protocol !== "https:" ||
          !["pay.google.com", "wallet.google.com"].includes(target.hostname)
        )
          throw new Error("The Google Wallet link was not valid.");
        status.textContent = "Opening Google Wallet…";
        window.location.assign(target.href);
      } catch (error) {
        status.classList.add("error");
        status.textContent =
          error.message ||
          "Google Wallet could not be opened. Please try again.";
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    };
  if ($("#restart"))
    $("#restart").onclick = () => {
      resetMemberJourney();
      render();
    };
  if ($("#takeSurvey"))
    $("#takeSurvey").onclick = () => {
      state.surveyReturnToCard = true;
      state.mode = "survey";
      history.replaceState(null, "", "#survey");
      render();
      scrollTo(0, 0);
    };
  if ($("#skipSurvey"))
    $("#skipSurvey").onclick = () => {
      state.completionStage = "card";
      state.surveySkipped = true;
      render();
      scrollTo(0, 0);
    };
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        alert(
          `${state.updates[+b.dataset.view].name}\nUpdated: ${state.updates[+b.dataset.view].fields}\nDemo detail view — no sensitive verification answers are stored.`,
        );
      }),
  );
  document.querySelectorAll("[data-approve]").forEach(
    (b) =>
      (b.onclick = () => {
        memberService.approveUpdate(+b.dataset.approve);
        state.updates[+b.dataset.approve].review = "Approved";
        render();
      }),
  );
  document.querySelectorAll("[data-reject]").forEach(
    (b) =>
      (b.onclick = () => {
        state.updates[+b.dataset.reject].review = "Rejected";
        render();
      }),
  );
  document.querySelectorAll("[data-follow]").forEach(
    (b) =>
      (b.onclick = () => {
        state.updates[+b.dataset.follow].review = "Follow-up";
        render();
      }),
  );
  document.querySelectorAll("[data-record-status]").forEach(
    (control) =>
      (control.onchange = async () => {
        control.disabled = true;
        try {
          await adminApi("status", {
            id: Number(control.dataset.recordId),
            status: control.value,
          });
          await loadAdmin();
          render();
        } catch {
          control.disabled = false;
          alert("Could not update this review status.");
        }
      }),
  );
  document.querySelectorAll("[data-admin-page]").forEach(
    (button) =>
      (button.onclick = async () => {
        state.adminPageNumber = Number(button.dataset.adminPage) || 1;
        await loadAdmin();
        render();
        scrollTo(0, 0);
      }),
  );
}
async function search() {
  state.search = $("#search").value.trim();
  if (!state.search) return;
  if (state.sessionToken) clearDraft();
  $("#searchBtn").disabled = true;
  try {
    const result = await api("start", {
      name: state.search,
      browserId: BROWSER_SESSION_ID,
    });
    if (!result.session) throw new Error();
    state.sessionToken = result.session;
    state.selected = null;
    state.matchedDuplicateIds = [];
    state.otpSent = false;
    state.manualReview = state.journeyType === "visitor";
    if (state.journeyType === "visitor") {
      state.selected = manualCandidate();
      state.formDraft = {
        ...state.formDraft,
        firstName: state.selected.firstName,
        lastName: state.selected.lastName,
        membershipStatus: "visitor",
        connectCompleted: "no",
      };
      state.step = 5;
    } else {
      state.manualReview = false;
      state.step = 2;
    }
    render();
  } catch {
    $("#searchBtn").disabled = false;
    alert("The service is temporarily unavailable. Please try again.");
  }
}
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s.,'-]/g, "");
}
function bindTeamRemove() {
  document.querySelectorAll(".remove-team").forEach(
    (button) =>
      (button.onclick = () => {
        const rows = $("#servingTeams");
        if (rows && rows.children.length > 1)
          button.closest(".team-entry").remove();
        else {
          const input = button.closest(".team-entry")?.querySelector("input");
          if (input) input.value = "";
        }
      }),
  );
}
function captureFormDraft() {
  const form = $("#updateForm");
  if (!form) return;
  const data = new FormData(form);
  state.formDraft = {
    ...state.formDraft,
    ...Object.fromEntries(data),
    communicationPreference: data
      .getAll("communicationPreference")
      .map(String)
      .filter(Boolean),
    servingTeams: data.getAll("servingTeams").map(String),
    volunteeringInterests: data
      .getAll("volunteeringInterests")
      .map(String),
    familyAttendees: collectFamilyAttendees(data),
  };
  saveDraft();
}
function bindDraftAutosave() {
  const form = $("#updateForm");
  if (!form) return;
  form.addEventListener("input", captureFormDraft);
  form.addEventListener("change", captureFormDraft);
}
function restoreFormDraft() {
  const form = $("#updateForm"),
    draft = state.formDraft;
  if (!form || !draft) return;
  for (const [key, value] of Object.entries(draft)) {
    if (
      key === "servingTeams" ||
      key === "householdMembers" ||
      key === "familyAttendees"
      || key === "volunteeringInterests"
    )
      continue;
    const field = form.elements.namedItem(key);
    let restoredValue = value;
    if (key === "tlcLocation" && value === "Woodford")
      restoredValue = "Liberty Point Woodford";
    if (key === "tlcLocation" && value === "Other / online")
      restoredValue = "e-TLC";
    if ((key === "countryOfOrigin" || key === "countryOfResidence") && value) {
      restoredValue = normaliseCountryCode(value);
      if (restoredValue === "OTHER") draft[`${key}Other`] = String(value);
    }
    if (
      key === "ethnicity" &&
      value &&
      field?.tagName === "SELECT" &&
      ![...field.options].some((option) => option.value === String(value))
    )
      restoredValue = "";
    if (field && typeof restoredValue !== "object") {
      if (
        field.tagName === "SELECT" &&
        restoredValue &&
        ![...field.options].some(
          (option) => option.value === String(restoredValue),
        )
      )
        field.add(new Option(String(restoredValue), String(restoredValue)));
      field.value = restoredValue;
    }
  }
  if (Array.isArray(draft.servingTeams) && draft.servingTeams.length) {
    const wrap = $("#servingTeams");
    wrap.innerHTML = draft.servingTeams
      .map(
        (value) =>
          `<div class="team-entry"><input name="servingTeams" value="${esc(value)}" placeholder="e.g. Welcome Team"><button type="button" class="remove-team" aria-label="Remove team">×</button></div>`,
      )
      .join("");
    bindTeamRemove();
  }
  if (Array.isArray(draft.householdMembers) && draft.householdMembers.length) {
    const wrap = $("#householdMembers");
    if (wrap)
      wrap.innerHTML = draft.householdMembers.map(householdRow).join("");
    bindHouseholdRemove();
  }
  if (Array.isArray(draft.familyAttendees) && draft.familyAttendees.length) {
    const wrap = $("#familyAttendees");
    if (wrap)
      wrap.innerHTML = draft.familyAttendees.map(familyAttendeeRow).join("");
    bindFamilyFields();
  }
  if (
    Array.isArray(draft.volunteeringInterests) &&
    draft.volunteeringInterests.length
  )
    form
      .querySelectorAll('[name="volunteeringInterests"]')
      .forEach(
        (checkbox) =>
          (checkbox.checked = draft.volunteeringInterests.includes(
            checkbox.value,
          )),
      );
}
const TLC_LOCATIONS = [
  "Liberty Point Woodford",
  "North London",
  "Canary Wharf",
  "Croydon",
  "Birmingham",
  "Lagos",
  "Houston",
  "e-TLC",
  "I’m not sure",
];
const AGE_GROUP_OPTIONS = [
  "0-3",
  "4-11",
  "12-18",
  "19-25",
  "26-35",
  "36-50",
  "51-64",
  "65+",
];
function ageGroupFromYear(value) {
  const year = Number(value),
    currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) return "";
  const age = currentYear - year;
  if (age <= 3) return "0-3";
  if (age <= 11) return "4-11";
  if (age <= 18) return "12-18";
  if (age <= 25) return "19-25";
  if (age <= 35) return "26-35";
  if (age <= 50) return "36-50";
  if (age <= 64) return "51-64";
  return "65+";
}
function bindAgeGroupField() {
  const form = $("#updateForm"),
    year = form?.elements.namedItem("birthYear"),
    group = form?.elements.namedItem("ageGroup");
  if (!year || !group) return;
  const update = () => {
    const inferred = ageGroupFromYear(year.value);
    if (inferred) group.value = inferred;
  };
  year.addEventListener("input", update);
  year.addEventListener("change", update);
  if (!group.value) update();
}
const FAMILY_RELATIONSHIPS = [
  "Spouse / partner",
  "Child",
  "Parent",
  "Sibling",
  "Grandparent",
  "Grandchild",
  "Aunt / uncle",
  "Niece / nephew",
  "Cousin",
  "Other relative",
];
function familyAttendeeRow(person = {}) {
  return `<div class="family-attendee-row"><div class="field"><label>Full name</label><input name="familyAttendeeName" value="${esc(person.name || "")}" placeholder="Full name"></div><div class="field"><label>Relationship to you</label><select name="familyAttendeeRelationship"><option value="">Choose one</option>${FAMILY_RELATIONSHIPS.map((value) => `<option ${person.relationship === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div class="field"><label>Their TLC location</label><select name="familyAttendeeLocation"><option value="">Choose one</option>${TLC_LOCATIONS.map((value) => `<option ${person.location === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><button type="button" class="remove-family-attendee" aria-label="Remove family member">×</button></div>`;
}
function collectFamilyAttendees(data) {
  const names = data.getAll("familyAttendeeName"),
    relationships = data.getAll("familyAttendeeRelationship"),
    locations = data.getAll("familyAttendeeLocation");
  return names
    .map((name, index) => ({
      name: String(name || "").trim(),
      relationship: String(relationships[index] || "").trim(),
      location: String(locations[index] || "").trim(),
    }))
    .filter((person) => person.name);
}
function bindFamilyFields() {
  const answer = document.querySelector('[name="familyAttends"]'),
    details = $("#familyAttendanceDetails");
  if (!answer || !details) return;
  const update = () => {
    const show = answer.value === "yes";
    details.hidden = !show;
    details
      .querySelectorAll(
        '[name="familyAttendeeName"], [name="familyAttendeeRelationship"], [name="familyAttendeeLocation"]',
      )
      .forEach((field) => (field.required = show));
  };
  answer.onchange = update;
  if ($("#addFamilyAttendee"))
    $("#addFamilyAttendee").onclick = () => {
      $("#familyAttendees").insertAdjacentHTML(
        "beforeend",
        familyAttendeeRow(),
      );
      bindFamilyFields();
    };
  document.querySelectorAll(".remove-family-attendee").forEach((button) => {
    button.onclick = () => {
      const rows = document.querySelectorAll(".family-attendee-row");
      if (rows.length > 1) button.closest(".family-attendee-row").remove();
      else
        button
          .closest(".family-attendee-row")
          .querySelectorAll("input,select")
          .forEach((input) => (input.value = ""));
    };
  });
  update();
}
function householdRow(person = {}) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `<div class="household-row"><div class="field household-name"><label>Full name</label><input name="householdMemberName" value="${esc(person.name || "")}" placeholder="Full name"></div><div class="field household-dob"><label>Date of birth <span class="optional">Year optional</span></label><div><input name="householdMemberBirthDay" value="${esc(person.birthDay || "")}" inputmode="numeric" maxlength="2" placeholder="DD"><select name="householdMemberBirthMonth"><option value="">Month</option>${months.map((month, index) => `<option value="${index + 1}" ${String(person.birthMonth || "") === String(index + 1) ? "selected" : ""}>${month}</option>`).join("")}</select><input name="householdMemberBirthYear" value="${esc(person.birthYear || "")}" inputmode="numeric" maxlength="4" placeholder="Year"></div></div><div class="field household-same-address"><label>Do they live at your address?</label><select name="householdMemberSameAddress"><option value="">Choose one</option><option value="yes" ${person.sameAddress === "yes" ? "selected" : ""}>Yes</option><option value="no" ${person.sameAddress === "no" ? "selected" : ""}>No</option></select></div><div class="field household-address" ${person.sameAddress === "no" ? "" : "hidden"}><label>Known address</label><textarea name="householdMemberAddress" rows="2" placeholder="Enter their known address, or type NA">${esc(person.address || "")}</textarea><p class="hint">If you do not know their address, type NA.</p></div><button type="button" class="remove-household" aria-label="Remove household member">×</button></div>`;
}
function collectHouseholdMembers(data) {
  const names = data.getAll("householdMemberName"),
    days = data.getAll("householdMemberBirthDay"),
    months = data.getAll("householdMemberBirthMonth"),
    years = data.getAll("householdMemberBirthYear"),
    sameAddresses = data.getAll("householdMemberSameAddress"),
    addresses = data.getAll("householdMemberAddress");
  return names
    .map((name, index) => ({
      name: String(name || "").trim(),
      birthDay: String(days[index] || "").trim(),
      birthMonth: String(months[index] || "").trim(),
      birthYear: String(years[index] || "").trim(),
      sameAddress: String(sameAddresses[index] || "").trim(),
      address: String(addresses[index] || "").trim(),
    }))
    .filter((person) => person.name);
}
function bindHouseholdRemove() {
  document.querySelectorAll(".household-row").forEach((row) => {
    const name = row.querySelector('[name="householdMemberName"]'),
      day = row.querySelector('[name="householdMemberBirthDay"]'),
      month = row.querySelector('[name="householdMemberBirthMonth"]'),
      year = row.querySelector('[name="householdMemberBirthYear"]'),
      sameAddress = row.querySelector('[name="householdMemberSameAddress"]'),
      addressWrap = row.querySelector(".household-address"),
      address = row.querySelector('[name="householdMemberAddress"]');
    const update = () => {
      const started = Boolean(
        name.value.trim() ||
        day.value ||
        month.value ||
        year.value ||
        sameAddress.value ||
        address.value.trim(),
      );
      name.required = started;
      day.required = started;
      month.required = started;
      sameAddress.required = started;
      const elsewhere = sameAddress.value === "no";
      addressWrap.hidden = !elsewhere;
      address.required = elsewhere;
    };
    row
      .querySelectorAll("input,select,textarea")
      .forEach((control) => control.addEventListener("input", update));
    row
      .querySelectorAll("select")
      .forEach((control) => control.addEventListener("change", update));
    update();
  });
  document.querySelectorAll(".remove-household").forEach(
    (button) =>
      (button.onclick = () => {
        if (document.querySelectorAll(".household-row").length > 1)
          button.closest(".household-row").remove();
        else {
          const row = button.closest(".household-row");
          row
            .querySelectorAll("input,textarea")
            .forEach((field) => (field.value = ""));
          row.querySelectorAll("select").forEach((field) => (field.value = ""));
          row.querySelector(".household-address").hidden = true;
        }
      }),
  );
}

const PRIORITY_COUNTRIES = ["GB", "US", "NG"];
const ETHNICITY_OPTIONS = [
  "English, Welsh, Scottish, Northern Irish or British",
  "Irish",
  "Gypsy or Irish Traveller",
  "Roma",
  "Another White background",
  "White African",
  "Indian",
  "Pakistani",
  "Bangladeshi",
  "Chinese",
  "Another Asian background",
  "White and Black Caribbean",
  "White and Black African",
  "White and Asian",
  "Another Mixed background",
  "Black African",
  "Black Caribbean",
  "Black British",
  "Another Black background",
  "Arab",
  "Another ethnic group",
  "Prefer not to say",
];
const ETHNICITY_GROUPS = [
  {
    key: "asian",
    uk: "Asian or Asian British",
    us: "Asian or Asian American",
    options: [
      ["A1", "Indian"],
      ["A2", "Pakistani"],
      ["A3", "Bangladeshi"],
      ["A4", "Chinese"],
      ["A5", "Any other Asian background", null, true],
    ],
  },
  {
    key: "black",
    uk: "Black, Black British, Caribbean or African",
    us: "Black, Black American, Caribbean or African",
    options: [
      ["B1", "Caribbean"],
      ["B2", "African"],
      ["BAA", null, "African American"],
      [
        "B3",
        "Any other Black, Black British, or Caribbean background",
        "Any other Black, Black American, or Caribbean background",
        true,
      ],
    ],
  },
  {
    key: "mixed",
    uk: "Mixed or multiple ethnic groups",
    options: [
      ["M1", "White and Black Caribbean"],
      ["M2", "White and Black African"],
      ["M3", "White and Asian"],
      ["M4", "Any other Mixed or multiple ethnic background", null, true],
    ],
  },
  {
    key: "white",
    uk: "White",
    options: [
      ["W1", "English, Welsh, Scottish, Northern Irish or British", "White American"],
      ["W2", "Irish"],
      ["W3", "Gypsy or Irish Traveller"],
      ["W4", "Roma"],
      ["W5", "Any other White background", null, true],
    ],
  },
  {
    key: "other",
    uk: "Other ethnic group",
    options: [
      ["O1", "Arab"],
      ["O2", "Any other ethnic group", null, true],
    ],
  },
];
const LEGACY_ETHNICITY_CODES = {
  Indian: "A1",
  Pakistani: "A2",
  Bangladeshi: "A3",
  Chinese: "A4",
  "Another Asian background": "A5",
  "Any other Asian background": "A5",
  Caribbean: "B1",
  "Black Caribbean": "B1",
  "Black African": "B2",
  African: "B2",
  "Black British": "B3",
  "Another Black background": "B3",
  "White and Black Caribbean": "M1",
  "Mixed White and Caribbean": "M1",
  "White and Black African": "M2",
  "Mixed White and Black African": "M2",
  "White and Asian": "M3",
  "Mixed White and Asian": "M3",
  "Another Mixed background": "M4",
  "English, Welsh, Scottish, Northern Irish or British": "W1",
  "White British": "W1",
  Irish: "W2",
  "White Irish": "W2",
  "Gypsy or Irish Traveller": "W3",
  Gypsy: "W3",
  "Irish Traveller": "W3",
  Roma: "W4",
  "White African": "W5",
  "White European": "W5",
  "Another White background": "W5",
  Arab: "O1",
  "Another ethnic group": "O2",
  "Prefer not to say": "PNTS",
};
const ISO_COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const UK_COUNTRY_NAMES = {
  ENGLAND: "England",
  SCOTLAND: "Scotland",
  WALES: "Wales",
  NORTHERN_IRELAND: "Northern Ireland",
};
const countryName = (code) =>
  UK_COUNTRY_NAMES[code] || COUNTRY_NAMES.of(code) || code;
const COUNTRY_OPTIONS = [
  ...PRIORITY_COUNTRIES,
  ...ISO_COUNTRY_CODES.filter(
    (code) => !PRIORITY_COUNTRIES.includes(code),
  ).sort((a, b) => countryName(a).localeCompare(countryName(b))),
];
const LOCATION_OPTIONS = {
  ENGLAND: [
    "Bedfordshire",
    "Berkshire",
    "Bristol",
    "Buckinghamshire",
    "Cambridgeshire",
    "Cheshire",
    "Cornwall",
    "County Durham",
    "Cumbria",
    "Derbyshire",
    "Devon",
    "Dorset",
    "East Riding of Yorkshire",
    "East Sussex",
    "Essex",
    "Gloucestershire",
    "Greater London",
    "Greater Manchester",
    "Hampshire",
    "Herefordshire",
    "Hertfordshire",
    "Isle of Wight",
    "Kent",
    "Lancashire",
    "Leicestershire",
    "Lincolnshire",
    "Merseyside",
    "Norfolk",
    "North Yorkshire",
    "Northamptonshire",
    "Northumberland",
    "Nottinghamshire",
    "Oxfordshire",
    "Rutland",
    "Shropshire",
    "Somerset",
    "South Yorkshire",
    "Staffordshire",
    "Suffolk",
    "Surrey",
    "Tyne and Wear",
    "Warwickshire",
    "West Midlands",
    "West Sussex",
    "West Yorkshire",
    "Wiltshire",
    "Worcestershire",
  ],
  SCOTLAND: [
    "Aberdeen City",
    "Aberdeenshire",
    "Angus",
    "Argyll and Bute",
    "City of Edinburgh",
    "Clackmannanshire",
    "Dumfries and Galloway",
    "Dundee City",
    "East Ayrshire",
    "East Dunbartonshire",
    "East Lothian",
    "East Renfrewshire",
    "Falkirk",
    "Fife",
    "Glasgow City",
    "Highland",
    "Inverclyde",
    "Midlothian",
    "Moray",
    "Na h-Eileanan Siar",
    "North Ayrshire",
    "North Lanarkshire",
    "Orkney Islands",
    "Perth and Kinross",
    "Renfrewshire",
    "Scottish Borders",
    "Shetland Islands",
    "South Ayrshire",
    "South Lanarkshire",
    "Stirling",
    "West Dunbartonshire",
    "West Lothian",
  ],
  WALES: [
    "Blaenau Gwent",
    "Bridgend",
    "Caerphilly",
    "Cardiff",
    "Carmarthenshire",
    "Ceredigion",
    "Conwy",
    "Denbighshire",
    "Flintshire",
    "Gwynedd",
    "Isle of Anglesey",
    "Merthyr Tydfil",
    "Monmouthshire",
    "Neath Port Talbot",
    "Newport",
    "Pembrokeshire",
    "Powys",
    "Rhondda Cynon Taf",
    "Swansea",
    "Torfaen",
    "Vale of Glamorgan",
    "Wrexham",
  ],
  NORTHERN_IRELAND: [
    "Antrim and Newtownabbey",
    "Ards and North Down",
    "Armagh City, Banbridge and Craigavon",
    "Belfast",
    "Causeway Coast and Glens",
    "Derry City and Strabane",
    "Fermanagh and Omagh",
    "Lisburn and Castlereagh",
    "Mid and East Antrim",
    "Mid Ulster",
    "Newry, Mourne and Down",
  ],
  US: [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "District of Columbia",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
  ],
  NG: [
    "Abia",
    "Adamawa",
    "Akwa Ibom",
    "Anambra",
    "Bauchi",
    "Bayelsa",
    "Benue",
    "Borno",
    "Cross River",
    "Delta",
    "Ebonyi",
    "Edo",
    "Ekiti",
    "Enugu",
    "Federal Capital Territory",
    "Gombe",
    "Imo",
    "Jigawa",
    "Kaduna",
    "Kano",
    "Katsina",
    "Kebbi",
    "Kogi",
    "Kwara",
    "Lagos",
    "Nasarawa",
    "Niger",
    "Ogun",
    "Ondo",
    "Osun",
    "Oyo",
    "Plateau",
    "Rivers",
    "Sokoto",
    "Taraba",
    "Yobe",
    "Zamfara",
  ],
};
LOCATION_OPTIONS.GB = [
  ...LOCATION_OPTIONS.ENGLAND.map((value) => `England — ${value}`),
  ...LOCATION_OPTIONS.SCOTLAND.map((value) => `Scotland — ${value}`),
  ...LOCATION_OPTIONS.WALES.map((value) => `Wales — ${value}`),
  ...LOCATION_OPTIONS.NORTHERN_IRELAND.map(
    (value) => `Northern Ireland — ${value}`,
  ),
];
const LONDON_BOROUGHS = [
  "Barking and Dagenham",
  "Barnet",
  "Bexley",
  "Brent",
  "Bromley",
  "Camden",
  "City of London",
  "Croydon",
  "Ealing",
  "Enfield",
  "Greenwich",
  "Hackney",
  "Hammersmith and Fulham",
  "Haringey",
  "Harrow",
  "Havering",
  "Hillingdon",
  "Hounslow",
  "Islington",
  "Kensington and Chelsea",
  "Kingston upon Thames",
  "Lambeth",
  "Lewisham",
  "Merton",
  "Newham",
  "Redbridge",
  "Richmond upon Thames",
  "Southwark",
  "Sutton",
  "Tower Hamlets",
  "Waltham Forest",
  "Wandsworth",
  "Westminster",
];
function countryOptions() {
  return `<option value="">Choose a country</option>${COUNTRY_OPTIONS.map((code) => `<option value="${code}">${countryName(code)}</option>`).join("")}<option value="OTHER">Country not listed</option>`;
}
function normaliseCountryCode(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase();
  if (
    [
      "uk",
      "gb",
      "united kingdom",
      "great britain",
      "england",
      "scotland",
      "wales",
      "northern ireland",
    ].includes(input)
  )
    return "GB";
  if (
    ["us", "usa", "united states", "united states of america"].includes(input)
  )
    return "US";
  if (input === "nigeria") return "NG";
  return (
    ISO_COUNTRY_CODES.find(
      (code) => countryName(code).toLowerCase() === input,
    ) ||
    (ISO_COUNTRY_CODES.includes(String(value || "").toUpperCase())
      ? String(value).toUpperCase()
      : value
        ? "OTHER"
        : "")
  );
}
function enhanceSearchableSelect(select) {
  if (
    !select ||
    select.tagName !== "SELECT" ||
    select.dataset.searchable === "true" ||
    select.options.length < 12
  )
    return;
  select.dataset.searchable = "true";
  const shell = document.createElement("div"),
    input = document.createElement("input"),
    menu = document.createElement("div"),
    options = [...select.options].filter((option) => option.value);
  shell.className = "searchable-select-shell";
  input.type = "search";
  input.className = "searchable-select-input";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.placeholder = select.options[0]?.textContent || "Type to search";
  input.value = select.selectedOptions[0]?.value
    ? select.selectedOptions[0].textContent.trim()
    : "";
  input.required = select.required;
  menu.className = "searchable-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  select.required = false;
  select.classList.add("searchable-select-source");
  const sync = () => {
      const match = options.find(
          (option) =>
            option.textContent.trim().toLowerCase() ===
            input.value.trim().toLowerCase(),
        ),
        previous = select.value;
      select.value = match?.value || "";
      input.setCustomValidity(
        input.value.trim() && !match
          ? "Please choose an option from the list."
          : "",
      );
      if (select.value !== previous)
        select.dispatchEvent(new Event("change", { bubbles: true }));
    },
    close = () => {
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
    },
    choose = (option) => {
      input.value = option.textContent.trim();
      sync();
      close();
      input.focus({ preventScroll: true });
    },
    renderOptions = () => {
      const query = input.value.trim().toLowerCase(),
        matches = options
          .filter(
            (option) =>
              !query || option.textContent.trim().toLowerCase().includes(query),
          )
          .sort((a, b) => {
            const aStarts = a.textContent
                .trim()
                .toLowerCase()
                .startsWith(query),
              bStarts = b.textContent.trim().toLowerCase().startsWith(query);
            return Number(bStarts) - Number(aStarts);
          });
      menu.innerHTML = matches.length
        ? matches
            .map(
              (option) =>
                `<button type="button" role="option" data-search-value="${esc(option.value)}">${esc(option.textContent.trim())}</button>`,
            )
            .join("")
        : '<span class="searchable-select-empty">No matching option</span>';
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
      menu.querySelectorAll("button").forEach((button) => {
        button.onmousedown = (event) => event.preventDefault();
        button.onclick = () =>
          choose(
            options.find(
              (option) => option.value === button.dataset.searchValue,
            ),
          );
      });
    };
  input.addEventListener("focus", renderOptions);
  input.addEventListener("input", () => {
    sync();
    renderOptions();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      menu.querySelector("button")?.focus();
    }
  });
  input.addEventListener("blur", () =>
    setTimeout(() => {
      sync();
      close();
    }, 100),
  );
  shell.append(input, menu);
  select.insertAdjacentElement("beforebegin", shell);
}
function bindSearchableLongSelects(root = document) {
  root.querySelectorAll("select").forEach(enhanceSearchableSelect);
}
function bindLocationFields() {
  const form = $("#updateForm");
  if (!form) return;
  for (const prefix of ["origin", "residence"]) {
    const country = form.elements.namedItem(
        prefix === "origin" ? "countryOfOrigin" : "countryOfResidence",
      ),
      regionWrap = $(`#${prefix}RegionField`),
      boroughWrap = $(`#${prefix}BoroughField`),
      otherCountryWrap = $(`#${prefix}OtherCountryField`);
    if (!country || !regionWrap || !boroughWrap || !otherCountryWrap) continue;
    const regionName =
        prefix === "origin" ? "regionOfOrigin" : "residenceRegion",
      boroughName =
        prefix === "origin" ? "boroughOfOrigin" : "residenceBorough",
      otherCountryName =
        prefix === "origin"
          ? "countryOfOriginOther"
          : "countryOfResidenceOther";
    let desiredRegion = state.formDraft?.[regionName] || "",
      desiredBorough = state.formDraft?.[boroughName] || "",
      desiredOtherCountry = state.formDraft?.[otherCountryName] || "";
    const updateBorough = () => {
      const region = form.elements.namedItem(regionName);
      boroughWrap.hidden = !(
        (country.value === "ENGLAND" && region?.value === "Greater London") ||
        (country.value === "GB" && region?.value === "England — Greater London")
      );
      boroughWrap.innerHTML = boroughWrap.hidden
        ? ""
        : `<label>London borough <span class="required-mark">Required</span></label><select name="${boroughName}"><option value="">Choose a borough</option>${LONDON_BOROUGHS.map((value) => `<option>${value}</option>`).join("")}<option value="Other">Other / not listed</option></select>`;
      const borough = form.elements.namedItem(boroughName);
      if (borough) {
        borough.required = true;
        if (
          desiredBorough &&
          [...borough.options].some((option) => option.value === desiredBorough)
        )
          borough.value = desiredBorough;
        enhanceSearchableSelect(borough);
      }
    };
    const update = () => {
      const values = LOCATION_OPTIONS[country.value];
      otherCountryWrap.hidden = country.value !== "OTHER";
      otherCountryWrap.innerHTML =
        country.value === "OTHER"
          ? `<label>Country name <span class="required-mark">Required</span></label><input name="${otherCountryName}" autocomplete="country-name" placeholder="Enter country">`
          : "";
      regionWrap.innerHTML = values
        ? `<label>${country.value === "US" || country.value === "NG" ? "State" : "County / region"} <span class="required-mark">Required</span></label><select name="${regionName}"><option value="">Choose one</option>${values.map((value) => `<option>${value}</option>`).join("")}<option value="Other">Other / not listed</option></select>`
        : `<label>State / province / region <span class="required-mark">Required</span></label><input name="${regionName}" placeholder="Enter state, province or region">`;
      const region = form.elements.namedItem(regionName),
        otherCountry = form.elements.namedItem(otherCountryName);
      if (otherCountry) {
        otherCountry.required = true;
        otherCountry.value = desiredOtherCountry;
      }
      if (region) {
        region.required = true;
        if (desiredRegion) {
          if (
            region.tagName === "SELECT" &&
            ![...region.options].some(
              (option) => option.value === desiredRegion,
            )
          )
            region.add(new Option(desiredRegion, desiredRegion));
          region.value = desiredRegion;
        }
        region.addEventListener("change", () => {
          updateBorough();
          if (prefix === "residence")
            updateNigeriaLga(form, country.value, region.value);
        });
        enhanceSearchableSelect(region);
      }
      updateBorough();
      if (prefix === "residence") {
        updateNigeriaLga(form, country.value, region?.value || "");
        updatePostcodeForCountry(form, country.value);
      }
      desiredRegion = "";
      desiredBorough = "";
      desiredOtherCountry = "";
    };
    country.addEventListener("change", update);
    update();
  }
}
async function updateNigeriaLga(form, countryCode, stateName) {
  const wrap = $("#residenceLgaField");
  if (!wrap) return;
  if (countryCode !== "NG") {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  if (!stateName || stateName === "Other") {
    wrap.innerHTML =
      '<label>Local government area <span class="required-mark">Required</span></label><input name="residenceLga" placeholder="Select a state first" disabled>';
    return;
  }
  wrap.innerHTML =
    '<label>Local government area <span class="required-mark">Required</span></label><input name="residenceLga" placeholder="Loading local government areas…" disabled>';
  try {
    const result = await api("nigeriaLgas", { state: stateName }),
      current =
        state.formDraft?.residenceRegion === stateName
          ? state.formDraft?.residenceLga || ""
          : "";
    wrap.innerHTML = `<label>Local government area <span class="required-mark">Required</span></label><select name="residenceLga"><option value="">Choose or search an LGA</option>${(result.lgas || []).map((value) => `<option ${value === current ? "selected" : ""}>${esc(value)}</option>`).join("")}</select><p class="hint">Start typing to filter the LGAs in ${esc(stateName)}.</p>`;
    const field = form.elements.namedItem("residenceLga");
    if (field) {
      field.required = true;
      enhanceSearchableSelect(field);
    }
  } catch {
    wrap.innerHTML =
      '<label>Local government area <span class="required-mark">Required</span></label><input name="residenceLga" placeholder="Enter your local government area" required>';
  }
}
function updatePostcodeForCountry(form, countryCode) {
  const field = form.elements.namedItem("postcode"),
    label = field?.closest(".field")?.querySelector(":scope > label");
  if (!field || !label) return;
  const nigeria = countryCode === "NG";
  field.required = !nigeria;
  field.placeholder = nigeria ? "Not required" : "";
  label.childNodes[0].textContent = nigeria
    ? "ZIP code "
    : "Postcode / ZIP code ";
  let mark = label.querySelector(".required-mark");
  if (nigeria) mark?.remove();
  else if (!mark)
    label.insertAdjacentHTML(
      "beforeend",
      '<span class="required-mark">Required</span>',
    );
}
function bindPostcodeLookup() {
  const form = $("#updateForm"),
    postcode = form?.elements.namedItem("postcode"),
    address = form?.elements.namedItem("addressLine1"),
    residence = form?.elements.namedItem("countryOfResidence"),
    field = postcode?.closest(".field");
  if (
    !form ||
    !postcode ||
    !address ||
    !field ||
    field.querySelector(".postcode-lookup")
  )
    return;
  postcode.autocomplete = "postal-code";
  address.autocomplete = "street-address";
  const lookup = document.createElement("div"),
    ukCountries = new Set([
      "",
      "GB",
      "ENGLAND",
      "SCOTLAND",
      "WALES",
      "NORTHERN_IRELAND",
    ]),
    validUkPostcode = (value) =>
      /^(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i.test(
        String(value || "").trim(),
      ),
    normalisePostcode = (value) => {
      const compact = String(value || "")
        .toUpperCase()
        .replace(/\s+/g, "");
      return compact.length > 3
        ? `${compact.slice(0, -3)} ${compact.slice(-3)}`
        : compact;
    };
  lookup.className = "postcode-lookup";
  lookup.innerHTML =
    '<button type="button" class="btn ghost postcode-find">Find address</button><p class="postcode-status" role="status"></p><div class="postcode-results" hidden><label for="postcodeAddressChoice">Choose your address</label><select id="postcodeAddressChoice"><option value="">Choose an address</option></select></div>';
  field.appendChild(lookup);
  const button = lookup.querySelector(".postcode-find"),
    status = lookup.querySelector(".postcode-status"),
    resultWrap = lookup.querySelector(".postcode-results"),
    select = lookup.querySelector("select");
  let timer,
    lastLookup = "";
  const countrySupported = () =>
      ukCountries.has(String(residence?.value || "")),
    updateAvailability = () => {
      const supported = countrySupported();
      button.hidden = !supported;
      if (!supported) {
        resultWrap.hidden = true;
        status.textContent =
          "Address lookup is currently available for UK postcodes. Enter this address manually.";
      } else if (status.textContent.startsWith("Address lookup is currently"))
        status.textContent = "";
    },
    runLookup = async () => {
      const entered = postcode.value.trim();
      if (!countrySupported()) return updateAvailability();
      if (!validUkPostcode(entered)) {
        resultWrap.hidden = true;
        status.textContent = entered ? "Enter a complete UK postcode." : "";
        return;
      }
      const formatted = normalisePostcode(entered);
      if (formatted === lastLookup && select.options.length > 1) return;
      button.disabled = true;
      button.textContent = "Finding…";
      status.textContent = "Checking this postcode…";
      resultWrap.hidden = true;
      try {
        const data = await api("addressLookup", {
          postcode: formatted,
          browserId: BROWSER_SESSION_ID,
        });
        postcode.value = data.postcode || formatted;
        lastLookup = postcode.value;
        select.innerHTML = '<option value="">Choose an address</option>';
        (data.addresses || []).forEach((item, index) =>
          select.add(new Option(item.label, String(index))),
        );
        if (data.addresses?.length) {
          resultWrap.hidden = false;
          status.textContent = `${data.addresses.length} ${data.addresses.length === 1 ? "address" : "addresses"} found.`;
          select.onchange = () => {
            const chosen = data.addresses[Number(select.value)];
            if (!chosen || select.value === "") return;
            address.value = chosen.addressLine1;
            postcode.value = chosen.postcode || postcode.value;
            address.dispatchEvent(new Event("input", { bubbles: true }));
            postcode.dispatchEvent(new Event("input", { bubbles: true }));
            status.textContent = "Address added. You can edit it if needed.";
          };
        } else {
          status.textContent = data.recognised
            ? `Postcode recognised${data.location ? ` for ${data.location}` : ""}. Enter the street address manually.`
            : "We could not find that postcode. Check it or enter the address manually.";
        }
      } catch (error) {
        status.textContent =
          error.message ||
          "Address lookup is unavailable. Enter the address manually.";
      } finally {
        button.disabled = false;
        button.textContent = "Find address";
      }
    };
  button.onclick = runLookup;
  postcode.addEventListener("input", () => {
    clearTimeout(timer);
    resultWrap.hidden = true;
    status.textContent = "";
    if (validUkPostcode(postcode.value) && countrySupported())
      timer = setTimeout(runLookup, 650);
  });
  residence?.addEventListener("change", updateAvailability);
  updateAvailability();
}
function bindCensusFields() {
  const form = $("#updateForm"),
    grid = form?.querySelector(".form-grid");
  if (!form || !grid || grid.querySelector('[name="countryOfOrigin"]')) return;
  const locations = TLC_LOCATIONS;
  const gender = form.elements.namedItem("gender");
  if (gender?.tagName === "SELECT") {
    const selected = String(gender.value || "");
    gender.innerHTML = '<option value="">Choose one</option><option>Male</option><option>Female</option><option>Prefer not to say</option>';
    if (["Male", "Female", "Prefer not to say"].includes(selected))
      gender.value = selected;
  }
  grid.insertAdjacentHTML(
    "beforeend",
    `<div class="field"><label>Are you a TLC member?</label><select name="membershipStatus"><option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">I’m not sure</option></select></div><div class="field" id="invitedByField" hidden><label>Who invited you to TLC?</label><input name="invitedBy" placeholder="Enter their name, or type Walk-in"></div><div class="field"><label>Maiden or previous surname <span class="optional">Optional</span></label><input name="maidenName" placeholder="Only if different from your current surname"></div><div class="profile-section-title"><b>Background and residence</b><span>Your residential country is separate from your country of origin.</span></div><div class="field"><label>Country of origin</label><select name="countryOfOrigin" autocomplete="country-name">${countryOptions()}</select></div><div class="field" id="originOtherCountryField" hidden></div><div class="field" id="originRegionField"></div><div class="field" id="originBoroughField" hidden></div><div class="field"><label>Country of residence</label><select name="countryOfResidence" autocomplete="country-name">${countryOptions()}</select></div><div class="field" id="residenceOtherCountryField" hidden></div><div class="field" id="residenceRegionField"></div><div class="field" id="residenceLgaField" hidden></div><div class="field" id="residenceBoroughField" hidden></div><div class="field"><label>Ethnicity</label><select name="ethnicity"><option value="">Choose one</option>${ETHNICITY_OPTIONS.map((value) => `<option>${value}</option>`).join("")}</select><p class="hint">Country of origin is collected separately so this describes your ethnic background.</p></div><div class="field"><label>Your TLC location</label><select name="tlcLocation"><option value="">Choose one</option>${locations.map((value) => `<option>${value}</option>`).join("")}</select></div><div class="profile-section-title"><b>Date of birth</b><span>Your birth year is optional.</span></div><div class="field dob-fields"><label>Date of birth</label><div><input name="birthDay" inputmode="numeric" maxlength="2" placeholder="DD"><select name="birthMonth"><option value="">Month</option>${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month, index) => `<option value="${index + 1}">${month}</option>`).join("")}</select><input name="birthYear" inputmode="numeric" maxlength="4" placeholder="Year (optional)"></div></div><div></div><div class="profile-section-title"><b>Your TLC journey</b><span>We will confirm Connect completion against the church record for the correct membership classification.</span></div><div class="field"><label>Have you completed Connect?</label><select name="connectCompleted"><option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">I’m not sure</option></select><p class="hint">${state.selected?.connect?.found ? `Church record field found: ${esc(state.selected.connect.field)}.` : "The data team will confirm this if the record is unavailable."}</p></div><div class="field"><label>Have you been baptised?</label><select name="baptised"><option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">I’m not sure</option></select></div><div class="field"><label>Where were you baptised?</label><select name="baptismChurch"><option value="">Choose one</option><option>At TLC</option><option>At another church</option><option>I’m not sure</option></select></div><div class="field"><label>Baptism year <span class="optional">Optional</span></label><input name="baptismYear" inputmode="numeric" maxlength="4" placeholder="e.g. 2022"></div>`,
  );
  const birthYearField = form.elements.namedItem("birthYear")?.closest(".field");
  if (birthYearField && !form.elements.namedItem("ageGroup"))
    birthYearField.insertAdjacentHTML(
      "afterend",
      `<div class="field"><label>Age group</label><select name="ageGroup"><option value="">Choose one</option>${AGE_GROUP_OPTIONS.map((value) => `<option>${value}</option>`).join("")}</select><p class="hint">This is required because your birth year is optional.</p></div>`,
    );
  const currentYear = new Date().getFullYear();
  grid.insertAdjacentHTML(
    "beforeend",
    `<div class="profile-section-title"><b>Your life and TLC journey</b><span>These details help us understand and care for the people who regularly attend TLC.</span></div><div class="field"><label>Marital status</label><select name="maritalStatus"><option value="">Choose one</option><option>Single</option><option>Married</option><option>Engaged</option><option>Separated</option><option>Divorced</option><option>Widowed</option><option>Prefer not to say</option></select></div><div class="field"><label>How often do you attend TLC?</label><select name="attendanceFrequency"><option value="">Choose one</option><option>More than once a week</option><option>Weekly</option><option>Two or three times a month</option><option>Monthly</option><option>Occasionally</option></select><p class="hint">First-time visitors use a separate welcome journey.</p></div><div class="field"><label>What year did you start attending TLC?</label><select name="yearStartedAttending"><option value="">Choose one</option><option>I’m not sure</option>${Array.from({ length: currentYear - 2014 }, (_, index) => currentYear - index).map((year) => `<option>${year}</option>`).join("")}</select><p class="hint">Choose the year you first began attending TLC.</p></div><div class="field"><label>Would you be interested in the following?</label><select name="pastoralFollowUp"><option value="">Choose one</option></select><p class="hint">We only show options that are relevant to the answers you have given.</p></div>`,
  );
  const attendance = form.elements.namedItem("attendanceFrequency");
  if (attendance?.tagName === "SELECT")
    [...attendance.options]
      .filter((option) => option.value === "More than once a week")
      .forEach((option) => option.remove());
  const followUpHint = form.elements
    .namedItem("pastoralFollowUp")
    ?.closest(".field")
    ?.querySelector(".hint");
  if (followUpHint)
    followUpHint.textContent =
      "The data team can route your request to the appropriate church team.";
  const groups = form.querySelector(".group-picker-section");
  groups.insertAdjacentHTML(
    "beforebegin",
    `<section class="family-attendance-section"><div class="profile-section-title"><b>Your family at TLC</b><span>Only add relatives who attend The Liberty Church.</span></div><div class="field"><label>Does anyone in your family attend TLC?</label><select name="familyAttends"><option value="">Choose one</option><option value="yes">Yes</option><option value="no">No</option></select></div><div id="familyAttendanceDetails" hidden><div id="familyAttendees">${familyAttendeeRow()}</div><button type="button" class="btn ghost" id="addFamilyAttendee">+ Add another family member</button></div></section>`,
  );
  bindFamilyFields();
}
function bindTailoredInterestOptions() {
  const form = $("#updateForm"),
    interest = form?.elements.namedItem("pastoralFollowUp");
  if (!form || !interest || state.journeyType === "visitor") return;
  const update = () => {
    const previous = interest.value,
      connect = form.elements.namedItem("connectCompleted")?.value,
      baptised = form.elements.namedItem("baptised")?.value,
      teamMember = form.elements.namedItem("teamMember")?.value,
      options = [];
    if (state.journeyType === "attendee" || !["yes"].includes(connect))
      options.push("Connect");
    if (baptised !== "yes") options.push("Baptism");
    if (teamMember !== "yes") options.push("Serve");
    options.push("Pastoral care", "None at this time");
    interest.innerHTML = `<option value="">Choose one</option>${options
      .map((value) => `<option>${value}</option>`)
      .join("")}`;
    if (options.includes(previous)) interest.value = previous;
  };
  form.addEventListener("change", (event) => {
    if (["connectCompleted", "baptised", "teamMember"].includes(event.target.name))
      update();
  });
  update();
}
function bindJobFields() {
  const grid = document.querySelector("#updateForm .form-grid");
  if (!grid || grid.querySelector('[name="industry"]')) return;
  grid.insertAdjacentHTML(
    "beforeend",
    `<div class="employment-intro"><b>Work and professional experience</b><p>This may help with professional networks, mentoring, skills-based serving and career initiatives. It is not displayed publicly.</p></div><div class="field"><label>Work status</label><select name="workStatus"><option value="">Choose one</option>${["Employed full-time", "Employed part-time", "Self-employed", "Student", "Retired", "Not currently working", "Homemaker or caring responsibilities", "Prefer not to say"].map((value) => `<option>${value}</option>`).join("")}</select></div><div class="field"><label>Industry</label><select name="industry"><option value="">Choose an industry</option>${["Accounting and finance", "Arts, media and entertainment", "Construction and property", "Education", "Engineering", "Government and public service", "Healthcare", "Hospitality and travel", "Information technology", "Legal services", "Retail", "Social care and charity", "Student", "Other"].map((value) => `<option>${value}</option>`).join("")}</select></div><div class="field"><label>Role / job title</label><input name="jobRole" placeholder="e.g. Project manager"></div><div class="field"><label>Skills <span class="optional">Separate multiple skills with commas</span></label><input name="skills" placeholder="e.g. photography, accounting, mentoring"></div>`,
  );
  grid.insertAdjacentHTML(
    "beforeend",
    `<div class="field volunteering-interests"><label>Skills you would be willing to contribute <span class="optional">Select all that apply</span></label><div class="checkbox-grid">${["Administration", "Technology", "Media", "Music", "Teaching", "Mentoring", "Healthcare", "Legal", "Finance", "Hospitality", "Facilities", "Other"].map((value) => `<label><input type="checkbox" name="volunteeringInterests" value="${value}"><span>${value}</span></label>`).join("")}</div></div>`,
  );
}
function applyJourneyClassification() {
  const form = $("#updateForm");
  if (!form || !["member", "attendee"].includes(state.journeyType)) return;
  ["membershipStatus", "invitedBy", "connectCompleted"].forEach((name) =>
    form.elements.namedItem(name)?.closest(".field")?.remove(),
  );
  form.insertAdjacentHTML(
    "beforeend",
    `<input type="hidden" name="membershipStatus" value="${state.journeyType}"><input type="hidden" name="connectCompleted" value="${state.journeyType === "member" ? "yes" : "no_or_unsure"}">`,
  );
  const groups = form.querySelector(".group-picker-section"),
    label =
      state.journeyType === "member"
        ? "TLC member · Connect completed"
        : "Regular attendee · Connect not completed or unsure";
  groups?.insertAdjacentHTML(
    "afterbegin",
    `<div class="journey-summary"><span>${label}</span><button type="button" id="changeJourney">Change</button></div>`,
  );
  const change = $("#changeJourney");
  if (change) change.onclick = restartJourneyChoice;
}
function bindVisitorFields() {
  const form = $("#updateForm"),
    heard = document.querySelector('[name="heardAbout"]'),
    invitedWrap = $("#visitorInvitedBy"),
    invited = document.querySelector('[name="invitedBy"]');
  if (!heard || !invitedWrap || !invited) return;
  const visitorGender = document.querySelector('[name="gender"]');
  if (visitorGender?.tagName === "SELECT") {
    const selected = visitorGender.value;
    visitorGender.innerHTML =
      '<option value="">Choose one</option><option>Female</option><option>Male</option>';
    if (["Female", "Male"].includes(selected)) visitorGender.value = selected;
    visitorGender.required = true;
    const label = visitorGender.closest(".field")?.querySelector("label");
    if (label) label.innerHTML = 'Gender <span class="required-mark">Required</span>';
    const aboutCopy = visitorGender
      .closest(".field")
      ?.previousElementSibling?.querySelector("span");
    if (aboutCopy)
      aboutCopy.textContent =
        "Gender is required. The remaining background questions are optional.";
  }
  const update = () => {
    const needed = heard.value === "Invited by someone";
    invitedWrap.hidden = !needed;
    invited.required = needed;
    if (!needed) invited.value = "";
  };
  heard.addEventListener("change", update);
  update();
  const ethnicity = document.querySelector('[name="ethnicity"]');
  if (ethnicity && !$("#visitorDob")) {
    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      savedMonth = String(state.formDraft?.birthMonth || "");
    ethnicity
      .closest(".field")
      ?.insertAdjacentHTML(
        "afterend",
        `<div class="field dob-fields" id="visitorDob"><label>Date of birth <span class="optional">Optional</span></label><div><input name="birthDay" inputmode="numeric" maxlength="2" value="${esc(state.formDraft?.birthDay || "")}" placeholder="DD"><select name="birthMonth"><option value="">Month</option>${months.map((month, index) => `<option value="${index + 1}" ${savedMonth === String(index + 1) ? "selected" : ""}>${month}</option>`).join("")}</select><input name="birthYear" inputmode="numeric" maxlength="4" value="${esc(state.formDraft?.birthYear || "")}" placeholder="Year (optional)"></div></div>`,
      );
    const visitorDob = $("#visitorDob"),
      savedAgeGroup = String(state.formDraft?.ageGroup || "");
    if (visitorDob && !form.elements.namedItem("ageGroup"))
      visitorDob.insertAdjacentHTML(
        "afterend",
        `<div class="field"><label>Age group <span class="optional">Optional</span></label><select name="ageGroup"><option value="">Choose one</option>${AGE_GROUP_OPTIONS.map((value) => `<option ${savedAgeGroup === value ? "selected" : ""}>${value}</option>`).join("")}</select><p class="hint">If you enter a birth year, we will select this automatically.</p></div>`,
      );
  }
  if (!form.elements.namedItem("workStatus")) {
    const anchor = form.elements.namedItem("ageGroup")?.closest(".field") ||
      form.elements.namedItem("ethnicity")?.closest(".field");
    anchor?.insertAdjacentHTML(
      "afterend",
      `<div class="field"><label>Work status <span class="optional">Optional</span></label><select name="workStatus"><option value="">Choose one</option>${["Employed full-time", "Employed part-time", "Self-employed", "Student", "Retired", "Not currently working", "Homemaker or caring responsibilities", "Prefer not to say"].map((value) => `<option>${value}</option>`).join("")}</select></div>`,
    );
    const workStatus = form.elements.namedItem("workStatus"),
      savedWorkStatus = String(state.formDraft?.workStatus || "");
    if (
      workStatus?.tagName === "SELECT" &&
      [...workStatus.options].some((option) => option.value === savedWorkStatus)
    )
      workStatus.value = savedWorkStatus;
  }
  [
    ["countryOfOrigin", "visitorOriginOther", "countryOfOriginOther"],
    ["countryOfResidence", "visitorResidenceOther", "countryOfResidenceOther"],
  ].forEach(([countryName, wrapId, otherName]) => {
    const country = document.querySelector(`[name="${countryName}"]`);
    if (!country) return;
    if (!$("#" + wrapId))
      country
        .closest(".field")
        ?.insertAdjacentHTML(
          "afterend",
          `<div class="field" id="${wrapId}" hidden><label>Country name <span class="optional">Optional</span></label><input name="${otherName}" autocomplete="country-name" value="${esc(state.formDraft?.[otherName] || "")}" placeholder="Enter country"></div>`,
        );
    const otherWrap = $("#" + wrapId),
      toggle = () => {
        if (otherWrap) otherWrap.hidden = country.value !== "OTHER";
      };
    country.addEventListener("change", toggle);
    toggle();
  });
  const residence = document.querySelector('[name="countryOfResidence"]');
  if (residence) {
    let regionWrap = $("#visitorResidenceRegion");
    if (!regionWrap) {
      regionWrap = document.createElement("div");
      regionWrap.className = "field";
      regionWrap.id = "visitorResidenceRegion";
      residence
        .closest(".field")
        ?.insertAdjacentElement("afterend", regionWrap);
    }
    const updateRegion = () => {
      const values = LOCATION_OPTIONS[residence.value];
      regionWrap.hidden = !values;
      regionWrap.innerHTML = values
        ? `<label>County / region <span class="optional">Optional</span></label><select name="residenceRegion"><option value="">Choose or search</option>${values.map((value) => `<option>${esc(value)}</option>`).join("")}<option value="Other">Other / not listed</option></select>`
        : "";
      const field = regionWrap.querySelector("select");
      if (field) {
        const saved = state.formDraft?.residenceRegion || "";
        if (
          saved &&
          [...field.options].some((option) => option.value === saved)
        )
          field.value = saved;
        enhanceSearchableSelect(field);
      }
    };
    residence.addEventListener("change", updateRegion);
    updateRegion();
  }
}
function applyProfileTerminology() {
  const form = $("#updateForm"),
    nationality = form?.elements.namedItem("countryOfOrigin"),
    label = nationality?.closest(".field")?.querySelector(":scope > label");
  if (label) {
    const optional = label.querySelector(".optional")?.outerHTML || "";
    label.innerHTML = `Nationality ${optional}`;
  }
  form?.querySelectorAll(".hint, .profile-section-title span").forEach((node) => {
    node.textContent = node.textContent
      .replace(/country of origin/gi, "nationality")
      .replace(/Country of origin/g, "Nationality");
  });
}
function bindCommunicationOptions() {
  const form = $("#updateForm"),
    preference = form?.elements.namedItem("communicationPreference"),
    consent = form?.elements.namedItem("consent");
  if (preference?.tagName === "SELECT") {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = communicationMethodField();
    preference.closest(".field")?.replaceWith(wrapper.firstElementChild);
  }
  form
    ?.querySelectorAll('.communication-methods input[type="checkbox"]')
    .forEach((checkbox) =>
      checkbox.addEventListener("change", () => {
        const error = checkbox
          .closest(".communication-methods")
          ?.querySelector(".communication-error");
        if (error) error.hidden = true;
      }),
    );
  const currentConsent = form?.elements.namedItem("consent");
  if (currentConsent?.tagName === "SELECT") {
    const previous = currentConsent.value;
    currentConsent.innerHTML =
      '<option value="">Choose one</option><option>Yes</option><option>No</option>';
    if (["Essential messages only", "Yes, keep me informed", "Yes, essential messages only", "Yes"].includes(previous))
      currentConsent.value = "Yes";
    else if (["No, thank you", "No communications", "No"].includes(previous))
      currentConsent.value = "No";
    const label = currentConsent.closest(".field")?.querySelector("label");
    if (label) label.textContent = "May The Liberty Church contact you?";
  }
  const communicationMethods = form?.querySelector(".communication-methods"),
    consentField = currentConsent?.closest(".field");
  if (communicationMethods && consentField)
    communicationMethods.insertAdjacentElement("beforebegin", consentField);
  const updateCommunicationMethods = () => {
    if (!communicationMethods) return;
    const mayContact = currentConsent?.value === "Yes";
    communicationMethods.hidden = !mayContact;
    communicationMethods
      .querySelectorAll('input[type="checkbox"]')
      .forEach((checkbox) => {
        if (!mayContact) checkbox.checked = false;
        checkbox.disabled = !mayContact;
      });
    const error = communicationMethods.querySelector(".communication-error");
    if (error) error.hidden = true;
    if (!mayContact && state.formDraft)
      state.formDraft.communicationPreference = [];
  };
  currentConsent?.addEventListener("change", updateCommunicationMethods);
  updateCommunicationMethods();
}
function ethnicityVariantForCountry(value, region = "") {
  const country = String(value || "").toUpperCase();
  if (country === "US") return "US";
  if (country === "WALES" || /^Wales\b/i.test(String(region || ""))) return "WAL";
  return "UK";
}
function ethnicityOption(code, variant) {
  for (const group of ETHNICITY_GROUPS) {
    for (const option of group.options) {
      if (option[0] !== code) continue;
      if (code === "BAA" && variant !== "US") return null;
      let label = variant === "US" ? option[2] || option[1] : option[1];
      if (code === "W1" && variant === "WAL")
        label = "Welsh, English, Scottish, Northern Irish or British";
      return { group, code, label, writeIn: Boolean(option[3]) };
    }
  }
  return null;
}
function ethnicityDisplay(code, variant = "UK", other = "") {
  const option = ethnicityOption(String(code || ""), String(variant || "UK"));
  if (!option) return String(code || "Not provided");
  return other && option.writeIn
    ? `${option.label}: ${other}`
    : option.label;
}
function bindEthnicityQuestion() {
  const form = $("#updateForm"),
    residence = form?.elements.namedItem("countryOfResidence"),
    original = form?.elements.namedItem("ethnicity"),
    wrap = original?.closest(".field");
  if (!form || !residence || !wrap || wrap.dataset.groupedEthnicity) return;
  wrap.dataset.groupedEthnicity = "true";
  wrap.classList.add("ethnicity-question");
  if (state.journeyType === "visitor") {
    const residenceRegion = $("#visitorResidenceRegion"),
      residenceField = residence.closest(".field");
    (residenceRegion || residenceField)?.insertAdjacentElement("afterend", wrap);
  }
  const savedValue = String(
      state.formDraft?.ethnicityCode ||
        state.formDraft?.ethnicity ||
        original.value ||
        "",
    ),
    savedCode = ethnicityOption(savedValue, "UK")
      ? savedValue
      : LEGACY_ETHNICITY_CODES[savedValue] || "";
  let selectedCode = savedCode,
    otherText = String(state.formDraft?.ethnicityOther || ""),
    openGroupKey = "";
  const renderEthnicity = () => {
    const country = String(residence.value || ""),
      region = form.elements.namedItem("residenceRegion")?.value || "",
      variant = ethnicityVariantForCountry(country, region);
    if (selectedCode === "BAA" && variant !== "US") {
      selectedCode = "";
      otherText = "";
    }
    if (!country) {
      wrap.innerHTML = `<fieldset class="ethnicity-shell"><legend>What is your ethnic group?</legend><p class="ethnicity-question-hint">Choose your country of residence first. Nationality is a separate question.</p></fieldset>`;
      return;
    }
    const selectedOption = ethnicityOption(selectedCode, variant);
    const hiddenFields = `<input type="hidden" name="ethnicity" value="${esc(selectedCode)}"><input type="hidden" name="ethnicityCode" value="${esc(selectedCode)}"><input type="hidden" name="ethnicityVariant" value="${variant}">`;
    if (selectedOption && !openGroupKey) {
      wrap.innerHTML = `<fieldset class="ethnicity-shell"><legend>What is your ethnic group?</legend><p class="ethnicity-question-hint">Pick the one that fits you best. Nationality is a separate question.</p>${hiddenFields}<input type="hidden" name="ethnicityOther" value="${esc(otherText)}"><div class="ethnicity-selected-summary"><span><small>${esc(variant === "US" && selectedOption.group.us ? selectedOption.group.us : selectedOption.group.uk)}</small><b>${esc(ethnicityDisplay(selectedCode, variant, otherText))}</b></span><button type="button" class="ethnicity-change">Change</button></div></fieldset>`;
      wrap.querySelector(".ethnicity-change")?.addEventListener("click", () => {
        openGroupKey = selectedOption.group.key;
        renderEthnicity();
      });
      return;
    }
    const groups = ETHNICITY_GROUPS.map((group) => {
      const heading = variant === "US" && group.us ? group.us : group.uk;
      const isOpen = openGroupKey === group.key;
      const options = group.options
        .map(([code]) => ethnicityOption(code, variant))
        .filter(Boolean)
        .map(
          (option) => `<label class="ethnicity-option ${selectedCode === option.code ? "selected" : ""}"><input type="radio" name="ethnicitySelection" value="${option.code}" ${selectedCode === option.code ? "checked" : ""}><span>${esc(option.label)}</span></label>${selectedCode === option.code && option.writeIn ? `<div class="ethnicity-write-in"><label>Describe your background<input type="text" name="ethnicityOther" value="${esc(otherText)}" placeholder="Use your own words"></label><button type="button" class="btn secondary ethnicity-done">Done</button></div>` : ""}`,
        )
        .join("");
      return `<section class="ethnicity-group-card ${isOpen ? "open" : ""}"><button type="button" class="ethnicity-group-toggle" data-group="${group.key}" aria-expanded="${isOpen}"><span>${esc(heading)}</span><span class="ethnicity-chevron" aria-hidden="true">⌄</span></button>${isOpen ? `<fieldset class="ethnicity-options-panel" aria-labelledby="ethnicity-${group.key}"><legend class="sr-only" id="ethnicity-${group.key}">${esc(heading)}</legend>${options}</fieldset>` : ""}</section>`;
    }).join("");
    wrap.innerHTML = `<fieldset class="ethnicity-shell"><legend>What is your ethnic group?</legend><p class="ethnicity-question-hint">Pick the one that fits you best. Nationality is a separate question. You can continue without answering.</p>${hiddenFields}${selectedOption && !selectedOption.writeIn ? '<input type="hidden" name="ethnicityOther" value="">' : ""}<div class="ethnicity-groups">${groups}</div></fieldset>`;
    wrap.querySelectorAll(".ethnicity-group-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        openGroupKey = openGroupKey === button.dataset.group ? "" : button.dataset.group;
        renderEthnicity();
      });
    });
    const radios = [...wrap.querySelectorAll('[name="ethnicitySelection"]')];
    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        selectedCode = radio.value;
        otherText = "";
        const option = ethnicityOption(selectedCode, variant);
        openGroupKey = option?.writeIn ? option.group.key : "";
        renderEthnicity();
        captureFormDraft();
      });
    });
    wrap.querySelector('[name="ethnicityOther"]')?.addEventListener("input", (event) => {
      otherText = event.target.value;
      state.formDraft.ethnicityOther = otherText;
      saveDraft();
    });
    wrap.querySelector(".ethnicity-done")?.addEventListener("click", () => {
      openGroupKey = "";
      renderEthnicity();
      captureFormDraft();
    });
  };
  residence.addEventListener("change", renderEthnicity);
  form.addEventListener("change", (event) => {
    if (event.target?.name === "residenceRegion") renderEthnicity();
  });
  renderEthnicity();
}
function validateVisitorForm(form) {
  form
    .querySelectorAll(".field-error")
    .forEach((field) => field.classList.remove("field-error"));
  form.querySelector(".visitor-validation-message")?.remove();
  const invalid = [...form.querySelectorAll("input, select, textarea")].find(
    (control) => !control.disabled && !control.checkValidity(),
  );
  if (!invalid) return true;
  const field = invalid.closest(".field"),
    label =
      field
        ?.querySelector(":scope > label")
        ?.textContent?.replace(/Optional/gi, "")
        .trim() || "this question",
    message = document.createElement("div");
  message.className = "notice red visitor-validation-message";
  message.setAttribute("role", "alert");
  message.textContent = `Please complete “${label}” before continuing.`;
  form.insertBefore(message, form.firstElementChild);
  field?.classList.add("field-error");
  (field || message).scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => invalid.focus({ preventScroll: true }), 250);
  return false;
}

function validateSurveyForm(form) {
  form.querySelector(".survey-validation-message")?.remove();
  form.querySelectorAll(".survey-question-error").forEach((question) => {
    question.classList.remove("survey-question-error");
    question.removeAttribute("aria-invalid");
  });
  const unanswered = [...form.querySelectorAll(".survey-question")].find(
    (question) =>
      question.querySelector('input[type="radio"][required]') &&
      !question.querySelector('input[type="radio"]:checked'),
  );
  if (!unanswered) return true;
  const label = unanswered.querySelector("legend")?.textContent?.trim() ||
      "the highlighted question",
    message = document.createElement("div");
  message.className = "notice red survey-validation-message";
  message.setAttribute("role", "alert");
  message.textContent = `Please answer “${label}” before submitting the survey.`;
  unanswered.classList.add("survey-question-error");
  unanswered.setAttribute("aria-invalid", "true");
  unanswered.insertAdjacentElement("beforebegin", message);
  unanswered.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(
    () =>
      unanswered
        .querySelector('input[type="radio"]')
        ?.focus({ preventScroll: true }),
    250,
  );
  return false;
}

function bindPhotoUpload() {
  const form = $("#updateForm");
  if (!form || $("#memberPhoto")) return;
  const grid = form.querySelector(".form-grid");
  grid.insertAdjacentHTML(
    "afterbegin",
    `<div class="field profile-photo-field"><label>Profile photo</label><div class="headshot-control"><label class="headshot-frame ${state.existingPhoto ? "has-photo" : "has-placeholder"}" for="memberPhoto">${state.existingPhoto ? `<img src="${state.existingPhoto}" alt="Your current profile photo">` : '<span class="headshot-placeholder" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><circle cx="32" cy="21" r="12"></circle><path d="M11 56c1.7-13 9.8-20 21-20s19.3 7 21 20H11Z"></path></svg></span>'}</label><div><b>Use a clear headshot</b><p>Face the camera in good lighting, with only you in the picture.</p><label class="btn secondary headshot-button" for="memberPhoto">${state.existingPhoto ? "Change photo" : "Choose photo"}</label></div></div><input class="sr-only" id="memberPhoto" type="file" accept="image/jpeg,image/png,image/webp"><p class="hint" id="photoStatus">${state.photo ? `New photo ready: ${esc(state.photo.name || "uploaded photo")}` : state.existingPhoto ? "This is the photo currently held with your profile. Change it only if needed." : "JPEG, PNG or WebP, up to 10 MB."}</p>${state.photo ? '<button type="button" class="btn ghost" id="removePhoto">Use existing photo</button>' : ""}</div>`,
  );
  const input = $("#memberPhoto");
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const status = $("#photoStatus");
    status.textContent = "Preparing photo…";
    input.disabled = true;
    try {
      const data = await compressPhoto(file);
      status.textContent = "Uploading securely…";
      if (state.journeyType === "visitor") await ensureVisitorSession();
      const upload = () =>
        api("photo", {
          data,
          name: file.name,
          previous: state.photo?.pathname || "",
          manual: state.manualReview,
        });
      let result;
      try {
        result = await upload();
      } catch (error) {
        if (
          state.journeyType !== "visitor" ||
          !/session has expired/i.test(error.message || "")
        )
          throw error;
        await ensureVisitorSession(true);
        result = await upload();
      }
      state.photo = result.photo;
      state.existingPhoto = data;
      state.formDraft.photo = state.photo;
      saveDraft();
      render();
    } catch (error) {
      status.textContent =
        error.message || "Photo upload failed. Please try again.";
      input.value = "";
    } finally {
      input.disabled = false;
    }
  };
  const remove = $("#removePhoto");
  if (remove)
    remove.onclick = async () => {
      remove.disabled = true;
      try {
        await api("photoRemove", { pathname: state.photo.pathname });
        state.photo = null;
        state.existingPhoto = state.planningCenterPhoto;
        delete state.formDraft.photo;
        saveDraft();
        render();
      } catch {
        remove.disabled = false;
      }
    };
}
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10000000
    )
      return reject(new Error("Choose a JPEG, PNG or WebP image under 10 MB."));
    const image = new Image(),
      url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("We could not read that photo."));
    };
    image.src = url;
  });
}
function bindGroupPickers() {
  const section = document.querySelector(".group-picker-section");
  if (!section) return;
  if (!state.groupTypes.length)
    api("groupTypes")
      .then((data) => {
        state.groupTypes = data.types || [];
        render();
      })
      .catch(() => {});
  const teamTypes = state.groupTypes.filter(isTeamType),
    smallTypes = state.groupTypes.filter((type) =>
      /^small groups?$/i.test(type.name.trim()),
    ),
    teamValue = state.formDraft.teamMember || "",
    smallValue = state.formDraft.smallGroupMember || "";
  const selectedTeams = state.groupSelections.filter(isTeamGroup),
    selectedSmallGroups = state.groupSelections.filter(isSmallGroup);
  section.innerHTML = `<div class="profile-section-title"><b>Teams and Small Groups</b><span>Select each team first, then add your Small Group.</span></div><div class="field"><label>Are you a team member?</label><select id="teamMember" name="teamMember"><option value="">Choose one</option><option value="yes" ${teamValue === "yes" ? "selected" : ""}>Yes</option><option value="no" ${teamValue === "no" ? "selected" : ""}>No</option></select></div>${teamValue === "yes" ? `${selectedGroupsMarkup("Teams added", selectedTeams)}${groupPickerMarkup("team", selectedTeams.length ? "+ Add another team" : "Find your team", teamTypes)}` : ""}<div class="small-group-section"><div class="field"><label>Are you part of a Small Group?</label><select id="smallGroupMember" name="smallGroupMember"><option value="">Choose one</option><option value="yes" ${smallValue === "yes" ? "selected" : ""}>Yes</option><option value="no" ${smallValue === "no" ? "selected" : ""}>No</option></select></div>${smallValue === "yes" ? `${selectedGroupsMarkup("Small Groups added", selectedSmallGroups)}${groupPickerMarkup("small", selectedSmallGroups.length ? "Change or add another Small Group" : "Find your Small Group", smallTypes)}<div class="field small-group-fallback"><label>Can’t find your Small Group?</label><input name="smallGroupOther" value="${esc(state.formDraft.smallGroupOther || "")}" placeholder="Type the name as you know it, or Not sure"><p class="hint">Use this only if it does not appear in the search. The data team will review it.</p></div>` : ""}</div><p class="privacy group-privacy">Search by name or location. Your selections appear as you add them. Private locations are never displayed.</p>`;
  ["teamMember", "smallGroupMember"].forEach((id) => {
    const select = $(`#${id}`);
    if (select)
      select.onchange = () => {
        captureFormDraft();
        state.formDraft[id] = select.value;
        if (select.value !== "yes") {
          state.groupSelections = state.groupSelections.filter((group) =>
            id === "teamMember" ? !isTeamGroup(group) : !isSmallGroup(group),
          );
        }
        render();
      };
  });
  document.querySelectorAll("[data-group-kind]").forEach((input) => {
    let timer;
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const typeIds = String(input.dataset.typeIds || "")
            .split(",")
            .filter(Boolean),
          results = document.querySelector(
            `[data-group-results="${input.dataset.groupKind}"]`,
          );
        if (!typeIds.length || !results) return;
        results.innerHTML = '<div class="group-loading">Searching…</div>';
        try {
          const data = await api("groups", {
            typeIds,
            query: input.value.trim(),
          });
          results.innerHTML = data.groups?.length
            ? groupResultButtons(data.groups, input.dataset.groupKind)
            : '<div class="group-loading">No matching group found. Try another spelling or type the name below.</div>';
          bindGroupButtons();
        } catch {
          results.innerHTML =
            input.dataset.groupKind === "small"
              ? '<div class="group-loading">Group search is temporarily unavailable. Type the name below and continue.</div>'
              : '<div class="group-loading">Team search is temporarily unavailable. Please try again.</div>';
        }
      }, 250);
    };
  });
  bindGroupButtons();
}
function groupPickerMarkup(kind, label, types) {
  if (!types.length)
    return `<div class="notice"><b>${esc(label)}</b><br>The approved Planning Center list is not available yet. The data team can complete this during review.</div>`;
  return `<div class="field group-picker"><label>${esc(label)}</label><input data-group-kind="${kind}" data-type-ids="${esc(types.map((type) => type.id).join(","))}" autocomplete="off" placeholder="Search by name or location"><div class="group-results" data-group-results="${kind}">${groupResultButtons([])}</div></div>`;
}
function selectedGroupsMarkup(label, groups) {
  return groups.length
    ? `<div class="selected-groups" role="status" aria-live="polite"><label>${esc(label)}</label>${groups.map(groupChip).join("")}</div>`
    : "";
}
function bindMembershipLogic() {
  const form = $("#updateForm"),
    membership = form?.elements.namedItem("membershipStatus"),
    connect = form?.elements.namedItem("connectCompleted"),
    invited = form?.elements.namedItem("invitedBy"),
    invitedWrap = $("#invitedByField"),
    smallGroupSection = form?.querySelector(".small-group-section"),
    groupHeading = form?.querySelector(
      ".group-picker-section .profile-section-title",
    );
  if (!form || !membership) return;
  const update = () => {
    const nonMember = membership.value === "no";
    if (invitedWrap) invitedWrap.hidden = !nonMember;
    if (invited) {
      invited.disabled = !nonMember;
      invited.required = nonMember;
      const label = invited.closest(".field")?.querySelector(":scope > label");
      if (nonMember && label && !label.querySelector(".required-mark"))
        label.insertAdjacentHTML(
          "beforeend",
          '<span class="required-mark">Required</span>',
        );
    }
    if (connect) {
      connect.closest(".field").hidden = nonMember;
      connect.disabled = nonMember;
      connect.required = !nonMember;
    }
    if (smallGroupSection) {
      smallGroupSection.hidden = nonMember;
      smallGroupSection
        .querySelectorAll("input,select,button")
        .forEach((control) => (control.disabled = nonMember));
      const answer = smallGroupSection.querySelector(
        '[name="smallGroupMember"]',
      );
      if (answer) answer.required = !nonMember;
    }
    if (groupHeading) {
      const title = groupHeading.querySelector("b"),
        detail = groupHeading.querySelector("span");
      if (title)
        title.textContent = nonMember ? "Your teams" : "Teams and Small Groups";
      if (detail)
        detail.textContent = nonMember
          ? "Add any TLC team you currently serve in."
          : "Select each team first, then add your Small Group.";
    }
  };
  membership.addEventListener("change", update);
  update();
}
function bindProfileWizard() {
  const form = $("#updateForm");
  if (!form || form.querySelector(".profile-wizard")) return;
  const grid = form.querySelector(".form-grid");
  if (!grid) return;
  const labels = ["Identity & contact", "Home & faith", "Church & work"];
  const wizard = document.createElement("div");
  wizard.className = "profile-wizard";
  wizard.innerHTML = `<nav class="profile-wizard-tabs" aria-label="Profile form progress">${labels.map((label, index) => `<button type="button" data-profile-page="${index + 1}"><i>${index + 1}</i><span>${label}</span></button>`).join("")}<span class="mobile-wizard-action" id="mobileWizardAction"></span></nav><div class="profile-wizard-panels">${labels.map((label, index) => `<section class="profile-wizard-panel" data-profile-panel="${index + 1}"><div class="wizard-heading"><span>Part ${index + 1} of 3</span><h3>${label}</h3><p>${["Your names, photo, contact details and date of birth.", "Your residence, background and family at TLC.", "Your TLC location, membership, Connect, teams and Small Group."][index]}</p></div><div class="wizard-fields"></div></section>`).join("")}</div><footer class="profile-wizard-footer"><button type="button" class="btn ghost" id="profilePrevious">← Previous</button><button type="button" class="btn" id="profileNext">Next →</button><button type="submit" class="btn" id="profileFinish">Review →</button></footer>`;
  form.insertBefore(wizard, grid);
  const panel = (number) =>
      wizard.querySelector(`[data-profile-panel="${number}"] .wizard-fields`),
    moveField = (name, number) => {
      const control = form.elements.namedItem(name),
        element = control?.length ? control[0] : control,
        fieldWrap = element?.closest(".field");
      if (fieldWrap && !fieldWrap.closest(".profile-wizard-panel"))
        panel(number).appendChild(fieldWrap);
    },
    moveWrap = (id, number) => {
      const element = $(`#${id}`);
      if (element && !element.closest(".profile-wizard-panel"))
        panel(number).appendChild(element);
    };
  [
    "firstName",
    "lastName",
    "preferredName",
    "maidenName",
    "gender",
    "maritalStatus",
    "email",
    "phone",
    "consent",
    "communicationPreference",
    "birthDay",
    "ageGroup",
  ].forEach((name) => moveField(name, 1));
  const photo = $("#memberPhoto")?.closest(".field");
  if (photo) panel(1).insertBefore(photo, panel(1).firstChild);
  moveField("countryOfResidence", 2);
  moveWrap("residenceOtherCountryField", 2);
  moveWrap("residenceRegionField", 2);
  moveWrap("residenceLgaField", 2);
  moveWrap("residenceBoroughField", 2);
  ["postcode", "addressLine1"].forEach((name) => moveField(name, 2));
  moveField("countryOfOrigin", 2);
  moveWrap("originOtherCountryField", 2);
  moveWrap("originRegionField", 2);
  moveWrap("originBoroughField", 2);
  moveField("ethnicity", 2);
  const family = form.querySelector(".family-attendance-section");
  if (family) panel(2).appendChild(family);
  [
    "membershipStatus",
    "tlcLocation",
    "invitedBy",
    "connectCompleted",
    "baptised",
    "baptismChurch",
    "baptismYear",
    "attendanceFrequency",
    "yearStartedAttending",
    "pastoralFollowUp",
  ].forEach((name) => moveField(name, 3));
  const groups = form.querySelector(".group-picker-section");
  if (groups) panel(3).appendChild(groups);
  const serving = form.querySelector(".serving-section");
  serving?.remove();
  ["workStatus", "industry", "jobRole", "skills", "volunteeringInterests"].forEach((name) => moveField(name, 3));
  grid.remove();
  form
    .querySelectorAll(
      ":scope > .profile-section-title, :scope > .employment-intro",
    )
    .forEach((node) => node.remove());
  const oldSubmit = [...form.children].find(
    (node) => node.tagName === "BUTTON" && node.type === "submit",
  );
  if (oldSubmit && oldSubmit.id !== "profileFinish") oldSubmit.remove();

  const required = [
    "firstName",
    "lastName",
    "gender",
    "maritalStatus",
    "email",
    "phone",
    "addressLine1",
    "communicationPreference",
    "consent",
    "countryOfOrigin",
    "regionOfOrigin",
    "countryOfResidence",
    "residenceRegion",
    "tlcLocation",
    "attendanceFrequency",
    "yearStartedAttending",
    "pastoralFollowUp",
    "membershipStatus",
    "birthDay",
    "birthMonth",
    "ageGroup",
    "connectCompleted",
    "baptised",
    "industry",
    "familyAttends",
    "teamMember",
    "smallGroupMember",
  ];
  required.forEach((name) => {
    const named = form.elements.namedItem(name),
      control = named?.length ? named[0] : named;
    if (control) {
      // Contact methods form one multi-select checkbox group and are checked
      // together during submission; requiring one particular box would be wrong.
      if (name !== "communicationPreference") control.required = true;
      const label = control.closest(".field")?.querySelector(":scope > label");
      if (label && !label.querySelector(".required-mark"))
        label.insertAdjacentHTML(
          "beforeend",
          '<span class="required-mark">Required</span>',
        );
    }
  });
  form.querySelectorAll("select.searchable-select-source").forEach((select) => {
    const input = select.previousElementSibling?.querySelector(
      ".searchable-select-input",
    );
    if (input) {
      input.required = select.required;
      select.required = false;
    }
  });
  const emailInput = form.elements.namedItem("email"),
    phoneInput = form.elements.namedItem("phone"),
    birthDayInput = form.elements.namedItem("birthDay");
  if (emailInput) emailInput.type = "email";
  if (phoneInput) {
    phoneInput.type = "tel";
    phoneInput.autocomplete = "tel";
  }
  if (birthDayInput) {
    birthDayInput.min = "1";
    birthDayInput.max = "31";
  }
  updatePostcodeForCountry(
    form,
    form.elements.namedItem("countryOfResidence")?.value || "",
  );
  const baptism = form.elements.namedItem("baptised"),
    baptismChurch = form.elements.namedItem("baptismChurch"),
    baptismYear = form.elements.namedItem("baptismYear");
  const updateBaptismRequirements = () => {
    const needed = baptism?.value === "yes";
    if (baptismChurch) baptismChurch.required = needed;
    if (baptismYear) baptismYear.required = false;
  };
  baptism?.addEventListener("change", updateBaptismRequirements);
  updateBaptismRequirements();

  const showPage = (number, focus = false) => {
    state.profileFormPage = Math.max(1, Math.min(3, number));
    wizard
      .querySelectorAll("[data-profile-panel]")
      .forEach((section) =>
        section.classList.toggle(
          "active",
          Number(section.dataset.profilePanel) === state.profileFormPage,
        ),
      );
    wizard.querySelectorAll("[data-profile-page]").forEach((button) => {
      const page = Number(button.dataset.profilePage);
      button.classList.toggle("active", page === state.profileFormPage);
      button.classList.toggle("complete", page < state.profileFormPage);
      button.disabled = page > state.profileFormPage;
    });
    $("#profilePrevious").hidden = state.profileFormPage === 1;
    $("#profileNext").hidden = state.profileFormPage === 3;
    $("#profileFinish").hidden = state.profileFormPage !== 3;
    saveDraft();
    if (focus) {
      wizard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const validatePage = () => {
    const current = wizard.querySelector(
      `[data-profile-panel="${state.profileFormPage}"]`,
    );
    if (state.profileFormPage === 3) {
      const teamAnswer = form.elements.namedItem("teamMember"),
        smallAnswer = form.elements.namedItem("smallGroupMember"),
        hasTeam = state.groupSelections.some(isTeamGroup),
        hasSmall = state.groupSelections.some(isSmallGroup),
        typedSmall = String(
          form.elements.namedItem("smallGroupOther")?.value || "",
        ).trim();
      teamAnswer?.setCustomValidity(
        teamAnswer.value === "yes" &&
          state.groupTypes.some(isTeamType) &&
          !hasTeam
          ? "Please select your team."
          : "",
      );
      smallAnswer?.setCustomValidity(
        smallAnswer.value === "yes" && !hasSmall && !typedSmall
          ? "Please select your Small Group, or type its name in the fallback field."
          : "",
      );
    }
    for (const control of current.querySelectorAll("input, select, textarea")) {
      if (!control.checkValidity()) {
        const label =
          control
            .closest(".field")
            ?.querySelector(":scope > label")
            ?.textContent?.replace(/Required/gi, "")
            .trim() || "this question";
        let message = current.querySelector(".wizard-validation-message");
        if (!message) {
          message = document.createElement("div");
          message.className = "notice red wizard-validation-message";
          current
            .querySelector(".wizard-heading")
            ?.insertAdjacentElement("afterend", message);
        }
        message.textContent = `Part ${state.profileFormPage} needs “${label}” before you can continue.`;
        const smallGroupSearch =
            control.name === "smallGroupMember" && control.validationMessage
              ? current.querySelector('[data-group-kind="small"]')
              : null,
          errorTarget = smallGroupSearch || control;
        errorTarget.closest(".field")?.classList.add("field-error");
        errorTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        errorTarget.focus({ preventScroll: true });
        return false;
      }
      control.closest(".field")?.classList.remove("field-error");
    }
    current.querySelector(".wizard-validation-message")?.remove();
    return true;
  };
  form.noValidate = true;
  form._validateWizard = () => {
    for (let page = 1; page <= 3; page += 1) {
      showPage(page);
      if (!validatePage()) return false;
    }
    showPage(3);
    return true;
  };
  $("#profileNext").onclick = () => {
    captureFormDraft();
    if (validatePage()) showPage(state.profileFormPage + 1, true);
  };
  $("#profilePrevious").onclick = () => {
    captureFormDraft();
    showPage(state.profileFormPage - 1, true);
  };
  wizard.querySelectorAll("[data-profile-page]").forEach((button) => {
    button.onclick = () => {
      const page = Number(button.dataset.profilePage);
      if (page < state.profileFormPage) showPage(page, true);
    };
  });
  if (matchMedia("(max-width: 650px)").matches) {
    const action = $("#mobileWizardAction");
    action.appendChild($("#profileNext"));
    action.appendChild($("#profileFinish"));
  }
  showPage(state.profileFormPage);
}
function groupResultButtons(rows, kind = "") {
  return rows.length
    ? rows
        .map(
          (group) =>
            `<button type="button" class="group-result" data-pick-kind="${esc(kind)}" data-pick-group="${encodeURIComponent(JSON.stringify(group))}"><b>${esc(group.name)}</b><small>${esc(group.typeName)} · ${esc(group.location)}${group.schedule ? ` · ${esc(group.schedule)}` : ""}</small></button>`,
        )
        .join("")
    : '<div class="group-loading">Choose a type or search for a group.</div>';
}
function bindGroupButtons() {
  document.querySelectorAll("[data-pick-group]").forEach(
    (button) =>
      (button.onclick = () => {
        captureFormDraft();
        const group = {
          ...JSON.parse(decodeURIComponent(button.dataset.pickGroup)),
          selectionKind: button.dataset.pickKind || "team",
        };
        group.id = String(group.id || "");
        // Existing Planning Center memberships can arrive before their cached
        // type metadata. Replace that incomplete copy with the selected search
        // result instead of treating the click as a duplicate and ignoring it.
        state.groupSelections = state.groupSelections.filter(
          (item) => String(item.id || "") !== group.id,
        );
        state.groupSelections.push(group);
        if (group.selectionKind === "small")
          state.formDraft.smallGroupOther = "";
        state.formDraft[
          group.selectionKind === "small" ? "smallGroupMember" : "teamMember"
        ] = "yes";
        state.activeGroupTypeId = "";
        state.groupResults = [];
        saveDraft();
        render();
      }),
  );
  document.querySelectorAll("[data-remove-group]").forEach(
    (button) =>
      (button.onclick = () => {
        captureFormDraft();
        state.groupSelections = state.groupSelections.filter(
          (group) => group.id !== button.dataset.groupId,
        );
        saveDraft();
        render();
      }),
  );
}
async function bootstrapProductRoute() {
  if (PRODUCT_PATH === "/data") {
    state.mode = "admin-login";
    try {
      await loadAdmin();
      state.adminAuthenticated = true;
      state.mode = "admin";
    } catch {}
  } else if (PRODUCT_PATH === "/member-care") {
    state.mode = "pastoral-login";
    try {
      state.adminData.pastoral = await adminApi("pastoralWorkspace", { status: state.pastoralStatus });
      state.pastoralAuthenticated = true;
      state.mode = "pastoral";
    } catch {}
  } else if (PRODUCT_PATH === "/events") {
    state.mode = "events";
  }
  render();
  loadProviderStatus();
}
bootstrapProductRoute();
