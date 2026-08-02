// ============================================================
// إعدادات عامة للواجهة الأمامية — عدّل هذا الملف عند النشر
// ============================================================

// رابط الـ API الخاص بسيرفر Django
// - أثناء التطوير المحلي: لو بتفتح الموقع من نفس سيرفر Django (127.0.0.1:8000)
//   بيسيب الرابط فاضي عشان يستخدم نفس السيرفر تلقائياً (مفيش داعي لتشغيل سيرفرين).
// - بعد النشر: غيّر الرابط تحت لدومين الباك إند الحقيقي.
const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? ""
  : "https://api.meeza-eg.com";

// Google OAuth Client ID (من Google Cloud Console)
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// سعر البنزين الافتراضي المعروض قبل تحميل الإعدادات من السيرفر
const DEFAULT_FUEL_PRICE = 22.25;
