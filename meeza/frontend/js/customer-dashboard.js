// ============================================================
// منطق لوحة تحكم العميل — طلب رحلة بالخريطة (OpenStreetMap) + تتبع حي + دفع
// ============================================================

let selectedService = "car";
let lastEstimate = null;

let map, pickupMarker, dropoffMarker, routeLayer;
let pickupCoords = null, dropoffCoords = null;
let routeDistanceKm = null, routeDurationMin = null;

let activeTripId = null;
let activeOrderPollTimer = null;
let orderCreatedAt = null;

let trackingMap, trackingDriverMarker, trackingRouteLayer;

const ACTIVE_TRIP_KEY = "meeza_active_trip_id";
const PRICE_INCREASE_DELAY_SEC = 45; // بعد كام ثانية من عدم القبول نعرض زر زيادة السعر

// إصلاح مسارات أيقونات Leaflet الافتراضية (مطلوب عند التحميل من CDN)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

document.addEventListener("DOMContentLoaded", () => {
  Auth.requireLogin();
  const user = Auth.getUser();
  if (!user || user.user_type !== "customer") {
    Auth.logout();
    return;
  }

  document.getElementById("welcomeMsg").textContent = `أهلاً بيك ${user.full_name || ""} 👋`;
  document.getElementById("avatarInitial").textContent = (user.full_name || "ع").charAt(0);

  // ---------- تبويبات القائمة الجانبية ----------
  document.querySelectorAll(".sidebar nav a").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".sidebar nav a").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll("main section").forEach((s) => s.classList.add("hidden"));
      document.getElementById(`tab-${link.dataset.tab}`).classList.remove("hidden");
      if (link.dataset.tab === "trips") loadTrips();
      if (link.dataset.tab === "profile") loadProfile();
      if (link.dataset.tab === "order" && map) setTimeout(() => map.invalidateSize(), 200);
    });
  });

  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebar").classList.toggle("collapsed");
  });
  document.getElementById("logoutBtn").addEventListener("click", () => Auth.logout());

  // ---------- الأفاتار جنب الجرس: يفتح الملف الشخصي عند الضغط ----------
  document.getElementById("avatarInitial").addEventListener("click", () => {
    document.querySelector('.sidebar nav a[data-tab="profile"]').click();
  });

  // ---------- اختيار نوع الخدمة ----------
  document.querySelectorAll("#serviceTypeTabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#serviceTypeTabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedService = btn.dataset.service;
      if (routeDistanceKm) updatePriceEstimate();
    });
  });

  // ---------- طريقة الدفع ----------
  document.querySelectorAll('input[name="paymentMethod"]').forEach((r) => {
    r.addEventListener("change", updateWalletInfo);
  });
  loadWalletNumber();

  document.getElementById("tripForm").addEventListener("submit", requestTrip);
  document.getElementById("useCurrentLocationBtn").addEventListener("click", useCurrentLocation);

  initMap();
  initAddressSearch("pickup", "pickupSuggestions", (latlng, label) => setPickup(latlng, label));
  initAddressSearch("dropoff", "dropoffSuggestions", (latlng, label) => setDropoff(latlng, label));

  resumeActiveOrderIfAny();
});

// ============================================================
// الخريطة (مرحلة 3)
// ============================================================
function initMap() {
  map = L.map("orderMap").setView([29.3084, 30.8428], 12); // الفيوم كنقطة انطلاق افتراضية
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
}

function setPickup(latlng, label) {
  pickupCoords = latlng;
  document.getElementById("pickup").value = label;
  document.getElementById("pickupSuggestions").innerHTML = "";
  if (pickupMarker) {
    pickupMarker.setLatLng(latlng);
  } else {
    pickupMarker = L.marker(latlng, { draggable: true, title: "نقطة الانطلاق" }).addTo(map);
    pickupMarker.on("dragend", async () => {
      const p = pickupMarker.getLatLng();
      pickupCoords = { lat: p.lat, lng: p.lng };
      document.getElementById("pickup").value = await reverseGeocode(p.lat, p.lng);
      recalcRoute();
    });
  }
  map.setView(latlng, 14);
  recalcRoute();
}

function setDropoff(latlng, label) {
  dropoffCoords = latlng;
  document.getElementById("dropoff").value = label;
  document.getElementById("dropoffSuggestions").innerHTML = "";
  if (dropoffMarker) {
    dropoffMarker.setLatLng(latlng);
  } else {
    dropoffMarker = L.marker(latlng, { draggable: true, title: "نقطة الوصول" }).addTo(map);
    dropoffMarker.on("dragend", async () => {
      const p = dropoffMarker.getLatLng();
      dropoffCoords = { lat: p.lat, lng: p.lng };
      document.getElementById("dropoff").value = await reverseGeocode(p.lat, p.lng);
      recalcRoute();
    });
  }
  recalcRoute();
}

