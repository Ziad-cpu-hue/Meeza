// ============================================================
// نافذة الدردشة العائمة (تظهر فقط للمستخدمين المسجلين دخول)
// ============================================================

let chatPollInterval = null;
let chatOpen = false;

function initChatWidget() {
  const user = typeof Auth !== "undefined" ? Auth.getUser() : null;
  if (!user) return; // الدردشة متاحة فقط لمن سجل دخول كعميل أو كابتن

  const widget = document.createElement("div");
  widget.id = "chatWidget";
  widget.innerHTML = `
    <div class="chat-bubble-tip hidden" id="chatBubbleTip">
      <span>مرحباً! 👋</span>
      <small>يا بطل.. نقدر نساعدك إزاي؟</small>
    </div>
    <button class="chat-fab" id="chatFabBtn" aria-label="الدردشة مع الدعم"><img src="images/icons/chat_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg" alt="الدردشة مع الدعم" class="chat-fab-icon"></button>
    <div class="chat-panel hidden" id="chatPanel">
      <div class="chat-panel-head">
        <div>
          <b>الدعم الفني</b>
          <span>ميزة عادة بترد خلال دقايق</span>
        </div>
        <button class="chat-close-btn" id="chatCloseBtn">✕</button>
      </div>
      <div class="chat-messages" id="chatMessages">
        <p class="chat-empty">جارٍ تحميل المحادثة...</p>
      </div>
      <form class="chat-input-row" id="chatForm">
        <input type="text" id="chatInput" placeholder="اكتب رسالتك هنا..." autocomplete="off">
        <button type="submit" class="chat-send-btn">➤</button>
      </form>
    </div>
  `;
  document.body.appendChild(widget);

  const fabBtn = document.getElementById("chatFabBtn");
  const panel = document.getElementById("chatPanel");
  const bubbleTip = document.getElementById("chatBubbleTip");
  const closeBtn = document.getElementById("chatCloseBtn");
  const form = document.getElementById("chatForm");

  // إظهار تلميحة ترحيبية بعد ثانيتين لو المحادثة لسه متفتحتش
  setTimeout(() => {
    if (!chatOpen) bubbleTip.classList.remove("hidden");
  }, 2000);

  fabBtn.addEventListener("click", () => {
    bubbleTip.classList.add("hidden");
    chatOpen = !chatOpen;
    panel.classList.toggle("hidden", !chatOpen);
    if (chatOpen) {
      loadConversation();
      chatPollInterval = setInterval(loadConversation, 5000);
    } else if (chatPollInterval) {
      clearInterval(chatPollInterval);
    }
  });

  closeBtn.addEventListener("click", () => {
    chatOpen = false;
    panel.classList.add("hidden");
    if (chatPollInterval) clearInterval(chatPollInterval);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      await apiRequest("/api/support/me/", { method: "POST", body: { text } });
      loadConversation();
    } catch (err) {
      showToast(err.message, "err");
    }
  });
}

async function loadConversation() {
  const wrap = document.getElementById("chatMessages");
  if (!wrap) return;
  try {
    const data = await apiRequest("/api/support/me/");
    if (!data.messages.length) {
      wrap.innerHTML = '<p class="chat-empty">ابدأ محادثتك مع فريق ميزة 👋</p>';
      return;
    }
    const wasAtBottom =
      wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 20;
    wrap.innerHTML = data.messages
      .map(
        (m) => `
      <div class="chat-msg ${m.sender === "admin" ? "chat-msg-admin" : "chat-msg-user"}">
        <div class="chat-bubble">${escapeHtml(m.text)}</div>
        <span class="chat-time">${new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    `,
      )
      .join("");
    if (wasAtBottom || wrap.dataset.firstLoad !== "done") {
      wrap.scrollTop = wrap.scrollHeight;
      wrap.dataset.firstLoad = "done";
    }
  } catch (err) {
    wrap.innerHTML = `<p class="chat-empty">تعذر تحميل المحادثة</p>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", initChatWidget);
