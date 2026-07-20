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

export function getBootstrap() {
  const from = new Date();
  const to = new Date(from.getTime() + 13 * 86_400_000);
  const params = new URLSearchParams({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    myAssignmentsOnly: "true",
  });
  return api(`/api/v1/bootstrap?${params}`);
}

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
