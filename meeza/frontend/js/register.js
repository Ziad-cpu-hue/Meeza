// ============================================================
// منطق صفحة إنشاء الحساب
// ============================================================

const vehicleLabels = {
  private_car: "صورة واضحة للسيارة",
  pickup_truck: "صورة واضحة لسيارة النقل (البيك أب)",
  refrigerated_truck: "صورة واضحة للشاحنة المبردة",
  motorcycle: "صورة واضحة للموتوسيكل",
};

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const btnCustomer = document.getElementById("btnCustomer");
  const btnDriver = document.getElementById("btnDriver");
  const customerForm = document.getElementById("customerForm");
  const driverForm = document.getElementById("driverForm");

  function showCustomer() {
    btnCustomer.classList.add("active-customer");
    btnDriver.classList.remove("active-driver");
    customerForm.classList.remove("hidden");
    driverForm.classList.add("hidden");
  }
  function showDriver() {
    btnDriver.classList.add("active-driver");
    btnCustomer.classList.remove("active-customer");
    driverForm.classList.remove("hidden");
    customerForm.classList.add("hidden");
  }
  btnCustomer.addEventListener("click", showCustomer);
  btnDriver.addEventListener("click", showDriver);
  if (params.get("type") === "driver") showDriver();

  // ---------- اختيار نوع المركبة ----------
  document.querySelectorAll("#vehicleToggle button, [data-vehicle='motorcycle']").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-vehicle]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const type = btn.getAttribute("data-vehicle");
      document.getElementById("d_vehicle_type").value = type;
      document.getElementById("vehiclePhotoLabel").textContent = vehicleLabels[type];
    });
  });

  // ---------- تسجيل عميل ----------
  customerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("c_password").value;
    const pass2 = document.getElementById("c_password2").value;
    if (pass !== pass2) return showAlert("كلمتا المرور غير متطابقتين");

    const btn = document.getElementById("customerSubmitBtn");
    btn.disabled = true; btn.innerHTML = '<span class="loader"></span>';
    try {
      const data = await apiRequest("/api/auth/register/", {
        method: "POST",
        body: {
          full_name: document.getElementById("c_name").value,
          phone: document.getElementById("c_phone").value,
          email: document.getElementById("c_email").value,
          password: pass,
          user_type: "customer",
        },
        noAuth: true,
      });
      Auth.setToken(data.token);
      Auth.setUser(data.user);
      showSuccessModal({
        title: `أهلاً بيك في ميزة يا ${data.user.full_name || ""} 🎉`,
        message: "تم إنشاء حسابك بنجاح، جاهز تطلب أول توصيلة؟",
        buttonText: "ابدأ الآن →",
        onConfirm: () => window.location.href = "customer-dashboard.html",
      });
    } catch (err) {
      showAlert(err.message);
    } finally {
      btn.disabled = false; btn.textContent = "إنشاء حساب";
    }
  });

  // ---------- تسجيل كابتن ----------
  driverForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("driverSubmitBtn");
    btn.disabled = true; btn.innerHTML = '<span class="loader"></span>';

    try {
      const fd = new FormData();
      fd.append("full_name", document.getElementById("d_name").value);
      fd.append("phone", document.getElementById("d_phone").value);
      fd.append("email", document.getElementById("d_email").value);
      fd.append("password", document.getElementById("d_password").value);
      fd.append("vehicle_type", document.getElementById("d_vehicle_type").value);
      fd.append("vehicle_photo", document.getElementById("d_vehicle_photo").files[0]);
      fd.append("license_photo", document.getElementById("d_license_photo").files[0]);
      fd.append("id_selfie_front", document.getElementById("d_id_selfie_front").files[0]);
      fd.append("id_photo_back", document.getElementById("d_id_photo_back").files[0]);

      const data = await apiRequest("/api/drivers/apply/", {
        method: "POST",
        body: fd,
        isForm: true,
        noAuth: true,
      });
      Auth.setToken(data.token);
      Auth.setUser(data.user);
      showSuccessModal({
        icon: "📨",
        title: "تم إرسال طلبك بنجاح! 🎉",
        message: "فريق ميزة هيراجع بياناتك ومستنداتك ويبلغك بالنتيجة قريباً.",
        buttonText: "تابع حالة طلبي →",
        onConfirm: () => window.location.href = "driver-dashboard.html",
      });
    } catch (err) {
      showAlert(err.message);
    } finally {
      btn.disabled = false; btn.textContent = "إرسال طلب الانضمام";
    }
  });
});