function useCurrentLocation() {
  if (!navigator.geolocation) return showToast("متصفحك لا يدعم تحديد الموقع", "err");
  showToast("جارٍ تحديد موقعك...", "ok");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const label = await reverseGeocode(latlng.lat, latlng.lng);
      setPickup(latlng, label);
    },
    () => showToast("تعذر الوصول لموقعك، تأكد من إذن الموقع بالمتصفح", "err"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ---------- البحث عن عنوان (Nominatim / OpenStreetMap) ----------
function initAddressSearch(inputId, suggestionsId, onSelect) {
  const input = document.getElementById(inputId);
  const box = document.getElementById(suggestionsId);
  let debounceTimer = null;
  let confirmedValue = ""; // آخر عنوان تم تأكيده فعلياً (بإحداثيات)
  let searching = false;

  // تأكيد العنوان المكتوب حتى لو المستخدم متضغطش على اقتراح من القائمة
  async function confirmTypedAddress() {
    const query = input.value.trim();
    if (!query || query === confirmedValue || searching) return;
    searching = true;
    try {
      const results = await geocodeSearch(query);
      if (results.length) {
        onSelect({ lat: +results[0].lat, lng: +results[0].lon }, results[0].display_name);
        confirmedValue = results[0].display_name;
      } else {
        showToast(`تعذر العثور على "${query}" على الخريطة، جرب تكتب العنوان بتفاصيل أكتر`, "err");
      }
    } catch (e) {
      showToast("تعذر البحث عن العنوان، تأكد من اتصالك بالإنترنت", "err");
    } finally {
      searching = false;
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 3) { box.innerHTML = ""; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await geocodeSearch(query);
        box.innerHTML = results.map((r, i) =>
          `<div class="suggestion-item" data-i="${i}"><span class="gicon">location_on</span>${r.display_name}</div>`
        ).join("");
        box.querySelectorAll(".suggestion-item").forEach((el, i) => {
          // mousedown (مش click) عشان يشتغل قبل ما الحقل يفقد التركيز (blur)
          el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            onSelect({ lat: +results[i].lat, lng: +results[i].lon }, results[i].display_name);
            confirmedValue = results[i].display_name;
            box.innerHTML = "";
          });
        });
      } catch (e) { /* silent */ }
    }, 500);
  });

  // لو المستخدم دوس Enter بعد ما كتب العنوان، بنأكده فوراً
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(debounceTimer);
      confirmTypedAddress();
      box.innerHTML = "";
    }
  });

  // لو المستخدم كتب عنوان وخرج من الحقل من غير ما يختار من القائمة، بنأكده تلقائياً
  input.addEventListener("blur", () => {
    setTimeout(() => {
      confirmTypedAddress();
      box.innerHTML = "";
    }, 200); // تأخير بسيط عشان نضمن إن اختيار الاقتراح (mousedown) يتنفذ الأول لو المستخدم داس عليه
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !box.contains(e.target)) box.innerHTML = "";
  });
}

async function geocodeSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&countrycodes=eg&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch (e) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// ---------- حساب المسار عبر OSRM (مسافة + وقت) ----------
async function recalcRoute() {
  if (!pickupCoords || !dropoffCoords) return;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lng},${pickupCoords.lat};${dropoffCoords.lng},${dropoffCoords.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error("تعذر حساب المسار");

    const route = data.routes[0];
    routeDistanceKm = +(route.distance / 1000).toFixed(2);
    routeDurationMin = Math.max(1, Math.round(route.duration / 60));

    document.getElementById("routeInfo").style.display = "flex";
    document.getElementById("routeDistance").textContent = routeDistanceKm;
    document.getElementById("routeDuration").textContent = routeDurationMin;

    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(route.geometry, { style: { color: "#0F5A7E", weight: 5, opacity: .85 } }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });

    updatePriceEstimate();
  } catch (err) {
    showToast("تعذر حساب المسافة والوقت، حاول تحديد العنوان مرة أخرى", "err");
  }
}

async function updatePriceEstimate() {
  if (!routeDistanceKm) return;
  try {
    const data = await apiRequest("/api/pricing/estimate/", {
      method: "POST",
      body: { distance_km: routeDistanceKm, service_type: selectedService },
    });
    lastEstimate = data;
    renderBreakdown(data);
    const btn = document.getElementById("requestTripBtn");
    btn.disabled = false;
    btn.innerHTML = '<span class="gicon">send</span> اطلب الرحلة الآن';
  } catch (err) {
    showToast(err.message, "err");
  }
}

