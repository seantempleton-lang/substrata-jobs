async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code = "REQUEST_FAILED";
    try {
      const payload = await response.json();
      message = payload.error?.message || payload.error || message;
      code = payload.error?.code || code;
    } catch { /* response was not JSON */ }
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    throw error;
  }

  return response.status === 204 ? null : response.json();
}

export function getSession() {
  return api("/api/v1/session");
}

export function login(username, password) {
  return api("/api/v1/session/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logout() {
  return api("/api/v1/session", { method: "DELETE" });
}

export function getBootstrap(myAssignmentsOnly = false) {
  const from = new Date();
  const to = new Date(from.getTime() + 13 * 86_400_000);
  const params = new URLSearchParams({
    from: nzDate(from),
    to: nzDate(to),
    myAssignmentsOnly: String(myAssignmentsOnly),
  });
  return api(`/api/v1/bootstrap?${params}`);
}

function nzDate(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function getServerLogs() { return api("/api/v1/daily-logs"); }
export function getServerLog(id) { return api(`/api/v1/daily-logs/${encodeURIComponent(id)}`); }
export function getOfficeLogs() { return api("/api/v1/office/daily-logs"); }
export function getPoints(jobNumber) { return api(`/api/v1/points?jobNumber=${encodeURIComponent(jobNumber)}`); }
export function createFieldHandoff(body) { return api("/api/v1/field-handoffs", { method: "POST", body: JSON.stringify(body) }); }

export function sendSyncProbe({ deviceId, probeId }) {
  return api("/api/v1/sync/probe", {
    method: "POST",
    body: JSON.stringify({
      deviceId,
      probeId,
      clientCreatedAt: new Date().toISOString(),
      platform: navigator.userAgentData?.platform || navigator.platform || "unknown",
      appVersion: "0.1.0",
    }),
  });
}

export function sendSyncBatch({ batchId, deviceId, lastSyncCursor = null, mutations }) {
  return api("/api/v1/sync", {
    method: "POST",
    headers: { "Idempotency-Key": batchId },
    body: JSON.stringify({ contractVersion: "1.0", batchId, deviceId, lastSyncCursor, mutations }),
  });
}
