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
let platformWalletNumber = "";

async function loadWalletNumber() {
  try {
    const data = await apiRequest("/api/pricing/current/", { noAuth: true });
    platformWalletNumber = data.platform_wallet_number || "";
    document.querySelectorAll(".wallet-pay-number").forEach((el) => {
      el.textContent = platformWalletNumber || "—";
    });
  } catch (e) { /* silent */ }
}

function copyWalletNumber(elementId) {
  const el = document.getElementById(elementId);
  const number = (el && el.textContent.trim()) || platformWalletNumber;
  if (!number || number === "—") return;
  navigator.clipboard.writeText(number)
    .then(() => showToast("تم نسخ رقم المحفظة ✅", "ok"))
    .catch(() => showToast(number, "ok")); // fallback: يعرض الرقم في الرسالة لو النسخ التلقائي مش متاح
}

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
      if (link.dataset.tab === "active") {
        driverTrackedRenderKey = null; // نجبر إعادة بناء الخريطة من الصفر دلوقتي والتاب ظاهر فعلاً
        loadActiveTrip();
        // تحديث فوري لمقاس الخريطة لحظة ما التاب يظهر (بالإضافة للتحديث التلقائي جوه renderDriverTrackMap)
        setTimeout(() => { if (driverTrackMap) driverTrackMap.invalidateSize(); }, 150);
      }
      if (link.dataset.tab === "history") loadHistory();
    });
  });

  document.getElementById("onlineToggle").addEventListener("click", toggleOnline);

  loadWalletNumber();
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
  const debtAmount = Number(app.debt_balance) || 0;
  document.getElementById("statDebt").textContent = `${app.debt_balance} ج`;

  if (isBlockedForDebt) {
    document.getElementById("debtAmount").textContent = app.debt_balance;
    document.getElementById("debtLimitAmount").textContent = app.debt_limit;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  // صندوق سداد المديونية دايماً ظاهر لو فيه أي مبلغ مستحق، حتى لو لسه ما وصلتش للحد المسموح
  const settleBox = document.getElementById("settleDebtBox");
  if (settleBox) {
    if (debtAmount > 0 && !isBlockedForDebt) {
      document.getElementById("settleDebtAmount").textContent = app.debt_balance;
      settleBox.classList.remove("hidden");
    } else {
      settleBox.classList.add("hidden");
    }
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
    const active = trips.find((t) => t.status === "accepted" || t.status === "ongoing");

    if (!active) {
      currentActiveTripId = null;
      driverTrackedRenderKey = null;
      stopLocationPush();
      hideDriverTrackMap();
      if (wrap) wrap.innerHTML = '<div class="empty-state"><div class="ic">🚗</div>لا توجد رحلة نشطة حالياً</div>';
      return;
    }

    if (active.id !== currentActiveTripId) {
      currentActiveTripId = active.id;
      startLocationPush(active.id);
    }

    if (wrap) {
      const key = `${active.id}:${active.status}`;

      if (key !== driverTrackedRenderKey || !document.getElementById("driverTrackMap")) {
        driverTrackedRenderKey = key;
        const heading = active.status === "accepted";
        wrap.innerHTML = `
          <div class="active-trip-box">
            <div class="field-row"><span>👤 العميل</span><b id="drpCustomerName">${active.customer_name || "-"}</b></div>
            <div class="field-row"><span>📍 من</span><b>${active.pickup_address}</b></div>
            <div class="field-row"><span>🏁 إلى</span><b>${active.dropoff_address}</b></div>
            <div class="field-row"><span>📏 المسافة</span><b>${active.distance_km} كم${active.estimated_duration_min ? ` · ${active.estimated_duration_min} دقيقة` : ""}</b></div>
            <div class="field-row"><span>💳 الدفع</span><b>${active.payment_method_display}</b></div>
            <div class="field-row"><span>💰 أرباحك</span><b id="drpDriverProfit" style="color:var(--green-dark);">${active.driver_profit} ج</b></div>
            <div class="field-row"><span>💵 السعر الإجمالي</span><b id="drpTotalPrice">${active.total_price} ج</b></div>
            <div id="driverTrackMap"></div>
            <div class="live-track-info" id="driverTrackInfo"></div>
            <p style="font-size:.85rem;color:var(--gray-500);margin:1rem 0;">📡 يتم إرسال موقعك تلقائياً للعميل كل بضع ثوانٍ طوال مدة الرحلة.</p>
            <div id="drpActionBtn">${heading
              ? `<button class="btn btn-primary btn-block btn-lg" onclick="startTrip(${active.id})">📍 وصلت واستلمت العميل</button>`
              : `<button class="btn btn-primary btn-block btn-lg" onclick="completeTrip(${active.id})">✅ إنهاء الرحلة</button>`}</div>
          </div>
        `;
      } else {
        updateActiveTripFields(active);
      }

      // بتتنادى دايماً — الدالة نفسها بتتأكد لو محتاجة تبني الخريطة من جديد ولا بس تحدّث المواقع،
      // فمفيش أي اعتماد على توقيت التاب أو أي حالة سباق تاني.
      renderDriverTrackMap(active);
    }
  } catch (err) {
    if (!silent && wrap) wrap.innerHTML = `<p style="color:var(--red);text-align:center;">${err.message}</p>`;
  }
}

