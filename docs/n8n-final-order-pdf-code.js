const vars = typeof $vars !== "undefined" ? $vars : {};
const env = typeof $env !== "undefined" ? $env : {};
const readConfig = (name, fallback = "") => vars[name] || env[name] || fallback;

const expectedSecret = readConfig("AOT_FINAL_ORDER_WEBHOOK_SECRET");
const supabaseUrl = readConfig("SUPABASE_URL");
const supabaseKey = readConfig("SUPABASE_SERVICE_ROLE_KEY");
const telegramToken = readConfig("TELEGRAM_BOT_TOKEN");
const adminChatId = readConfig("TELEGRAM_CHAT_ADMIN");
const httpRequest = this.helpers.httpRequest.bind(this.helpers);

const input = items[0]?.json || {};
const headers = input.headers || input.request?.headers || {};
const body = input.body && typeof input.body === "object" ? input.body : input;
const receivedSecret = headers["x-aot-webhook-secret"] || headers["X-Aot-Webhook-Secret"] || headers["X-AOT-WEBHOOK-SECRET"];

if (expectedSecret && receivedSecret !== expectedSecret) {
  throw new Error("Sai x-aot-webhook-secret");
}

if (body.delivery?.schema !== "aot_final_dispatch_order_pdf_v1") {
  throw new Error("Sai schema payload PDF");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendTelegram(chatId, text) {
  if (!telegramToken || !chatId) return null;
  return await httpRequest({
    method: "POST",
    url: `https://api.telegram.org/bot${telegramToken}/sendMessage`,
    headers: { "Content-Type": "application/json" },
    body: { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true },
    json: true
  });
}

async function getAccountantRecipients() {
  if (!supabaseUrl || !supabaseKey) return [];
  const rows = await httpRequest({
    method: "GET",
    url: `${supabaseUrl}/rest/v1/app_user_profiles?select=${encodeURIComponent("user_id,full_name,role,telegram_chat_id,telegram_enabled")}&role=eq.accountant&telegram_enabled=eq.true&limit=50`,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    },
    json: true
  });
  return (Array.isArray(rows) ? rows : []).filter((row) => row.telegram_chat_id);
}

const orderNo = body.order_no || "UNKNOWN";
const filename = body.delivery?.filename || `Lenh_dieu_xe_${orderNo}.pdf`;
const routeLegs = Array.isArray(body.trip?.route_legs) ? body.trip.route_legs : [];
const routeText = routeLegs.length
  ? routeLegs.map((leg, index) => `Chặng ${index + 1}: ${leg.from || "-"} -> ${leg.to || "-"}${leg.time ? " / " + leg.time : ""}`).join("\n")
  : [body.trip?.pickup, body.trip?.dropoff].filter(Boolean).join(" -> ");

const text = [
  "📄 <b>Yêu cầu xuất lệnh điều xe final</b>",
  "",
  `Mã lệnh: <b>${escapeHtml(orderNo)}</b>`,
  body.customer?.name ? `Khách: ${escapeHtml(body.customer.name)}${body.customer.phone ? " / " + escapeHtml(body.customer.phone) : ""}` : "",
  body.vehicle?.driver_name ? `Tài xế: ${escapeHtml(body.vehicle.driver_name)}${body.vehicle.driver_phone ? " / " + escapeHtml(body.vehicle.driver_phone) : ""}` : "",
  body.vehicle?.plate ? `Xe: ${escapeHtml(body.vehicle.plate)}` : "",
  routeText ? `Hành trình:\n${escapeHtml(routeText)}` : "",
  body.trip?.total ? `Tổng thanh toán: ${escapeHtml(body.trip.total)}` : "",
  body.reconciliation?.reconciliation_status ? `Trạng thái hồ sơ: ${escapeHtml(body.reconciliation.reconciliation_status)}` : "",
  "",
  "Workflow đã nhận payload. Bước tạo PDF cần server n8n có script Python và logo để nối tiếp."
].filter(Boolean).join("\n");

let telegramSent = 0;
const recipients = await getAccountantRecipients();
if (recipients.length > 0) {
  for (const recipient of recipients) {
    await sendTelegram(recipient.telegram_chat_id, text);
    telegramSent += 1;
  }
} else if (adminChatId) {
  await sendTelegram(adminChatId, [
    "<b>Can lien ket Telegram ke toan</b>",
    `Lenh final: <b>${escapeHtml(orderNo)}</b>`,
    "Chua co user role accountant nao co telegram_enabled = true."
  ].join("\n"));
  telegramSent = 1;
}

return [{
  json: {
    ok: true,
    stage: "webhook_received",
    order_no: orderNo,
    filename,
    telegram_sent: telegramSent > 0,
    telegram_recipient_count: recipients.length,
    next_required: "Để gửi PDF thật: upload scripts/aot_lenh_dieu_xe_pdf_generator.py và logo lên server n8n, sau đó nối Execute Command + Send Document."
  }
}];
