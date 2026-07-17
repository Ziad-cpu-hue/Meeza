// ============================================================
// منطق لوحة تحكم الكابتن
// ============================================================

const vehicleTypeLabels = {
  private_car: "سيارة خاصة",
  pickup_truck: "سيارة نقل (بيك أب)",
  refrigerated_truck: "شاحنة مبردة",
  motorcycle: "موتوسيكل توصيل",
};

let isOnline = false;
let isBlockedForDebt = false;
let locationPushTimer = null;
let currentActiveTripId = null;

document.addEventListener("DOMContentLoaded", async () => {
  Auth.requireLogin();
  const user = Auth.getUser();
  if (!user || user.user_type !== "driver") {
    Auth.logout();
    return;
  }

  document.getElementById("welcomeMsg").textContent = `مرحباً ${user.full_name || ""} 👋`;
  document.getElementById("avatarInitial").textContent = (user.full_name || "ك").charAt(0);
  document.getElementById("logoutBtn").addEventListener("click", () => Auth.logout());
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebar").classList.toggle("collapsed");
  });

  document.querySelectorAll(".sidebar nav a").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".sidebar nav a").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll("#approvedContent > section").forEach((s) => s.classList.add("hidden"));
      document.getElementById(`tab-${link.dataset.tab}`).classList.remove("hidden");
      if (link.dataset.tab === "trips") loadAvailableTrips();
      if (link.dataset.tab === "active") loadActiveTrip();
      if (link.dataset.tab === "history") loadHistory();
    });
  });

  document.getElementById("onlineToggle").addEventListener("click", toggleOnline);

  await checkApplicationStatus();

  // ---------- بولينج دوري: تحديث الطلبات المتاحة + الرحلة الحالية + حالة المديونية ----------
  setInterval(heartbeat, 8000);
});

async function heartbeat() {
  try {
    const app = await apiRequest("/api/drivers/me/");
    if (app.status !== "approved") return;
    renderDebtBanner(app);

    const homeVisible = !document.getElementById("tab-home").classList.contains("hidden");
    const tripsVisible = !document.getElementById("tab-trips").classList.contains("hidden");
    if (isOnline && (homeVisible || tripsVisible)) {
      loadAvailableTrips(homeVisible && !tripsVisible);
    }
    await loadActiveTrip(true);
  } catch (err) { /* silent */ }
}

