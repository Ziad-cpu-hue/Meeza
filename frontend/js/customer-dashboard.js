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

function renderBreakdown(data) {
  // ملحوظة: العميل بيشوف السعر النهائي بس. تفاصيل توزيع السعر (وقود/صيانة/عمولة)
  // بيانات داخلية خاصة بالمنصة ومش بترجع أصلاً من السيرفر لحساب العميل.
  const km = routeDistanceKm ?? data.distance_km;
  const r = 80, c = 2 * Math.PI * r;
  const fillFrac = 0.78; // decorative fill — not tied to any real percentage
  const dash = `${(c * fillFrac).toFixed(1)} ${c.toFixed(1)}`;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30;
    return `<line x1="100" y1="14" x2="100" y2="24" transform="rotate(${angle} 100 100)"/>`;
  }).join("");

  document.getElementById("priceBreakdown").innerHTML = `
    <div class="price-hero">
      <div class="price-hero-top">
        <span class="price-hero-label">السعر التقديري للرحلة</span>
        <span class="price-hero-chip"><span class="gicon">verified</span> سعر ثابت</span>
      </div>
      <div class="price-gauge">
        <svg class="gauge-ring" viewBox="0 0 200 200">
          <circle class="gauge-track" cx="100" cy="100" r="${r}"></circle>
          <circle class="gauge-fill" cx="100" cy="100" r="${r}" stroke-dasharray="${dash}"></circle>
          <g class="gauge-ticks">${ticks}</g>
        </svg>
        <div class="gauge-center">
          <span class="gauge-amount">${data.total_price}</span>
          <span class="gauge-currency">جنيه مصري</span>
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

function renderActiveOrder(trip) {
  const card = document.getElementById("activeOrderCard");

  if (trip.status === "pending") {
    const waitedSec = Math.floor((Date.now() - orderCreatedAt) / 1000);
    const showBump = waitedSec >= PRICE_INCREASE_DELAY_SEC;
    card.innerHTML = `
      <span class="tracking-status-chip waiting"><span class="gicon">hourglass_top</span> بانتظار قبول كابتن</span>
      <div style="margin-top:1rem;">
        <div class="field-row"><span>من</span><b>${trip.pickup_address}</b></div>
        <div class="field-row"><span>إلى</span><b>${trip.dropoff_address}</b></div>
        <div class="field-row"><span>المسافة</span><b>${trip.distance_km} كم${trip.estimated_duration_min ? ` · ${trip.estimated_duration_min} دقيقة` : ""}</b></div>
        <div class="field-row"><span>السعر الحالي</span><b>${trip.total_price} ج</b></div>
      </div>
      ${showBump ? `
        <div class="price-bump-box">
          <p><span class="gicon">bolt</span> محدش قبل الطلب لسه. تقدر تزوّد السعر أو تضيف بونص للكابتن عشان يوصلك أسرع.</p>
          <div class="price-bump-btns">
            <button class="bump-btn" onclick="increasePrice(10)">+10 ج</button>
            <button class="bump-btn" onclick="increasePrice(20)">+20 ج</button>
            <button class="bump-btn strong" onclick="increasePrice(50)">+50 ج</button>
          </div>
        </div>
      ` : ""}
      <button class="locate-chip" style="width:100%;justify-content:center;margin-top:1.1rem;" onclick="cancelTracking()"><span class="gicon">visibility_off</span> إخفاء المتابعة (الطلب لسه شغال في الخلفية)</button>
    `;
    hideTrackingMap();
    return;
  }

  if (trip.status === "accepted") {
    card.innerHTML = `
      <span class="tracking-status-chip accepted"><span class="gicon">directions_car</span> الكابتن في الطريق إليك</span>
      <div style="margin-top:1rem;">
        <div class="field-row"><span>الكابتن</span><b>${trip.driver_name || "-"}</b></div>
        <div class="field-row"><span>الهاتف</span><b>${trip.driver_phone || "-"}</b></div>
        <div class="field-row"><span>المركبة</span><b>${trip.driver_vehicle_type_display || "-"}</b></div>
        <div class="field-row"><span>السعر</span><b>${trip.total_price} ج</b></div>
      </div>
      <div id="trackingMap"></div>
      <p id="trackingEta" style="text-align:center;color:var(--gray-500);font-size:.9rem;"></p>
    `;
    renderTrackingMap(trip);
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

// ---------- خريطة التتبع الحي (مرحلة 7) ----------
function renderTrackingMap(trip) {
  if (!trackingMap) {
    trackingMap = L.map("trackingMap");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(trackingMap);
  }
  setTimeout(() => trackingMap.invalidateSize(), 100);

  const dropoff = [trip.dropoff_lat, trip.dropoff_lng];
  const bounds = [dropoff];
  L.marker(dropoff, { title: "الوجهة" }).addTo(trackingMap);

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
    updateTrackingRoute(driverPos, dropoff);
  }

  trackingMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

async function updateTrackingRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || !data.routes.length) return;
    const route = data.routes[0];
    const km = (route.distance / 1000).toFixed(1);
    const min = Math.max(1, Math.round(route.duration / 60));
    const etaEl = document.getElementById("trackingEta");
    if (etaEl) etaEl.textContent = `الكابتن على بعد ${km} كم تقريباً (حوالي ${min} دقيقة)`;

    if (trackingRouteLayer) trackingMap.removeLayer(trackingRouteLayer);
    trackingRouteLayer = L.geoJSON(route.geometry, { style: { color: "#10B981", weight: 5, opacity: .85 } }).addTo(trackingMap);
  } catch (e) { /* silent */ }
}

function hideTrackingMap() {
  if (trackingMap) {
    trackingMap.remove();
    trackingMap = null;
    trackingDriverMarker = null;
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
          ${(t.status === "pending" || t.status === "accepted") ? `<button class="trip-track-btn" onclick="trackFromHistory(${t.id})">تتبع الطلب</button>` : ""}
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
