// ============================================================
// منطق لوحة تحكم المالك
// ============================================================

const vehicleTypeLabelsAdmin = {
  private_car: "سيارة خاصة",
  pickup_truck: "سيارة نقل (بيك أب)",
  refrigerated_truck: "شاحنة مبردة",
  motorcycle: "موتوسيكل توصيل",
};

let currentAppStatus = "pending";
let currentTripFilter = "";

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireAdmin();
  document.getElementById("logoutBtn").addEventListener("click", () => Auth.adminLogout());
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebar").classList.toggle("collapsed");
  });

  document.querySelectorAll(".sidebar nav a").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".sidebar nav a").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll("main section").forEach((s) => s.classList.add("hidden"));
      document.getElementById(`tab-${link.dataset.tab}`).classList.remove("hidden");
      if (link.dataset.tab === "overview") loadOverview();
      if (link.dataset.tab === "applications") loadApplications();
      if (link.dataset.tab === "drivers") loadDrivers();
      if (link.dataset.tab === "customers") loadCustomers();
      if (link.dataset.tab === "trips") loadTrips();
      if (link.dataset.tab === "earnings") loadEarnings();
      if (link.dataset.tab === "pricing") loadPricing();
      if (link.dataset.tab === "messages") loadConversationsList();
    });
  });

  document.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-status]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentAppStatus = btn.dataset.status;
      loadApplications();
    });
  });

  document.querySelectorAll("[data-tripfilter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tripfilter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTripFilter = btn.dataset.tripfilter;
      loadTrips();
    });
  });

  document.getElementById("fuelForm").addEventListener("submit", saveFuelPrice);
  document.getElementById("pricingForm").addEventListener("submit", savePricingConfig);
  document.getElementById("walletForm").addEventListener("submit", saveWalletNumber);
  document.getElementById("saveEfficiencyBtn").addEventListener("click", saveEfficiency);
  ["platformPct", "fuelPct", "maintenancePct", "driverPct"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updatePctSum);
  });

  loadOverview();
});

function updatePctSum() {
  const sum = ["platformPct", "fuelPct", "maintenancePct", "driverPct"]
    .reduce((acc, id) => acc + (parseFloat(document.getElementById(id).value) || 0), 0);
  const el = document.getElementById("pctSum");
  el.textContent = `مجموع النسب الحالي: ${sum.toFixed(1)}%${sum !== 100 ? " (يجب أن يساوي المجموع 100%)" : " ✅"}`;
  el.style.color = sum === 100 ? "var(--green)" : "var(--red)";
}