function renderDebtBanner(app) {
  isBlockedForDebt = !!app.is_blocked_for_debt;
  const banner = document.getElementById("debtBanner");
  document.getElementById("statDebt").textContent = `${app.debt_balance} ج`;
  if (isBlockedForDebt) {
    document.getElementById("debtAmount").textContent = app.debt_balance;
    document.getElementById("debtLimitAmount").textContent = app.debt_limit;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

async function checkApplicationStatus() {
  try {
    const app = await apiRequest("/api/drivers/me/");
    document.getElementById("vehicleInfo").textContent = `نوع المركبة: ${vehicleTypeLabels[app.vehicle_type] || app.vehicle_type}`;

    if (app.status === "pending") {
      document.getElementById("pendingBanner").classList.remove("hidden");
    } else if (app.status === "rejected") {
      document.getElementById("rejectedBanner").classList.remove("hidden");
      if (app.admin_note) document.getElementById("rejectReason").textContent = app.admin_note;
    } else if (app.status === "approved") {
      document.getElementById("approvedContent").classList.remove("hidden");
      isOnline = app.is_online;
      renderOnlineButton();
      renderDebtBanner(app);
      loadStats();
      loadAvailableTrips(true);
      loadActiveTrip();
    }
  } catch (err) {
    showToast(err.message, "err");
  }
}

function renderOnlineButton() {
  const btn = document.getElementById("onlineToggle");
  btn.textContent = isOnline ? "⚡ متصل الآن" : "⚡ غير متصل";
  btn.style.background = isOnline ? "var(--green)" : "var(--gray-400)";
  btn.style.color = "#fff";
}

async function toggleOnline() {
  try {
    const data = await apiRequest("/api/drivers/toggle-online/", { method: "POST" });
    isOnline = data.is_online;
    renderOnlineButton();
    showToast(isOnline ? "أنت متصل الآن، هتوصلك الرحلات" : "أنت غير متصل حالياً", "ok");
    if (isOnline) loadAvailableTrips();
  } catch (err) {
    showToast(err.message, "err");
  }
}

async function loadStats() {
  try {
    const stats = await apiRequest("/api/drivers/stats/");
    document.getElementById("statTripsToday").textContent = stats.trips_today;
    document.getElementById("statEarningsToday").textContent = `${stats.earnings_today} ج`;
    document.getElementById("statTripsTotal").textContent = stats.trips_total;
  } catch (err) { /* silent */ }
}

async function loadAvailableTrips(previewOnly = false) {
  const targetId = previewOnly ? "homeTripsPreview" : "availableTripsList";
  const wrap = document.getElementById(targetId);
  if (!wrap) return;
  try {
    let trips = await apiRequest("/api/trips/available/");
    if (previewOnly) trips = trips.slice(0, 3);
    if (!trips.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="ic">🚕</div>لا توجد رحلات متاحة حالياً</div>';
      return;
    }
    wrap.innerHTML = trips.map((t) => `
      <div class="list-row">
        <div>
          <b>${t.pickup_address} ← ${t.dropoff_address}</b>
          <div style="font-size:.85rem;color:var(--gray-500);">
            ${t.service_type_display} · 📏 ${t.distance_km} كم${t.estimated_duration_min ? ` · ⏱ ${t.estimated_duration_min} دقيقة` : ""}
            ${t.price_increase_count ? ` · <span style="color:var(--green-dark);">تم رفع السعر</span>` : ""}
          </div>
        </div>
        <div style="text-align:left;">
          <div style="font-weight:800;color:var(--primary);">السعر: ${t.total_price} ج</div>
          <div style="font-size:.85rem;color:var(--green-dark);margin-bottom:.5rem;">أرباحك: ${t.driver_profit} ج</div>
          <button class="btn btn-green btn-sm" ${isBlockedForDebt ? "disabled title='لديك مديونية متجاوزة للحد المسموح'" : ""} onclick="acceptTrip(${t.id})">قبول الرحلة</button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--red);text-align:center;">${err.message}</p>`;
  }
}

async function acceptTrip(tripId) {
  try {
    await apiRequest(`/api/trips/${tripId}/accept/`, { method: "POST" });
    showToast("تم قبول الرحلة بنجاح!", "ok");
    loadAvailableTrips();
    loadStats();
    loadActiveTrip();
    document.querySelector('.sidebar nav a[data-tab="active"]').click();
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- الرحلة الحالية + إرسال الموقع الحي (مرحلة 7) ----------
async function loadActiveTrip(silent = false) {
  const wrap = document.getElementById("activeTripCard");
  try {
    const trips = await apiRequest("/api/trips/mine/");
    const active = trips.find((t) => t.status === "accepted");

    if (!active) {
      currentActiveTripId = null;
      stopLocationPush();
      if (wrap) wrap.innerHTML = '<div class="empty-state"><div class="ic">🚗</div>لا توجد رحلة نشطة حالياً</div>';
      return;
    }

    if (active.id !== currentActiveTripId) {
      currentActiveTripId = active.id;
      startLocationPush(active.id);
    }

    if (wrap) {
      wrap.innerHTML = `
        <div class="active-trip-box">
          <div class="field-row"><span>👤 العميل</span><b>${active.customer_name || "-"}</b></div>
          <div class="field-row"><span>📍 من</span><b>${active.pickup_address}</b></div>
          <div class="field-row"><span>🏁 إلى</span><b>${active.dropoff_address}</b></div>
          <div class="field-row"><span>📏 المسافة</span><b>${active.distance_km} كم${active.estimated_duration_min ? ` · ${active.estimated_duration_min} دقيقة` : ""}</b></div>
          <div class="field-row"><span>💳 الدفع</span><b>${active.payment_method_display}</b></div>
          <div class="field-row"><span>💰 أرباحك</span><b style="color:var(--green-dark);">${active.driver_profit} ج</b></div>
          <div class="field-row"><span>💵 السعر الإجمالي</span><b>${active.total_price} ج</b></div>
          <p style="font-size:.85rem;color:var(--gray-500);margin:1rem 0;">📡 يتم إرسال موقعك تلقائياً للعميل كل بضع ثوانٍ طوال مدة الرحلة.</p>
          <button class="btn btn-primary btn-block btn-lg" onclick="completeTrip(${active.id})">✅ إنهاء الرحلة</button>
        </div>
      `;
    }
  } catch (err) {
    if (!silent && wrap) wrap.innerHTML = `<p style="color:var(--red);text-align:center;">${err.message}</p>`;
  }
}

function round6(n) { return Number(Number(n).toFixed(6)); }

function startLocationPush(tripId) {
  stopLocationPush();
  if (!navigator.geolocation) return;

  const pushOnce = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        apiRequest(`/api/trips/${tripId}/location/`, {
          method: "POST",
          body: { lat: round6(pos.coords.latitude), lng: round6(pos.coords.longitude) },
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  pushOnce();
  locationPushTimer = setInterval(pushOnce, 6000);
}

function stopLocationPush() {
  if (locationPushTimer) {
    clearInterval(locationPushTimer);
    locationPushTimer = null;
  }
}

async function completeTrip(tripId) {
  try {
    await apiRequest(`/api/trips/${tripId}/complete/`, { method: "POST" });
    showToast("تم إنهاء الرحلة بنجاح، تم تحديث حسابك", "ok");
    stopLocationPush();
    currentActiveTripId = null;
    loadStats();
    loadActiveTrip();
    checkApplicationStatus();
  } catch (err) {
    showToast(err.message, "err");
  }
}

async function loadHistory() {
  const wrap = document.getElementById("historyTripsList");
  wrap.innerHTML = '<p style="text-align:center;color:var(--gray-500);">جارٍ التحميل...</p>';
  try {
    const trips = await apiRequest("/api/trips/mine/");
    if (!trips.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="ic">📭</div>لا يوجد سجل رحلات بعد</div>';
      return;
    }
    wrap.innerHTML = trips.map((t) => `
      <div class="list-row">
        <div>
          <b>${t.pickup_address} ← ${t.dropoff_address}</b>
          <div style="font-size:.85rem;color:var(--gray-500);">${new Date(t.created_at).toLocaleString("ar-EG")} · ${t.payment_method_display}</div>
        </div>
        <div style="text-align:left;">
          <div style="font-weight:800;color:var(--primary);">${t.total_price} ج</div>
          <span class="tag tag-${t.status === "completed" ? "approved" : "pending"}">${t.status_display}</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--red);text-align:center;">${err.message}</p>`;
  }
}