let lastGaugeFrac = 0.28; // نقطة البداية للأنيميشن — بيتحدث بعد كل رسم عشان المؤشر "يرتفع وينزل" بدل ما يقفز فجأة

function priceLevelInfo(totalPrice) {
  // مستويات تقريبية للسعر — مفيش رقم سري هنا، مجرد إحساس بصري للعميل بمدى السعر
  if (totalPrice <= 60) {
    return { key: "low", frac: 0.30, label: "سعر اقتصادي", chip: "سعر منخفض 👍", icon: "trending_down" };
  }
  if (totalPrice <= 150) {
    const t = (totalPrice - 60) / 90; // 0 → 1 داخل النطاق المتوسط
    return { key: "mid", frac: 0.42 + t * 0.28, label: "سعر عادل", chip: "سعر ثابت", icon: "check_circle" };
  }
  const t = Math.min(1, (totalPrice - 150) / 250);
  return { key: "high", frac: 0.72 + t * 0.24, label: "سعر مرتفع نسبياً", chip: "مسافة طويلة", icon: "trending_up" };
}

function renderBreakdown(data) {
  // ملحوظة: العميل بيشوف السعر النهائي بس. تفاصيل توزيع السعر (وقود/صيانة/عمولة)
  // بيانات داخلية خاصة بالمنصة ومش بترجع أصلاً من السيرفر لحساب العميل.
  const km = routeDistanceKm ?? data.distance_km;
  const r = 80, c = 2 * Math.PI * r;
  const level = priceLevelInfo(Number(data.total_price));
  const startDash = `${(c * lastGaugeFrac).toFixed(1)} ${c.toFixed(1)}`;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30;
    return `<line x1="100" y1="14" x2="100" y2="24" transform="rotate(${angle} 100 100)"/>`;
  }).join("");

  document.getElementById("priceBreakdown").innerHTML = `
    <div class="price-hero level-${level.key}">
      <div class="price-hero-top">
        <span class="price-hero-label">السعر التقديري للرحلة</span>
        <span class="price-hero-chip"><span class="gicon">${level.icon}</span> ${level.chip}</span>
      </div>
      <div class="price-gauge">
        <svg class="gauge-ring" viewBox="0 0 200 200">
          <circle class="gauge-track" cx="100" cy="100" r="${r}"></circle>
          <circle class="gauge-fill" id="gaugeFillCircle" cx="100" cy="100" r="${r}" stroke-dasharray="${startDash}"></circle>
          <g class="gauge-ticks">${ticks}</g>
        </svg>
        <div class="gauge-center">
          <span class="gauge-amount">${data.total_price}</span>
          <span class="gauge-currency">جنيه مصري</span>
          <span class="gauge-level-label"><span class="gicon" style="font-size:1rem;">${level.icon}</span> ${level.label}</span>
        </div>
      </div>
      <div class="price-chips">
        <span class="price-chip"><span class="gicon">route</span> ${km ?? "-"} كم</span>
        <span class="price-chip amber"><span class="gicon">bolt</span> شامل كل حاجة</span>
      </div>
      <ul class="price-notes">
        <li><span class="gicon filled">check_circle</span> مفيش رسوم إضافية أو مفاجآت وقت الوصول</li>
        <li><span class="gicon filled">check_circle</span> السعر بيتحدد تلقائياً حسب المسافة ونوع الخدمة</li>
      </ul>
    </div>
  `;

  // أنيميشن ارتفاع/نزول المؤشر: نبدأ من آخر قيمة ونتحرك للقيمة الجديدة بعد الرسم بلحظة
  const fillEl = document.getElementById("gaugeFillCircle");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (fillEl) fillEl.setAttribute("stroke-dasharray", `${(c * level.frac).toFixed(1)} ${c.toFixed(1)}`);
    });
  });
  lastGaugeFrac = level.frac;
}

// ---------- الدفع الإلكتروني: عرض رقم محفظة المنصة ----------
let platformWalletNumber = "";
async function loadWalletNumber() {
  try {
    const data = await apiRequest("/api/pricing/current/", { noAuth: true });
    platformWalletNumber = data.platform_wallet_number || "";
  } catch (e) { /* silent */ }
}
function updateWalletInfo() {
  const method = document.querySelector('input[name="paymentMethod"]:checked').value;
  const box = document.getElementById("walletInfo");
  if (method === "wallet") {
    box.classList.remove("hidden");
    box.innerHTML = platformWalletNumber
      ? `حوّل قيمة الرحلة على محفظة ميزة رقم <b>${platformWalletNumber}</b>، وبعد انتهاء الرحلة ارفع صورة إثبات التحويل.`
      : `هيتم عرض رقم محفظة ميزة بعد إنشاء الطلب. بعد انتهاء الرحلة ارفع صورة إثبات التحويل.`;
  } else {
    box.classList.add("hidden");
  }
}