// ---------- نظرة عامة ----------
async function loadOverview() {
  try {
    const data = await apiRequest("/api/adminpanel/overview/", { admin: true });
    document.getElementById("ov_customers").textContent = data.total_customers;
    document.getElementById("ov_drivers").textContent = data.total_approved_drivers;
    document.getElementById("ov_pending").textContent = data.pending_applications;
    document.getElementById("ov_trips_today").textContent = data.trips_today;
    document.getElementById("ov_revenue").textContent = `${data.total_platform_revenue} ج`;
    document.getElementById("ov_fuel").textContent = `${data.fuel_price_per_liter} ج / لتر`;
    document.getElementById("ov_live").textContent = data.trips_live;
    document.getElementById("ov_debt").textContent = `${data.total_outstanding_debt} ج`;
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- طلبات الكباتن ----------
async function loadApplications() {
  const wrap = document.getElementById("applicationsList");
  wrap.innerHTML = '<p style="text-align:center;color:var(--gray-500);">جارٍ التحميل...</p>';
  try {
    const apps = await apiRequest(`/api/adminpanel/applications/?status=${currentAppStatus}`, { admin: true });
    if (!apps.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="ic">🪪</div>لا توجد طلبات في هذا القسم</div>';
      return;
    }
    wrap.innerHTML = apps.map((a) => `
      <div class="list-row">
        <div>
          <b>${a.full_name}</b> — ${vehicleTypeLabelsAdmin[a.vehicle_type] || a.vehicle_type}
          <div style="font-size:.85rem;color:var(--gray-500);">${a.phone} · ${a.email} · ${new Date(a.created_at).toLocaleDateString("ar-EG")}</div>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;">
          <span class="tag tag-${a.status === "approved" ? "approved" : a.status === "rejected" ? "rejected" : "pending"}">${a.status_display}</span>
          <button class="btn btn-outline btn-sm" onclick="openApplication(${a.id})">عرض التفاصيل</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--red);text-align:center;">${err.message}</p>`;
  }
}

async function openApplication(id) {
  try {
    const a = await apiRequest(`/api/adminpanel/applications/${id}/`, { admin: true });
    const modal = document.getElementById("appModal");
    document.getElementById("appModalContent").innerHTML = `
      <h2 style="margin-bottom:1rem;">${a.full_name}</h2>
      <p style="color:var(--gray-600);margin-bottom:1rem;">${vehicleTypeLabelsAdmin[a.vehicle_type]} · ${a.phone} · ${a.email}</p>
      <div class="doc-grid">
        <figure><img class="doc-thumb" src="${a.vehicle_photo}" alt="المركبة"><figcaption>صورة المركبة</figcaption></figure>
        <figure><img class="doc-thumb" src="${a.license_photo}" alt="الرخصة"><figcaption>رخصة القيادة</figcaption></figure>
        <figure><img class="doc-thumb" src="${a.id_selfie_front}" alt="سيلفي مع البطاقة"><figcaption>سيلفي مع البطاقة (وش)</figcaption></figure>
        <figure><img class="doc-thumb" src="${a.id_photo_back}" alt="ظهر البطاقة"><figcaption>ظهر البطاقة</figcaption></figure>
      </div>
      ${a.status === "pending" ? `
        <div class="field"><label>ملاحظة (اختياري عند الرفض)</label><textarea id="adminNote" rows="2"></textarea></div>
        <div style="display:flex;gap:.75rem;margin-top:1rem;">
          <button class="btn btn-green btn-block" onclick="decideApplication(${a.id}, 'approve')">✅ موافقة</button>
          <button class="btn btn-block" style="background:var(--red);color:#fff;" onclick="decideApplication(${a.id}, 'reject')">❌ رفض</button>
        </div>
      ` : `<span class="tag tag-${a.status === "approved" ? "approved" : "rejected"}">${a.status_display}</span>`}
      <button class="btn btn-outline btn-block" style="margin-top:1rem;" onclick="closeModal()">إغلاق</button>
    `;
    modal.classList.remove("hidden");
  } catch (err) {
    showToast(err.message, "err");
  }
}

function closeModal() {
  document.getElementById("appModal").classList.add("hidden");
}

async function decideApplication(id, action) {
  const note = document.getElementById("adminNote") ? document.getElementById("adminNote").value : "";
  try {
    await apiRequest(`/api/adminpanel/applications/${id}/${action}/`, {
      method: "POST",
      body: { admin_note: note },
      admin: true,
    });
    showToast(action === "approve" ? "تمت الموافقة على الكابتن" : "تم رفض الطلب", "ok");
    closeModal();
    loadApplications();
    loadOverview();
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- الكباتن المعتمدون ----------
async function loadDrivers() {
  const tbody = document.getElementById("driversTableBody");
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">جارٍ التحميل...</td></tr>`;
  try {
    const drivers = await apiRequest("/api/adminpanel/drivers/", { admin: true });
    if (!drivers.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray-500);">لا يوجد كباتن معتمدون بعد</td></tr>`;
      return;
    }
    tbody.innerHTML = drivers.map((d) => `
      <tr>
        <td>${d.full_name}</td><td>${d.phone}</td><td>${vehicleTypeLabelsAdmin[d.vehicle_type]}</td>
        <td><span class="tag ${d.is_online ? "tag-online" : "tag-pending"}">${d.is_online ? "متصل" : "غير متصل"}</span></td>
        <td>${d.trips_count}</td>
        <td>
          <span style="color:${d.is_blocked_for_debt ? "var(--red)" : "var(--gray-700)"};font-weight:${d.is_blocked_for_debt ? "800" : "400"};">${d.debt_balance} ج</span>
          ${d.is_blocked_for_debt ? '<div style="font-size:.75rem;color:var(--red);">محظور مؤقتاً</div>' : ""}
        </td>
        <td>${parseFloat(d.debt_balance) > 0 ? `<button class="btn btn-outline btn-sm" onclick="settleDebt(${d.id})">تسجيل سداد</button>` : "—"}</td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);">${err.message}</td></tr>`;
  }
}

async function settleDebt(driverId) {
  const amount = prompt("قيمة المبلغ المسدد بالجنيه (اتركه فارغاً لتصفير المديونية بالكامل):", "");
  if (amount === null) return;
  try {
    await apiRequest(`/api/adminpanel/drivers/${driverId}/settle-debt/`, {
      method: "POST",
      body: { amount: amount.trim() === "" ? null : parseFloat(amount) },
      admin: true,
    });
    showToast("تم تسجيل السداد بنجاح", "ok");
    loadDrivers();
    loadOverview();
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- العملاء ----------
async function loadCustomers() {
  const tbody = document.getElementById("customersTableBody");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">جارٍ التحميل...</td></tr>`;
  try {
    const customers = await apiRequest("/api/adminpanel/customers/", { admin: true });
    if (!customers.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-500);">لا يوجد عملاء بعد</td></tr>`;
      return;
    }
    tbody.innerHTML = customers.map((c) => `
      <tr>
        <td>${c.full_name || "—"}</td><td>${c.email}</td><td>${c.phone || "—"}</td><td>${c.trips_count}</td>
        <td><span class="tag ${c.is_blocked ? "tag-rejected" : "tag-approved"}">${c.is_blocked ? "محظور" : "نشط"}</span></td>
        <td><button class="btn btn-outline btn-sm" onclick="toggleCustomerBlock(${c.id})">${c.is_blocked ? "إلغاء الحظر" : "حظر"}</button></td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);">${err.message}</td></tr>`;
  }
}

async function toggleCustomerBlock(id) {
  try {
    await apiRequest(`/api/adminpanel/customers/${id}/toggle-block/`, { method: "POST", admin: true });
    loadCustomers();
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- الرحلات ----------
async function loadTrips() {
  const tbody = document.getElementById("tripsTableBody");
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">جارٍ التحميل...</td></tr>`;
  try {
    const url = currentTripFilter ? `/api/adminpanel/trips/?status=${currentTripFilter}` : "/api/adminpanel/trips/";
    const trips = await apiRequest(url, { admin: true });
    if (!trips.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--gray-500);">لا توجد رحلات في هذا القسم</td></tr>`;
      return;
    }
    tbody.innerHTML = trips.map((t) => `
      <tr>
        <td>${t.customer_name}</td><td>${t.driver_name || "—"}</td><td>${t.service_type_display}</td>
        <td>${t.pickup_address} ← ${t.dropoff_address}</td><td>${t.total_price} ج</td>
        <td>
          ${t.payment_method_display}
          ${t.payment_method === "wallet" ? `<div><span class="tag ${t.payment_status === "confirmed" ? "tag-approved" : "tag-pending"}" style="margin-top:.25rem;">${t.payment_status_display}</span></div>` : ""}
        </td>
        <td><span class="tag tag-${t.status === "completed" ? "approved" : t.status === "cancelled" ? "rejected" : "pending"}">${t.status_display}</span></td>
        <td>
          ${t.payment_method === "wallet" && t.payment_status === "proof_uploaded" ? `
            <a href="${t.wallet_proof}" target="_blank" class="btn btn-outline btn-sm" style="margin-bottom:.3rem;display:inline-block;">عرض الإثبات</a>
            <button class="btn btn-green btn-sm" onclick="confirmPayment(${t.id})">تأكيد الدفع</button>
          ` : "—"}
        </td>
      </tr>
    `).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--red);">${err.message}</td></tr>`;
  }
}

async function confirmPayment(tripId) {
  try {
    await apiRequest(`/api/adminpanel/trips/${tripId}/confirm-payment/`, { method: "POST", admin: true });
    showToast("تم تأكيد استلام الدفع", "ok");
    loadTrips();
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- التقارير المالية ----------
async function loadEarnings() {
  const dailyWrap = document.getElementById("dailyEarningsList");
  const monthlyWrap = document.getElementById("monthlyEarningsList");
  dailyWrap.innerHTML = monthlyWrap.innerHTML = '<p style="text-align:center;color:var(--gray-500);">جارٍ التحميل...</p>';
  try {
    const data = await apiRequest("/api/adminpanel/earnings/", { admin: true });
    dailyWrap.innerHTML = data.daily.length ? data.daily.map((d) => `
      <div class="list-row"><span>${d.date}</span><b>${d.revenue} ج · ${d.trips} رحلة</b></div>
    `).join("") : '<p style="color:var(--gray-500);text-align:center;">لا توجد بيانات بعد</p>';
    monthlyWrap.innerHTML = data.monthly.length ? data.monthly.map((m) => `
      <div class="list-row"><span>${m.month}</span><b>${m.revenue} ج · ${m.trips} رحلة</b></div>
    `).join("") : '<p style="color:var(--gray-500);text-align:center;">لا توجد بيانات بعد</p>';
  } catch (err) {
    dailyWrap.innerHTML = monthlyWrap.innerHTML = `<p style="color:var(--red);text-align:center;">${err.message}</p>`;
  }
}

// ---------- التسعير ----------
async function loadPricing() {
  try {
    const cfg = await apiRequest("/api/adminpanel/pricing-config/", { admin: true });
    document.getElementById("fuelPrice").value = cfg.fuel_price_per_liter;
    document.getElementById("platformPct").value = cfg.platform_percent;
    document.getElementById("fuelPct").value = cfg.fuel_percent;
    document.getElementById("maintenancePct").value = cfg.maintenance_percent;
    document.getElementById("driverPct").value = cfg.driver_percent;
    document.getElementById("walletNumber").value = cfg.platform_wallet_number || "";
    updatePctSum();

    const effWrap = document.getElementById("efficiencyFields");
    effWrap.innerHTML = Object.entries(cfg.fuel_efficiency).map(([key, val]) => `
      <div class="field">
        <label>${vehicleTypeLabelsAdmin[key] || key}</label>
        <input type="number" step="0.1" class="eff-input" data-key="${key}" value="${val}">
      </div>
    `).join("");
  } catch (err) {
    showToast(err.message, "err");
  }
}

async function saveFuelPrice(e) {
  e.preventDefault();
  try {
    await apiRequest("/api/adminpanel/pricing-config/", {
      method: "PATCH",
      body: { fuel_price_per_liter: parseFloat(document.getElementById("fuelPrice").value) },
      admin: true,
    });
    showToast("تم تحديث سعر الوقود، هيتحسب تلقائياً في كل الرحلات الجديدة", "ok");
    loadOverview();
  } catch (err) {
    showToast(err.message, "err");
  }
}

async function savePricingConfig(e) {
  e.preventDefault();
  try {
    await apiRequest("/api/adminpanel/pricing-config/", {
      method: "PATCH",
      body: {
        platform_percent: parseFloat(document.getElementById("platformPct").value),
        fuel_percent: parseFloat(document.getElementById("fuelPct").value),
        maintenance_percent: parseFloat(document.getElementById("maintenancePct").value),
        driver_percent: parseFloat(document.getElementById("driverPct").value),
      },
      admin: true,
    });
    showToast("تم حفظ نسب التسعير بنجاح", "ok");
  } catch (err) {
    showToast(err.message, "err");
  }
}

async function saveWalletNumber(e) {
  e.preventDefault();
  try {
    await apiRequest("/api/adminpanel/pricing-config/", {
      method: "PATCH",
      body: { platform_wallet_number: document.getElementById("walletNumber").value.trim() },
      admin: true,
    });
    showToast("تم حفظ رقم المحفظة", "ok");
  } catch (err) {
    showToast(err.message, "err");
  }
}

async function saveEfficiency() {
  const efficiency = {};
  document.querySelectorAll(".eff-input").forEach((input) => {
    efficiency[input.dataset.key] = parseFloat(input.value);
  });
  try {
    await apiRequest("/api/adminpanel/pricing-config/", {
      method: "PATCH",
      body: { fuel_efficiency: efficiency },
      admin: true,
    });
    showToast("تم حفظ معدلات الاستهلاك", "ok");
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- الرسائل ----------
let currentThreadId = null;
let threadPollInterval = null;
let conversationsPollInterval = null;

const userTypeLabelsAdmin = { customer: "عميل", driver: "كابتن" };

async function loadConversationsList() {
  const wrap = document.getElementById("conversationsList");
  try {
    const conversations = await apiRequest("/api/support/admin/conversations/", { admin: true });
    if (!conversations.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="ic">💬</div>لا توجد محادثات بعد</div>';
    } else {
      wrap.innerHTML = conversations.map((c) => `
        <div class="list-row" style="cursor:pointer;${c.id === currentThreadId ? "background:var(--gray-50);" : ""}" onclick="openThread(${c.id})">
          <div>
            <b>${c.user_name || c.user_email}</b>
            <span class="tag tag-pending" style="margin-right:.4rem;">${userTypeLabelsAdmin[c.user_type] || c.user_type}</span>
            <div style="font-size:.82rem;color:var(--gray-500);margin-top:.25rem;">${c.last_message || ""}</div>
          </div>
          ${c.unread_count > 0 ? `<span class="tag tag-rejected">${c.unread_count}</span>` : ""}
        </div>
      `).join("");
    }
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--red);">${err.message}</p>`;
  }
  if (!conversationsPollInterval) {
    conversationsPollInterval = setInterval(() => {
      if (!document.getElementById("tab-messages").classList.contains("hidden")) loadConversationsList();
    }, 6000);
  }
}

async function openThread(id) {
  currentThreadId = id;
  document.getElementById("threadReplyForm").classList.remove("hidden");
  loadConversationsList();
  await loadThread();
  if (threadPollInterval) clearInterval(threadPollInterval);
  threadPollInterval = setInterval(loadThread, 5000);
}

async function loadThread() {
  if (!currentThreadId) return;
  try {
    const data = await apiRequest(`/api/support/admin/conversations/${currentThreadId}/`, { admin: true });
    const header = document.getElementById("threadHeader");
    const wrap = document.getElementById("threadMessages");
    header.textContent = `محادثة #${data.id}`;
    if (!data.messages.length) {
      wrap.innerHTML = '<p class="chat-empty">لا توجد رسائل بعد</p>';
      return;
    }
    const wasAtBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 20;
    wrap.innerHTML = data.messages.map((m) => `
      <div class="chat-msg ${m.sender === "admin" ? "chat-msg-user" : "chat-msg-admin"}">
        <div class="chat-bubble">${escapeHtmlAdmin(m.text)}</div>
        <span class="chat-time">${new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    `).join("");
    if (wasAtBottom || wrap.dataset.firstLoad !== "done") {
      wrap.scrollTop = wrap.scrollHeight;
      wrap.dataset.firstLoad = "done";
    }
  } catch (err) {
    showToast(err.message, "err");
  }
}

function escapeHtmlAdmin(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("threadReplyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("threadReplyInput");
  const text = input.value.trim();
  if (!text || !currentThreadId) return;
  input.value = "";
  try {
    await apiRequest(`/api/support/admin/conversations/${currentThreadId}/reply/`, {
      method: "POST", body: { text }, admin: true,
    });
    loadThread();
  } catch (err) {
    showToast(err.message, "err");
  }
});