let driverTrackedRenderKey = null; // `${tripId}:${status}` — نبني نصوص الكارت من الصفر مرة واحدة بس، وبعدين نحدّث بس

function updateActiveTripFields(trip) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText("drpCustomerName", trip.customer_name || "-");
  setText("drpDriverProfit", `${trip.driver_profit} ج`);
  setText("drpTotalPrice", `${trip.total_price} ج`);
}

// ---------- خريطة تتبع حية للكابتن: تعرض نقطة العميل الدقيقة (أو الوجهة بعد الاستلام) وموقع الكابتن الحالي ----------
// الدالة دي "self-healing": بتتأكد بنفسها إن الحاوية (div) اللي الخريطة متربطة بيها لسه موجودة فعلاً
// في الصفحة وظاهرة، ولو لأ (اتبنت من جديد أو كانت مخفية وقت الإنشاء) بتبني خريطة جديدة تلقائياً
// من غير ما تعتمد على أي توقيت أو تخمين لحالة التاب.
let driverTrackMap, driverTrackTargetMarker, driverTrackSelfMarker, driverTrackRouteLayer;
let lastKnownDriverPos = null;

function hideDriverTrackMap() {
  if (driverTrackMap) {
    driverTrackMap.remove();
    driverTrackMap = null;
    driverTrackTargetMarker = null;
    driverTrackSelfMarker = null;
    driverTrackRouteLayer = null;
  }
}

function renderDriverTrackMap(trip) {
  const heading = trip.status === "accepted";
  const target = heading ? [trip.pickup_lat, trip.pickup_lng] : [trip.dropoff_lat, trip.dropoff_lng];
  if (target[0] == null || target[1] == null) return;

  const container = document.getElementById("driverTrackMap");
  if (!container) return; // الكارت مش ظاهر أصلاً دلوقتي

  // لو عندنا خريطة قديمة لكن مربوطة بعنصر DOM اتشال من الصفحة (تم استبداله بكارت جديد) — نتخلص منها ونبني من الصفر
  if (driverTrackMap && driverTrackMap.getContainer() !== container) {
    hideDriverTrackMap();
  }

  // ملحوظة مهمة (كانت سبب المشكلة): كنا قبل كده منمنعش إنشاء الخريطة إلا لو الحاوية ظاهرة فعلاً
  // (offsetParent !== null) وقت النداء. المشكلة إن تبويب "الرحلة الحالية" مش هو التبويب الافتراضي
  // (المفروض يكون "الرئيسية")، وبما إن heartbeat() بينادي loadActiveTrip كل 8 ثواني بغض النظر
  // عن أي تبويب مفتوح، أول مرة بتتنادى فيها الدالة دي غالباً بتكون والتبويب لسه مخفي، فالخريطة
  // ما كانتش بتتعمل خالص، وبعدين الكود كان بيفتكر إنه "خلص" وميحاولش تاني إلا لو المستخدم داس
  // على التبويب بنفسه. الحل: نعمل الخريطة دايماً بمجرد ما الحاوية (div) موجودة، حتى لو كانت
  // مخفية دلوقتي — Leaflet بيدعم ده — وبعدين invalidateSize() (اللي إحنا أصلاً بننادها) هي اللي
  // هتظبط المقاس صح أول ما التبويب يظهر.
  if (!driverTrackMap) {
    driverTrackMap = L.map(container);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(driverTrackMap);
  }
  setTimeout(() => driverTrackMap && driverTrackMap.invalidateSize(), 100);
  setTimeout(() => driverTrackMap && driverTrackMap.invalidateSize(), 500);

  if (driverTrackTargetMarker) driverTrackMap.removeLayer(driverTrackTargetMarker);
  driverTrackTargetMarker = L.marker(target, {
    title: heading ? "موقع العميل" : "الوجهة",
    icon: L.divIcon({
      className: "",
      html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${heading ? "#E53935" : "#17A896"};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;"><span style="transform:rotate(45deg);font-size:14px;">${heading ? "📍" : "🏁"}</span></div>`,
      iconSize: [30, 30], iconAnchor: [15, 30],
    }),
  }).addTo(driverTrackMap).bindPopup(heading ? "موقع العميل الدقيق" : "الوجهة");

  const bounds = [target];
  if (lastKnownDriverPos) {
    bounds.push(lastKnownDriverPos);
    if (driverTrackSelfMarker) {
      driverTrackSelfMarker.setLatLng(lastKnownDriverPos);
    } else {
      driverTrackSelfMarker = L.marker(lastKnownDriverPos, {
        title: "موقعك",
        icon: L.divIcon({
          className: "",
          html: '<div style="width:34px;height:34px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff;"><span class="gicon filled" style="color:#fff;font-size:18px;">directions_car</span></div>',
          iconSize: [34, 34],
        }),
      }).addTo(driverTrackMap);
    }
    updateDriverTrackRoute(lastKnownDriverPos, target, heading);
  }
  driverTrackMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
}