// ============================================================
// إنشاء الطلب (مرحلة 3 + 4)
// ============================================================
function round6(n) { return Number(Number(n).toFixed(6)); }

async function requestTrip(e) {
  e.preventDefault();
  if (!lastEstimate || !pickupCoords || !dropoffCoords) {
    return showToast("حدد نقطة الانطلاق والوصول أولاً", "err");
  }
  const btn = document.getElementById("requestTripBtn");
  btn.disabled = true; btn.innerHTML = '<span class="loader"></span>';

  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

  try {
    const trip = await apiRequest("/api/trips/", {
      method: "POST",
      body: {
        service_type: selectedService,
        pickup_address: document.getElementById("pickup").value,
        dropoff_address: document.getElementById("dropoff").value,
        distance_km: routeDistanceKm,
        estimated_duration_min: routeDurationMin,
        pickup_lat: round6(pickupCoords.lat), pickup_lng: round6(pickupCoords.lng),
        dropoff_lat: round6(dropoffCoords.lat), dropoff_lng: round6(dropoffCoords.lng),
        notes: document.getElementById("notes").value,
        payment_method: paymentMethod,
      },
    });
    showToast("تم إرسال طلب الرحلة، جارٍ البحث عن كابتن...", "ok");
    startOrderTracking(trip.id);
  } catch (err) {
    showToast(err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="gicon">send</span> اطلب الرحلة الآن';
  }
}

// ============================================================
// متابعة الطلب الحالي (مراحل 5 + 6 + 7 + 8)
// ============================================================
function resumeActiveOrderIfAny() {
  const savedId = localStorage.getItem(ACTIVE_TRIP_KEY);
  if (savedId) startOrderTracking(+savedId, true);
}

function startOrderTracking(tripId, resuming = false) {
  activeTripId = tripId;
  localStorage.setItem(ACTIVE_TRIP_KEY, tripId);
  if (!resuming) orderCreatedAt = Date.now();

  document.getElementById("orderFormWrap").classList.add("hidden");
  document.getElementById("activeOrderWrap").classList.remove("hidden");

  pollActiveOrder();
  clearInterval(activeOrderPollTimer);
  activeOrderPollTimer = setInterval(pollActiveOrder, 5000);
}

function stopOrderTracking() {
  clearInterval(activeOrderPollTimer);
  activeOrderPollTimer = null;
  activeTripId = null;
  localStorage.removeItem(ACTIVE_TRIP_KEY);
}

async function pollActiveOrder() {
  if (!activeTripId) return;
  try {
    const trip = await apiRequest(`/api/trips/${activeTripId}/`);
    if (!orderCreatedAt) orderCreatedAt = new Date(trip.created_at).getTime();
    renderActiveOrder(trip);
  } catch (err) {
    // الرحلة اتلغت أو مش موجودة
    stopOrderTracking();
    resetOrderForm();
  }
}

let trackedRenderKey = null; // `${tripId}:${status}` — نعرف بيه لو محتاجين نبني الكارت من الصفر ولا بس نحدّث البيانات

function updateAcceptedCardFields(trip) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText("accCaptainName", trip.driver_name || "-");
  setText("accCaptainPhone", trip.driver_phone || "-");
  setText("accCaptainVehicle", trip.driver_vehicle_type_display || "-");
  setText("accTotalPrice", `${trip.total_price} ج`);

  const chip = document.querySelector("#activeOrderCard .tracking-status-chip");
  if (chip) {
    const heading = trip.status === "accepted";
    chip.innerHTML = `<span class="gicon">${heading ? "directions_car" : "moving"}</span> ${heading ? "الكابتن في الطريق إليك" : "جارٍ تنفيذ الرحلة نحو وجهتك"}`;
  }
}

