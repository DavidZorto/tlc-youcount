import QrScanner from "/vendor/qr-scanner.min.js";

const root = document.querySelector("#checkinApp");
const todayInLondon = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const state = {
  authenticated: false,
  location: localStorage.getItem("tlc_welcome_location") || "Woodford",
  service: localStorage.getItem("tlc_welcome_service") || "Sunday Service",
  total: 0,
  locations: [],
  recent: [],
  headcounts: [],
  result: null,
  scanner: null,
  scanning: false,
  busy: false,
  date: todayInLondon(),
};
const esc = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
async function request(action, body = {}) {
  const response = await fetch("/api/checkin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({
    ok: false,
    message: "Check-in is temporarily unavailable.",
  }));
  if (!response.ok) {
    const error = new Error(data.message || "Check-in is temporarily unavailable.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function wordmark() {
  return `<div class="wordmark"><img src="/assets/youcount-card/logo-white.png" alt="The Liberty Church"></div>`;
}
function loginView(message = "") {
  root.innerHTML = `<main class="login-screen"><section class="login-card">${wordmark()}<span class="kicker">Welcoming team</span><h1>Service check-in</h1><p>Use the welcoming-team PIN. This does not provide access to member records or the data-team dashboard.</p><form id="pinForm"><label>Check-in PIN<input id="pin" type="password" inputmode="numeric" autocomplete="one-time-code" required autofocus></label>${message ? `<div class="error">${esc(message)}</div>` : ""}<button>Open scanner</button></form></section></main>`;
  document.querySelector("#pinForm").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await request("login", { pin: document.querySelector("#pin").value });
      state.authenticated = true;
      await loadOverview();
      render();
      await startCamera();
    } catch (error) {
      loginView(error.message);
    }
  };
}
async function loadOverview() {
  const data = await request("overview", {
    date: state.date,
    location: state.location,
    service: state.service,
  });
  state.date = data.date || state.date;
  state.total = data.total || 0;
  state.locations = data.locations || [];
  state.recent = data.recent || [];
  state.headcounts = data.headcounts || [];
}
function resultMarkup() {
  if (!state.result)
    return `<div class="ready"><i>⌗</i><div><b>Ready to scan</b><span>Hold the member’s QR code inside the frame.</span></div></div>`;
  const item = state.result;
  return `<div class="result ${item.error ? "failed" : item.duplicate ? "duplicate" : "success"}">${item.photoRecordId ? `<img src="/api/photo?record=${encodeURIComponent(item.photoRecordId)}" alt="">` : `<i>${item.error ? "!" : item.duplicate ? "↻" : "✓"}</i>`}<div><small>${item.error ? "Needs attention" : item.duplicate ? "Already checked in" : "Welcome"}</small><b>${esc(item.name || item.message)}</b>${item.publicId ? `<span>${esc(item.publicId)}</span>` : ""}</div></div>`;
}
function confirmationOverlay() {
  const item = state.result;
  if (!item || item.inlineOnly) return "";
  return `<div class="scan-confirmation ${item.error ? "failed" : item.duplicate ? "duplicate" : "success"}" role="status" aria-live="assertive"><div><i>${item.error ? "!" : item.duplicate ? "↻" : "✓"}</i><small>${item.error ? "Please try again" : item.duplicate ? "Already checked in" : "Checked in"}</small><b>${esc(item.name || item.message)}</b>${item.publicId ? `<span>${esc(item.publicId)}</span>` : ""}</div></div>`;
}
function playScanSound(kind) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext,
      context = new AudioContext(),
      notes =
        kind === "success"
          ? [[659, 0], [880, 0.12]]
          : kind === "duplicate"
            ? [[440, 0], [440, 0.16]]
            : [[220, 0], [165, 0.17]];
    notes.forEach(([frequency, delay], index) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        starts = context.currentTime + delay;
      oscillator.type = kind === "error" ? "square" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, starts);
      gain.gain.exponentialRampToValueAtTime(0.18, starts + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, starts + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(starts);
      oscillator.stop(starts + 0.18);
      if (index === notes.length - 1)
        oscillator.onended = () => context.close().catch(() => {});
    });
  } catch {}
}
function render() {
  if (!state.authenticated) return loginView();
  const live = state.date === todayInLondon();
  const currentHeadcount = state.headcounts.find((item) => item.location === state.location && item.service === state.service),
    totalHeadcount = state.headcounts.reduce((sum, item) => sum + Number(item.total || 0), 0);
  root.innerHTML = `<div class="scanner-app"><header>${wordmark()}<div><span>${live ? "Identified today" : "Selected date"}</span><b>${state.total}</b><button id="logout" aria-label="Log out">×</button></div></header><main><section class="service-settings"><label>Calendar date<input id="historyDate" type="date" max="${todayInLondon()}" value="${esc(state.date)}"></label><label>Location<select id="location">${state.locations.map((location) => `<option ${location === state.location ? "selected" : ""}>${esc(location)}</option>`).join("")}</select></label><label>Service<input id="service" value="${esc(state.service)}" placeholder="First Service"></label></section>${live ? `<section class="camera-card"><div class="camera-frame"><video id="camera" playsinline muted></video><div class="scan-guide"><i></i><span>Place QR code here</span></div></div><div class="camera-actions"><button id="cameraToggle">Start camera</button><span id="cameraStatus">Camera is off</span></div><form id="manualScan"><input id="code" autocomplete="off" autocapitalize="characters" placeholder="Or scan/type 482193"><button>Check in</button></form>${resultMarkup()}</section>` : `<section class="camera-card history-mode"><span class="kicker">Attendance history</span><h1>${new Date(`${state.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1><p>Scanning is disabled while viewing an earlier date. Choose today to resume check-in.</p><button id="returnToday">Return to today</button></section>`}<aside class="attendance-panel"><span class="kicker">Room count</span><div class="attendance-total"><b>${currentHeadcount?.total || 0}</b><span>people counted<br>${state.total} identified</span></div>${live ? `<form id="headcountForm"><div><label>Male<input name="male" type="number" min="0" max="50000" value="${currentHeadcount?.male ?? ""}" placeholder="0"></label><label>Female<input name="female" type="number" min="0" max="50000" value="${currentHeadcount?.female ?? ""}" placeholder="0"></label><label>Children<input name="children" type="number" min="0" max="50000" value="${currentHeadcount?.children ?? ""}" placeholder="0"></label></div><label>Service notes<textarea name="notes" rows="2" maxlength="300" placeholder="Optional">${esc(currentHeadcount?.notes || "")}</textarea></label><button>Save headcount</button><p id="headcountStatus"></p></form>` : ""}<div class="headcount-history"><b>${totalHeadcount}</b><span>Total headcount in this view</span>${state.headcounts.map((item) => `<p><strong>${esc(item.location)} · ${esc(item.service)}</strong><span>${item.male} male · ${item.female} female · ${item.children} children</span></p>`).join("") || `<p class="empty">No manual headcount saved.</p>`}</div></aside><section class="recent"><div><span class="kicker">${live ? "Live arrivals" : "Attendance record"}</span><h2>${live ? "Recently checked in" : "Recorded check-ins"}</h2></div>${state.recent.slice(0, 100).map((item) => `<article>${item.photoRecordId ? `<img src="/api/photo?record=${encodeURIComponent(item.photoRecordId)}" alt="">` : `<i>${esc(item.name[0])}</i>`}<div><b>${esc(item.name)}</b><span>${esc(item.service)} · ${new Date(item.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div><strong>✓</strong></article>`).join("") || `<p class="empty">No check-ins match this date, location and service.</p>`}</section></main>${confirmationOverlay()}</div>`;
  bind();
}
function bind() {
  document.querySelector("#historyDate").onchange = async (event) => {
    await stopCamera();
    state.date = event.target.value || todayInLondon();
    await loadOverview();
    render();
  };
  document.querySelector("#location").onchange = async (event) => {
    await stopCamera();
    state.location = event.target.value;
    localStorage.setItem("tlc_welcome_location", state.location);
    await loadOverview();
    render();
  };
  document.querySelector("#service").onchange = async (event) => {
    await stopCamera();
    state.service = event.target.value.trim() || "Sunday Service";
    localStorage.setItem("tlc_welcome_service", state.service);
    await loadOverview();
    render();
  };
  if (document.querySelector("#cameraToggle"))
    document.querySelector("#cameraToggle").onclick = () =>
      state.scanning ? stopCamera() : startCamera();
  if (document.querySelector("#manualScan"))
    document.querySelector("#manualScan").onsubmit = async (event) => {
      event.preventDefault();
      await scan(document.querySelector("#code").value);
    };
  if (document.querySelector("#headcountForm"))
    document.querySelector("#headcountForm").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        button = form.querySelector("button"),
        status = form.querySelector("#headcountStatus"),
        values = new FormData(form);
      button.disabled = true;
      status.textContent = "Saving…";
      try {
        const data = await request("headcount", {
          date: state.date, location: state.location, service: state.service,
          male: values.get("male"), female: values.get("female"), children: values.get("children"),
          notes: values.get("notes"), device: navigator.userAgent.includes("Mobile") ? "Attendance team phone" : "Attendance desk",
        });
        state.headcounts = data.headcounts || [];
        state.total = data.total || state.total;
        state.recent = data.recent || state.recent;
        render();
        document.querySelector("#headcountStatus")?.replaceChildren(document.createTextNode("Headcount saved."));
      } catch (error) {
        status.textContent = error.message;
        button.disabled = false;
      }
    };
  if (document.querySelector("#returnToday"))
    document.querySelector("#returnToday").onclick = async () => {
      state.date = todayInLondon();
      await loadOverview();
      render();
      await startCamera();
    };
  document.querySelector("#logout").onclick = async () => {
    await stopCamera();
    try { await request("logout"); } catch {}
    state.authenticated = false;
    loginView();
  };
}
async function startCamera() {
  const video = document.querySelector("#camera"),
    status = document.querySelector("#cameraStatus"),
    button = document.querySelector("#cameraToggle");
  if (!video || state.scanning) return;
  try {
    state.scanner = new QrScanner(
      video,
      (result) => scan(result?.data || result),
      {
        preferredCamera: "environment",
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 6,
      },
    );
    await state.scanner.start();
    state.scanning = true;
    video.classList.add("visible");
    button.textContent = "Stop camera";
    status.textContent = "Camera is live";
  } catch (error) {
    state.result = { error: true, inlineOnly: true, message: "Allow camera access in your browser settings, or use a handheld scanner." };
    render();
  }
}
async function stopCamera() {
  if (state.scanner) {
    try { await state.scanner.stop(); } catch {}
    try { state.scanner.destroy(); } catch {}
  }
  state.scanner = null;
  state.scanning = false;
  const video = document.querySelector("#camera"),
    status = document.querySelector("#cameraStatus"),
    button = document.querySelector("#cameraToggle");
  video?.classList.remove("visible");
  if (button) button.textContent = "Start camera";
  if (status) status.textContent = "Camera is off";
}
async function scan(code) {
  if (state.busy || !String(code || "").trim()) return;
  state.busy = true;
  state.scanner?.pause();
  try {
    const data = await request("scan", {
      code,
      location: state.location,
      service: state.service,
      device: navigator.userAgent.includes("Mobile") ? "Welcome team phone" : "Welcome desk scanner",
    });
    state.result = { ...data.checkin, duplicate: data.duplicate };
    playScanSound(data.duplicate ? "duplicate" : "success");
    if (navigator.vibrate) navigator.vibrate(data.duplicate ? [80, 50, 80] : 120);
    await loadOverview();
  } catch (error) {
    if (error.status === 401) {
      await stopCamera();
      state.authenticated = false;
      return loginView("Your scanner session expired. Enter the PIN again.");
    }
    state.result = { error: true, message: error.message };
    playScanSound("error");
  }
  await stopCamera();
  state.busy = false;
  render();
  const delay = state.result?.error ? 2200 : state.result?.duplicate ? 1800 : 1350;
  setTimeout(async () => {
    state.result = null;
    render();
    await startCamera();
  }, delay);
}

try {
  await loadOverview();
  state.authenticated = true;
  render();
  await startCamera();
} catch {
  loginView();
}
