const BASE = import.meta.env.VITE_API_URL || "";

function authHeaders() {
  const token = localStorage.getItem("lumen.auth.token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getHealth() {
  const r = await fetch(`${BASE}/api/health`);
  if (!r.ok) throw new Error("Health check failed");
  return r.json();
}

export async function recommend({ query, top_k = 6, max_price, region }) {
  const r = await fetch(`${BASE}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ query, top_k, max_price, region }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.detail || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function compare({ query, items, deep = false }) {
  const r = await fetch(`${BASE}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      query,
      deep,
      items: items.map((it) => ({
        title: it.title,
        url: it.url,
        source: it.source,
        snippet: it.snippet,
        price: it.price,
        image: it.image,
        reason: it.reason,
      })),
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.detail || `Compare failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function registerUser(payload) {
  const r = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Registration failed");
  return data;
}

export async function loginUser(payload) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Login failed");
  return data;
}

export async function getMe() {
  const r = await fetch(`${BASE}/auth/me`, { headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Not signed in");
  return data;
}

export async function updateMe(payload) {
  const r = await fetch(`${BASE}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Profile update failed");
  return data;
}

export async function listTrackify() {
  const r = await fetch(`${BASE}/trackify/list`, { headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Trackify list failed");
  return data;
}

export async function previewTrackify(product_url) {
  const r = await fetch(`${BASE}/trackify/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ product_url }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Could not read this product link");
  return data;
}

export async function addTrackify(payload) {
  const r = await fetch(`${BASE}/trackify/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Could not add product to Trackify");
  return data;
}

export async function updateTrackifyTarget(id, target_price) {
  const r = await fetch(`${BASE}/trackify/update/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ target_price }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Could not update target price");
  return data;
}

export async function removeTrackify(id) {
  const r = await fetch(`${BASE}/trackify/remove/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Trackify remove failed");
  return data;
}

export async function getTrackifyHistory(id) {
  const r = await fetch(`${BASE}/trackify/price-history/${id}`, { headers: authHeaders() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Price history failed");
  return data;
}

export async function forgotPassword(email) {
  const r = await fetch(`${BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Could not send verification code");
  return data;
}

export async function verifyOtp(email, otp_code) {
  const r = await fetch(`${BASE}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp_code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Invalid verification code");
  return data;
}

export async function resetPassword(email, otp_code, new_password) {
  const r = await fetch(`${BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp_code, new_password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Password reset failed");
  return data;
}

export async function copilotChat({ messages, context, compare_items = [], tracked_items = [] }) {
  const r = await fetch(`${BASE}/api/copilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ messages, context, compare_items, tracked_items }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || `Copilot failed (${r.status})`);
  return data;
}

export async function googleAuth(credential) {
  const r = await fetch(`${BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || "Google sign-in failed");
  return data;
}