function renderActiveOrder(trip) {
  const card = document.getElementById("activeOrderCard");
  const key = `${trip.id}:${trip.status}`;

  if (trip.status === "accepted" || trip.status === "ongoing") {
    // لو نفس الرحلة ونفس المرحلة وبالفعل عندنا خريطة شغالة — منلمسش الـ DOM بتاعها خالص،
    // بس نحدّث النصوص وموقع الكابتن. لمس innerHTML هنا كان بيهد الخريطة كل 5 ثواني ويسيبها فاضية للأبد.
    if (key === trackedRenderKey && document.getElementById("trackingMap")) {
      updateAcceptedCardFields(trip);
      renderTrackingMap(trip);
      return;
    }
    trackedRenderKey = key;
    hideTrackingMap();
    const heading = trip.status === "accepted";
    card.innerHTML = `
      <span class="tracking-status-chip accepted">
        <span class="gicon">${heading ? "directions_car" : "moving"}</span>
        ${heading ? "الكابتن في الطريق إليك" : "جارٍ تنفيذ الرحلة نحو وجهتك"}
      </span>
      <div style="margin-top:1rem;">
        <div class="field-row"><span>الكابتن</span><b id="accCaptainName">${trip.driver_name || "-"}</b></div>
        <div class="field-row"><span>الهاتف</span><b id="accCaptainPhone">${trip.driver_phone || "-"}</b></div>
        <div class="field-row"><span>المركبة</span><b id="accCaptainVehicle">${trip.driver_vehicle_type_display || "-"}</b></div>
        <div class="field-row"><span>السعر</span><b id="accTotalPrice">${trip.total_price} ج</b></div>
      </div>
      <div id="trackingMap"></div>
      <div class="live-track-info" id="liveTrackInfo"></div>
    `;
    renderTrackingMap(trip);
    return;
  }

  if (trackedRenderKey !== null) {
    trackedRenderKey = null;
    hideTrackingMap();
  }

  if (trip.status === "pending") {
    const bonus = Number(trip.bonus_amount || 0);
    card.innerHTML = `
      <span class="tracking-status-chip waiting"><span class="gicon">hourglass_top</span> بانتظار قبول كابتن</span>
      <div style="margin-top:1rem;">
        <div class="field-row"><span>من</span><b>${trip.pickup_address}</b></div>
        <div class="field-row"><span>إلى</span><b>${trip.dropoff_address}</b></div>
        <div class="field-row"><span>المسافة</span><b>${trip.distance_km} كم${trip.estimated_duration_min ? ` · ${trip.estimated_duration_min} دقيقة` : ""}</b></div>
        <div class="field-row"><span>السعر الحالي</span><b id="activeOrderTotalPrice">${trip.total_price} ج</b></div>
      </div>

      <div class="price-stepper-box">
        <p><span class="gicon">bolt</span> عايز توصلك ريحة كابتن أسرع؟ زوّد أو قلّل السعر فوراً بجنيه واحد في كل ضغطة</p>
        <div class="price-stepper">
          <button type="button" class="stepper-btn minus" id="stepperMinusBtn" onclick="adjustPrice(-1)" ${bonus <= 0 ? "disabled" : ""}>
            <span class="gicon">remove</span>
          </button>
          <div class="stepper-amount">
            <b id="stepperBonusAmount">${bonus.toFixed(0)}</b>
            <span>ج بونص فوق السعر الأساسي</span>
          </div>
          <button type="button" class="stepper-btn plus" id="stepperPlusBtn" onclick="adjustPrice(1)">
            <span class="gicon">add</span>
          </button>
        </div>
      </div>

      <div class="captains-live-box" id="captainsLiveBox">
        <div class="captains-loading"><span class="loader"></span> جارٍ البحث عن كباتن متصلين قريب منك...</div>
      </div>

      <button class="locate-chip" style="width:100%;justify-content:center;margin-top:1.1rem;" onclick="cancelTracking()"><span class="gicon">visibility_off</span> إخفاء المتابعة (الطلب لسه شغال في الخلفية)</button>
    `;
    hideTrackingMap();
    loadAvailableCaptains(trip.id);
    return;
  }

  if (trip.status === "completed") {
    let paymentBox = "";
    if (trip.payment_method === "wallet") {
      if (trip.payment_status === "confirmed") {
        paymentBox = `<div class="wallet-proof-box"><p><span class="gicon filled">check_circle</span> تم تأكيد استلام الدفع من الإدارة.</p></div>`;
      } else if (trip.payment_status === "proof_uploaded") {
        paymentBox = `<div class="wallet-proof-box"><p><span class="gicon">upload_file</span> تم رفع إثبات التحويل، بانتظار مراجعة الإدارة.</p></div>`;
      } else {
        paymentBox = `
          <div class="wallet-proof-box">
            <p><span class="gicon">account_balance_wallet</span> حوّل قيمة الرحلة (${trip.total_price} ج) على محفظة ميزة${platformWalletNumber ? ` رقم <b>${platformWalletNumber}</b>` : ""}، وارفع صورة إثبات التحويل هنا:</p>
            <input type="file" id="proofFile" accept="image/*" style="margin-bottom:.75rem;">
            <button class="order-submit-btn" onclick="uploadProof(${trip.id})"><span class="gicon">upload</span> رفع الإثبات</button>
          </div>
        `;
      }
    }
    card.innerHTML = `
      <span class="tracking-status-chip completed"><span class="gicon filled">task_alt</span> اكتملت الرحلة</span>
      <div style="margin-top:1rem;">
        <div class="field-row"><span>من</span><b>${trip.pickup_address}</b></div>
        <div class="field-row"><span>إلى</span><b>${trip.dropoff_address}</b></div>
        <div class="field-row"><span>السعر النهائي</span><b>${trip.total_price} ج</b></div>
        <div class="field-row"><span>طريقة الدفع</span><b>${trip.payment_method_display}</b></div>
      </div>
      ${paymentBox}
      <button class="order-submit-btn" style="margin-top:1.1rem;" onclick="finishTracking()"><span class="gicon">add_circle</span> طلب رحلة جديدة</button>
    `;
    stopOrderTracking();
    hideTrackingMap();
    return;
  }

  // ملغاة
  card.innerHTML = `
    <span class="tracking-status-chip cancelled"><span class="gicon">cancel</span> تم إلغاء الرحلة</span>
    <button class="order-submit-btn" style="margin-top:1.1rem;" onclick="finishTracking()"><span class="gicon">add_circle</span> طلب رحلة جديدة</button>
  `;
  stopOrderTracking();
  hideTrackingMap();
}

