export function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function flash(type, msg) {
  return `<div class="alert alert-${type}">${escHtml(msg)}</div>`;
}

export function parseDevice(ua) {
  if (!ua) return "Unknown";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return "Mobile";
  return "Desktop";
}

export function parseReferrer(ref) {
  if (!ref) return "Direct";
  try {
    const u = new URL(ref);
    return u.hostname.replace(/^www\./, "");
  } catch { return "Direct"; }
}
