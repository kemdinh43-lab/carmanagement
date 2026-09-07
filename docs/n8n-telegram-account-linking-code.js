const vars = typeof $vars !== "undefined" ? $vars : {};
const env = typeof $env !== "undefined" ? $env : {};
const readConfig = (name) => vars[name] || env[name];

const SUPABASE_URL = readConfig("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = readConfig("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_BOT_TOKEN = readConfig("TELEGRAM_BOT_TOKEN");

function assertEnv(name, value) {
  if (!value) throw new Error(`Missing n8n env: ${name}`);
}

assertEnv("SUPABASE_URL", SUPABASE_URL);
assertEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
assertEnv("TELEGRAM_BOT_TOKEN", TELEGRAM_BOT_TOKEN);

const httpRequest = this.helpers.httpRequest.bind(this.helpers);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendTelegram(chatId, text) {
  return await httpRequest({
    method: "POST",
    url: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    headers: { "Content-Type": "application/json" },
    body: { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true },
    json: true
  });
}

async function connectTelegramRecipient(token, chatId, username) {
  return await httpRequest({
    method: "POST",
    url: `${SUPABASE_URL}/rest/v1/rpc/connect_telegram_recipient`,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: {
      p_token: token,
      p_chat_id: String(chatId),
      p_username: username || null
    },
    json: true
  });
}

const message = items[0]?.json?.message || items[0]?.json || {};
const chatId = message.chat?.id;
const from = message.from || {};
const text = String(message.text || "").trim();
const token = text.replace(/^\/start(?:@\w+)?\s*/i, "").trim();
const username = from.username || message.chat?.username || null;

if (!chatId) throw new Error("Telegram update does not include chat.id");

if (!token) {
  await sendTelegram(chatId, "Vui lòng mở link kết nối Telegram từ Angel One Ops.");
  return [{ json: { ok: false, reason: "missing_token" } }];
}

try {
  const result = await connectTelegramRecipient(token, chatId, username);
  const targetLabel = result?.target_type === "driver" ? "tài xế" : "người dùng nội bộ";
  await sendTelegram(chatId, `Đã kết nối Telegram cho <b>${escapeHtml(targetLabel)}</b>. Từ giờ thông báo Angel One Ops sẽ gửi vào chat này.`);
  return [{ json: { ok: true, result } }];
} catch (error) {
  await sendTelegram(chatId, "Link kết nối không hợp lệ hoặc đã hết hạn. Vui lòng tạo link mới trong Angel One Ops.");
  return [{ json: { ok: false, reason: "invalid_or_expired_token", error: error.message } }];
}