async function increasePrice(amount) {
  try {
    await apiRequest(`/api/trips/${activeTripId}/increase-price/`, {
      method: "POST",
      body: { extra_amount: amount },
    });
    showToast(`تم رفع السعر ${amount} ج، هيوصل الطلب لكل الكباتن من جديد`, "ok");
    orderCreatedAt = Date.now(); // reset timer so the bump box hides again briefly
    pollActiveOrder();
  } catch (err) {
    showToast(err.message, "err");
  }
}

// ---------- زر +/- الفوري لتعديل السعر بجنيه واحد (بدون أي تأخير أو انتظار) ----------
let priceStepperBusy = false;
async function adjustPrice(delta) {
  if (!activeTripId || priceStepperBusy) return;
  priceStepperBusy = true;

  const minusBtn = document.getElementById("stepperMinusBtn");
  const plusBtn = document.getElementById("stepperPlusBtn");
  if (minusBtn) minusBtn.disabled = true;
  if (plusBtn) plusBtn.disabled = true;

  try {
    const trip = await apiRequest(`/api/trips/${activeTripId}/adjust-price/`, {
      method: "POST",
      body: { delta_amount: delta },
    });
    const bonus = Number(trip.bonus_amount || 0);
    const amountEl = document.getElementById("stepperBonusAmount");
    const totalEl = document.getElementById("activeOrderTotalPrice");
    if (amountEl) amountEl.textContent = bonus.toFixed(0);
    if (totalEl) totalEl.textContent = `${trip.total_price} ج`;
    if (minusBtn) minusBtn.disabled = bonus <= 0;
  } catch (err) {
    showToast(err.message, "err");
  } finally {
    if (plusBtn) plusBtn.disabled = false;
    priceStepperBusy = false;
  }
}

// ---------- الكباتن المتصلين والمتاحين اللي شايفين الطلب دلوقتي ----------
async function loadAvailableCaptains(tripId) {
  const box = document.getElementById("captainsLiveBox");
  if (!box) return;
  try {
    const captains = await apiRequest(`/api/trips/${tripId}/available-captains/`);
    if (!box.isConnected) return; // ممكن العميل يكون غيّر التبويب لحظة وصول الرد
    if (!captains.length) {
      box.innerHTML = `
        <div class="captains-empty">
          <span class="gicon">directions_car</span>
          مفيش كباتن متصلين قريب منك دلوقتي، هيوصلك الطلب لأول كابتن يدخل أونلاين
        </div>`;
      return;
    }
    box.innerHTML = `
      <div class="captains-live-head"><span class="gicon filled">groups</span> ${captains.length} كابتن متصل شايف طلبك دلوقتي</div>
      <div class="captains-live-list">
        ${captains.map((c) => `
          <div class="captain-mini-card">
            <div class="captain-mini-avatar">${(c.full_name || "?").trim().charAt(0)}</div>
            <div class="captain-mini-info">
              <b>${c.full_name || "كابتن"}</b>
              <span>${c.vehicle_type_display || ""}</span>
            </div>
            <span class="captain-mini-dot" title="متصل الآن"></span>
          </div>
        `).join("")}
      </div>`;
  } catch (e) {
    if (box.isConnected) box.innerHTML = "";
  }
}

