// ============================================================
// منطق صفحة تسجيل الدخول
// ============================================================

function redirectByUserType(user) {
  window.location.href = user.user_type === "driver" ? "driver-dashboard.html" : "customer-dashboard.html";
}

document.addEventListener("DOMContentLoaded", () => {
  // لو المستخدم مسجل دخول بالفعل حوّله مباشرة
  const existing = Auth.getUser();
  if (existing) redirectByUserType(existing);

  // ---------- تسجيل الدخول بالبريد وكلمة المرور ----------
  const form = document.getElementById("loginForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("submitBtn");
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="loader"></span>';

      try {
        const data = await apiRequest("/api/auth/login/", {
          method: "POST",
          body: { email, password },
          noAuth: true,
        });
        Auth.setToken(data.token);
        Auth.setUser(data.user);
        showSuccessModal({
          title: `أهلاً بيك ${data.user.full_name || ""} 👋`,
          message: "تم تسجيل الدخول بنجاح، جاهز تبدأ؟",
          buttonText: "ابدأ الآن →",
          onConfirm: () => redirectByUserType(data.user),
        });
      } catch (err) {
        showAlert(err.message || "بيانات الدخول غير صحيحة");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "تسجيل الدخول";
      }
    });
  }

  // ---------- تسجيل الدخول بجوجل ----------
  initGoogleSignIn();
});

function initGoogleSignIn() {
  const container = document.getElementById("googleBtnContainer");
  const fallback = document.getElementById("googleFallbackBtn");
  if (!container) return;

  function tryInit() {
    if (!window.google || !window.google.accounts) {
      setTimeout(tryInit, 300);
      return;
    }
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    });
    google.accounts.id.renderButton(container, {
      theme: "outline",
      size: "large",
      width: 360,
      locale: "ar",
    });
    fallback.classList.add("hidden");
    fallback.addEventListener("click", () => google.accounts.id.prompt());
  }
  tryInit();
}

async function handleGoogleCredential(response) {
  try {
    const data = await apiRequest("/api/auth/google/", {
      method: "POST",
      body: { id_token: response.credential },
      noAuth: true,
    });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    showSuccessModal({
      title: `أهلاً بيك ${data.user.full_name || ""} 👋`,
      message: "تم تسجيل الدخول بواسطة جوجل بنجاح، جاهز تبدأ؟",
      buttonText: "ابدأ الآن →",
      onConfirm: () => redirectByUserType(data.user),
    });
  } catch (err) {
    showAlert(err.message || "تعذر تسجيل الدخول بواسطة جوجل");
  }
}
