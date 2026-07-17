// ============================================================
// طبقة الاتصال بالـ API
// ============================================================

const TOKEN_KEY = "meeza_token";
const USER_KEY = "meeza_user";
const ADMIN_TOKEN_KEY = "meeza_admin_token";

const Auth = {
  getToken() { return localStorage.getItem(TOKEN_KEY); },
  setToken(t) { localStorage.setItem(TOKEN_KEY, t); },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      const user = JSON.parse(raw);
      if (!user || (user.user_type !== "customer" && user.user_type !== "driver")) {
        // بيانات غير متوقعة أو تالفة — نظّفها بدل ما تسبب مشاكل غامضة
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        return null;
      }
      return user;
    } catch (e) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },
  setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); },
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = "login.html";
  },
  isLoggedIn() { return !!this.getToken(); },
  requireLogin() {
    if (!this.isLoggedIn()) window.location.href = "login.html";
  },
  getAdminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY); },
  setAdminToken(t) { localStorage.setItem(ADMIN_TOKEN_KEY, t); },
  adminLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.location.href = "admin-login.html";
  },
  requireAdmin() {
    if (!this.getAdminToken()) window.location.href = "admin-login.html";
  }
};

/**
 * استدعاء عام لأي endpoint في الـ API
 * @param {string} path - مسار الـ API مثال: "/api/trips/"
 * @param {object} options - { method, body, isForm, admin }
 */
async function apiRequest(path, options = {}) {
  const { method = "GET", body = null, isForm = false, admin = false, noAuth = false } = options;
  const headers = {};
  const token = noAuth ? null : (admin ? Auth.getAdminToken() : Auth.getToken());
  if (token) headers["Authorization"] = `Token ${token}`;
  if (!isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (!res.ok) {
    if (res.status === 401 && !noAuth) {
      // التوكن غير صالح أو منتهي (مثلاً بعد إعادة تهيئة قاعدة البيانات) — سجّل خروج تلقائي بدل التعليق
      if (admin) { Auth.adminLogout(); } else { Auth.logout(); }
      throw new Error("انتهت صلاحية الجلسة، سجّل الدخول من جديد");
    }
    const message = data && (data.detail || data.error || firstErrorMessage(data)) || "حدث خطأ، حاول مرة أخرى";
    throw new Error(message);
  }
  return data;
}

function firstErrorMessage(data) {
  if (!data || typeof data !== "object") return null;
  for (const key in data) {
    const val = data[key];
    if (Array.isArray(val)) return `${key}: ${val[0]}`;
    if (typeof val === "string") return val;
  }
  return null;
}

// ---------- Alert box (used by login/register pages) ----------
function showAlert(message, type = "error") {
  const box = document.getElementById("alertBox");
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

// ---------- Success Modal ----------
function showSuccessModal({ icon = "✅", title, message, buttonText = "ابدأ الآن", onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box" style="text-align:center;">
      <div style="font-size:3.5rem;margin-bottom:1rem;">${icon}</div>
      <h2 style="margin-bottom:.5rem;">${title}</h2>
      <p style="color:var(--gray-600);margin-bottom:1.75rem;">${message}</p>
      <button class="btn btn-primary btn-block btn-lg" id="successModalBtn">${buttonText}</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("successModalBtn").addEventListener("click", () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });
}

// ---------- Toasts ----------
function showToast(message, type = "ok") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${type === "ok" ? "ok" : "err"}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