async function uploadProof(tripId) {
  const fileInput = document.getElementById("proofFile");
  if (!fileInput.files.length) return showToast("اختر صورة إثبات التحويل أولاً", "err");
  const form = new FormData();
  form.append("wallet_proof", fileInput.files[0]);
  try {
    await apiRequest(`/api/trips/${tripId}/upload-payment-proof/`, { method: "POST", body: form, isForm: true });
    showToast("تم رفع الإثبات، بانتظار مراجعة الإدارة", "ok");
    pollActiveOrder();
  } catch (err) {
    showToast(err.message, "err");
  }
}

function cancelTracking() {
  stopOrderTracking();
  resetOrderForm();
}

function finishTracking() {
  stopOrderTracking();
  resetOrderForm();
}

function resetOrderForm() {
  document.getElementById("activeOrderWrap").classList.add("hidden");
  document.getElementById("orderFormWrap").classList.remove("hidden");
  document.getElementById("tripForm").reset();
  lastEstimate = null; routeDistanceKm = null; routeDurationMin = null;
  document.getElementById("routeInfo").style.display = "none";
  document.getElementById("requestTripBtn").disabled = true;
  document.getElementById("requestTripBtn").innerHTML = '<span class="gicon">send</span> حدد النقطتين لعرض السعر';
  document.getElementById("priceBreakdown").innerHTML = `
    <div class="price-empty">
      <div class="price-empty-ic"><span class="gicon">payments</span></div>
      <p>حدد نقطة الانطلاق والوصول عشان يظهر لك السعر تلقائياً</p>
    </div>`;
  setTimeout(() => map && map.invalidateSize(), 200);
}

// ---------- خريطة التتبع الحي: تستهدف موقع العميل الدقيق وقت "الكابتن في الطريق"، وتتحول لموقع الوجهة وقت "جارٍ تنفيذ الرحلة" ----------
let trackingTargetMarker;

function renderTrackingMap(trip) {
  const container = document.getElementById("trackingMap");
  if (!container) return; // الكارت مش ظاهر أصلاً دلوقتي

  // لو عندنا خريطة قديمة متربطة بعنصر DOM اتشال من الصفحة (تم استبداله بكارت جديد) — نتخلص منها ونبني من الصفر
  if (trackingMap && trackingMap.getContainer() !== container) {
    hideTrackingMap();
  }

  const isVisible = container.offsetParent !== null;
  if (!trackingMap) {
    if (!isVisible) return; // متعرفش تعمل خريطة جوه حاوية مخفية — هنحاول تاني أول ما تظهر
    trackingMap = L.map(container);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(trackingMap);
  }
  setTimeout(() => trackingMap && trackingMap.invalidateSize(), 100);
  setTimeout(() => trackingMap && trackingMap.invalidateSize(), 500);

  // الهدف الحالي: موقع العميل الدقيق وهو لسه بينتظر الكابتن، أو موقع الوجهة بمجرد ما الرحلة بدأت فعلياً
  const heading = trip.status === "accepted";
  const target = heading ? [trip.pickup_lat, trip.pickup_lng] : [trip.dropoff_lat, trip.dropoff_lng];
  const targetLabel = heading ? "موقعك الحالي (نقطة الالتقاء)" : "الوجهة";
  const targetEmoji = heading ? "📍" : "🏁";
  const bounds = [target];

  if (trackingTargetMarker) trackingMap.removeLayer(trackingTargetMarker);
  trackingTargetMarker = L.marker(target, {
    title: targetLabel,
    icon: L.divIcon({
      className: "",
      html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${heading ? "#E53935" : "#17A896"};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;"><span style="transform:rotate(45deg);font-size:14px;">${targetEmoji}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
    }),
  }).addTo(trackingMap).bindPopup(targetLabel);

  if (trip.driver_lat && trip.driver_lng) {
    const driverPos = [trip.driver_lat, trip.driver_lng];
    bounds.push(driverPos);
    if (trackingDriverMarker) {
      trackingDriverMarker.setLatLng(driverPos);
    } else {
      trackingDriverMarker = L.marker(driverPos, {
        title: "الكابتن",
        icon: L.divIcon({
          className: "",
          html: '<div style="width:34px;height:34px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff;"><span class="gicon filled" style="color:#fff;font-size:18px;">directions_car</span></div>',
          iconSize: [34, 34],
        }),
      }).addTo(trackingMap);
    }
    updateTrackingRoute(driverPos, target, heading, trip);
  }

  trackingMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
}