async function updateDriverTrackRoute(from, to, heading) {
  const infoEl = document.getElementById("driverTrackInfo");
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || !data.routes.length) return;
    const route = data.routes[0];
    const km = (route.distance / 1000).toFixed(1);
    const min = Math.max(1, Math.round(route.duration / 60));

    if (infoEl) {
      infoEl.innerHTML = `
        <div class="live-track-row"><span>${heading ? "📍" : "🏁"}</span><b>${heading ? "العميل" : "الوجهة"}</b><span class="mono">${to[0].toFixed(5)}, ${to[1].toFixed(5)}</span></div>
        <div class="live-track-row"><span>🚗</span><b>موقعك</b><span class="mono">${from[0].toFixed(5)}, ${from[1].toFixed(5)}</span></div>
        <div class="live-track-row"><span>📏</span><b>المسافة</b><span>${km} كم</span></div>
        <div class="live-track-row"><span>⏱️</span><b>الوقت المتوقع</b><span>${min} دقيقة تقريباً</span></div>
      `;
    }

    if (driverTrackRouteLayer) driverTrackMap.removeLayer(driverTrackRouteLayer);
    driverTrackRouteLayer = L.geoJSON(route.geometry, { style: { color: heading ? "#E53935" : "#17A896", weight: 5, opacity: .85 } }).addTo(driverTrackMap);
  } catch (e) { /* silent */ }
}

async function startTrip(tripId) {
  try {
    await apiRequest(`/api/trips/${tripId}/start/`, { method: "POST" });
    showToast("تم تسجيل استلام العميل، بالتوفيق في الرحلة!", "ok");
    loadActiveTrip();
  } catch (err) {
    showToast(err.message, "err");
  }
}

function round6(n) { return Number(Number(n).toFixed(6)); }

function startLocationPush(tripId) {
  stopLocationPush();
  if (!navigator.geolocation) return;

  const pushOnce = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = round6(pos.coords.latitude), lng = round6(pos.coords.longitude);
        lastKnownDriverPos = [lat, lng];
        apiRequest(`/api/trips/${tripId}/location/`, {
          method: "POST",
          body: { lat, lng },
        }).catch(() => {});
        if (currentActiveTripId === tripId) {
          const wrap = document.getElementById("activeTripCard");
          if (wrap && wrap.querySelector("#driverTrackMap")) {
            apiRequest(`/api/trips/${tripId}/`).then((t) => renderDriverTrackMap(t)).catch(() => {});
          }
        }
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
    const trip = await apiRequest(`/api/trips/${tripId}/complete/`, { method: "POST" });
    if (trip.payment_method === "cash") {
      // كان بيظهر توست بيختفي بعد 3.5 ثانية بس، مش وقت كافي إن الكابتن يقرا الرقم وينسخه.
      // دلوقتي بيظهر مودال ثابت فيه المبلغ والرقم وزرار نسخ، ومش بيقفل غير لما الكابتن يضغط "تمام".
      showCommissionDueModal(trip.platform_cost, platformWalletNumber);
    } else {
      showToast("تم إنهاء الرحلة بنجاح، تم تحديث حسابك", "ok");
    }
    stopLocationPush();
    currentActiveTripId = null;
    loadStats();
    loadActiveTrip();
    checkApplicationStatus();
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- مودال ثابت لتذكير الكابتن بتحويل عمولة المنصة بعد إنهاء رحلة كاش ----------
function showCommissionDueModal(amount, walletNumber) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box" style="text-align:center;">
      <div style="font-size:3.5rem;margin-bottom:1rem;">💰</div>
      <h2 style="margin-bottom:.5rem;">تم إنهاء الرحلة ✅</h2>
      <p style="color:var(--gray-600);margin-bottom:1.25rem;">
        عليك تحويل عمولة المنصة <b>${amount} ج</b> على رقم محفظة ميزة:
      </p>
      <div style="display:flex;align-items:center;justify-content:center;gap:.6rem;background:#F4EEE4;border:1.5px solid rgba(20,15,8,.1);border-radius:.85rem;padding:.75rem 1rem;margin-bottom:1.75rem;">
        <b id="commissionWalletNumber" style="font-size:1.15rem;letter-spacing:.5px;">${walletNumber || "—"}</b>
        ${walletNumber ? `<button type="button" class="btn btn-outline btn-sm" onclick="copyWalletNumber('commissionWalletNumber')">نسخ</button>` : ""}
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="commissionModalBtn">تمام</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("commissionModalBtn").addEventListener("click", () => overlay.remove());
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
