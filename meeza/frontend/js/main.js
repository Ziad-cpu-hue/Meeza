// ============================================================
// تفاعلات عامة للصفحة الرئيسية
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links.mobile");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("hidden"));
  }

  // لو المستخدم مسجل دخول بالفعل، وجّه أزرار "تسجيل الدخول" لصفحة لوحة التحكم المناسبة
  const user = typeof Auth !== "undefined" ? Auth.getUser() : null;
  if (user) {
    document.querySelectorAll("[data-auth-cta]").forEach((el) => {
      el.textContent = "لوحة التحكم";
      el.setAttribute("href", user.user_type === "driver" ? "driver-dashboard.html" : "customer-dashboard.html");
    });
  }

  // تحميل سعر الوقود الحالي من السيرفر لعرضه في صفحة الهبوط (اختياري - لا يوقف الصفحة لو فشل)
  const fuelEl = document.querySelector("[data-fuel-price]");
  if (fuelEl && typeof apiRequest === "function") {
    apiRequest("/api/pricing/current/", { noAuth: true })
      .then((data) => { fuelEl.textContent = `${data.fuel_price_per_liter} ج`; })
      .catch(() => { fuelEl.textContent = `${DEFAULT_FUEL_PRICE} ج`; });
  }
});