async function updateTrackingRoute(from, to, heading, trip) {
  const infoEl = document.getElementById("liveTrackInfo");
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || !data.routes.length) return;
    const route = data.routes[0];
    const km = (route.distance / 1000).toFixed(1);
    const min = Math.max(1, Math.round(route.duration / 60));
    const updatedAgo = trip.driver_location_updated_at
      ? Math.max(0, Math.round((Date.now() - new Date(trip.driver_location_updated_at).getTime()) / 1000))
      : null;

    if (infoEl) {
      infoEl.innerHTML = `
        <div class="live-track-row"><span>📍</span><b>${heading ? "موقعك" : "العميل"}</b><span class="mono">${to[0].toFixed(5)}, ${to[1].toFixed(5)}</span></div>
        <div class="live-track-row"><span>🚗</span><b>الكابتن</b><span class="mono">${from[0].toFixed(5)}, ${from[1].toFixed(5)}</span></div>
        <div class="live-track-row"><span>🛣️</span><b>المسار</b><span>مرسوم على الخريطة أعلاه</span></div>
        <div class="live-track-row"><span>📏</span><b>المسافة المتبقية</b><span>${km} كم</span></div>
        <div class="live-track-row"><span>⏱️</span><b>${heading ? "هيوصلك خلال" : "هتوصل خلال"}</b><span>${min} دقيقة تقريباً</span></div>
        ${updatedAgo !== null ? `<p class="live-track-updated">آخر تحديث لموقع الكابتن: من ${updatedAgo} ثانية</p>` : ""}
      `;
    }

    if (trackingRouteLayer) trackingMap.removeLayer(trackingRouteLayer);
    trackingRouteLayer = L.geoJSON(route.geometry, { style: { color: heading ? "#E53935" : "#17A896", weight: 5, opacity: .85 } }).addTo(trackingMap);
  } catch (e) { /* silent */ }
}

function hideTrackingMap() {
  if (trackingMap) {
    trackingMap.remove();
    trackingMap = null;
    trackingDriverMarker = null;
    trackingTargetMarker = null;
    trackingRouteLayer = null;
  }
}

// ============================================================
// سجل الرحلات
// ============================================================
async function loadTrips() {
  const wrap = document.getElementById("tripsList");
  wrap.innerHTML = '<p style="text-align:center;color:var(--gray-500);">جارٍ التحميل...</p>';
  try {
    const trips = await apiRequest("/api/trips/mine/");
    if (!trips.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="ic">📭</div>لا توجد رحلات بعد</div>';
      return;
    }
    wrap.innerHTML = trips.map((t) => `
      <div class="trip-row">
        <div class="trip-route-mini">
          <span class="trip-dot start"></span>
          <span class="trip-dot-line"></span>
          <span class="trip-dot end"></span>
        </div>
        <div class="trip-info">
          <b>${t.pickup_address} ← ${t.dropoff_address}</b>
          <div class="trip-meta">${t.service_type_display} · ${t.distance_km} كم · ${new Date(t.created_at).toLocaleString("ar-EG")}</div>
        </div>
        <div class="trip-side">
          <div class="trip-price">${t.total_price}<span>ج.م</span></div>
          <span class="trip-tag trip-tag-${statusTag(t.status)}">${t.status_display}</span>
          ${(t.status === "pending" || t.status === "accepted" || t.status === "ongoing") ? `<button class="trip-track-btn" onclick="trackFromHistory(${t.id})">تتبع الطلب</button>` : ""}
        </div>
      </div>
    `).join("");
  } catch (err) {
    wrap.innerHTML = `<p style="color:var(--red);text-align:center;">${err.message}</p>`;
  }
}

function trackFromHistory(tripId) {
  document.querySelector('.sidebar nav a[data-tab="order"]').click();
  startOrderTracking(tripId, true);
  orderCreatedAt = Date.now() - (PRICE_INCREASE_DELAY_SEC * 1000); // ما نوريش زر الزيادة فوراً لو لسه بعيد
}

function statusTag(status) {
  if (status === "completed") return "approved";
  if (status === "cancelled" || status === "rejected") return "rejected";
  if (status === "ongoing") return "ongoing";
  return "pending";
}

async function loadProfile() {
  const user = Auth.getUser();
  const initial = (user.full_name || "?").trim().charAt(0);
  document.getElementById("profileCard").innerHTML = `
    <div class="id-card-top">
      <div class="id-avatar">${initial}</div>
      <div>
        <div class="id-name">${user.full_name || ""}</div>
        <div class="id-role">عميل ميزة</div>
      </div>
    </div>
    <div class="id-chips">
      <div class="id-chip"><span class="gicon">mail</span><div><small>البريد الإلكتروني</small><b>${user.email || "-"}</b></div></div>
      <div class="id-chip"><span class="gicon">call</span><div><small>رقم الهاتف</small><b>${user.phone || "-"}</b></div></div>
    </div>
  `;
}
