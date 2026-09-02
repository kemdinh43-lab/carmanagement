const vars = typeof $vars !== "undefined" ? $vars : {};
const env = typeof $env !== "undefined" ? $env : {};
const readConfig = (name) => vars[name] || env[name];

const SUPABASE_URL = readConfig("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = readConfig("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_BOT_TOKEN = readConfig("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_DRIVER = readConfig("TELEGRAM_CHAT_DRIVER") || readConfig("TELEGRAM_CHAT_ADMIN");
const TELEGRAM_CHAT_DISPATCHER = readConfig("TELEGRAM_CHAT_DISPATCHER") || readConfig("TELEGRAM_CHAT_ADMIN");
const APP_URL = (readConfig("APP_URL") || "https://carmanagement-seven.vercel.app").replace(/\/$/, "");

function assertEnv(name, value) {
  if (!value) throw new Error(`Missing n8n env: ${name}`);
}

assertEnv("SUPABASE_URL", SUPABASE_URL);
assertEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
assertEnv("TELEGRAM_BOT_TOKEN", TELEGRAM_BOT_TOKEN);
assertEnv("TELEGRAM_CHAT_DRIVER/ADMIN", TELEGRAM_CHAT_DRIVER);
assertEnv("TELEGRAM_CHAT_DISPATCHER/ADMIN", TELEGRAM_CHAT_DISPATCHER);

const supabaseHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json"
};

const httpRequest = this.helpers.httpRequest.bind(this.helpers);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

function orderRouteLegs(order) {
  if (Array.isArray(order?.route_legs) && order.route_legs.length > 0) return order.route_legs;
  if (!order?.pickup && !order?.dropoff) return [];
  return [{ pickup: order.pickup, dropoff: order.dropoff, startAt: order.start_at, endAt: order.end_at }];
}

function legStartAt(leg) {
  return leg?.startAt || leg?.start_at || "";
}

function legEndAt(leg) {
  return leg?.endAt || leg?.end_at || "";
}

function mapsUrlForLeg(leg) {
  if (!leg?.pickup || !leg?.dropoff) return "";
  const params = new URLSearchParams({
    api: "1",
    origin: leg.pickup,
    destination: leg.dropoff,
    travelmode: "driving"
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

async function supabaseRpc(name, body) {
  return await httpRequest({
    method: "POST",
    url: `${SUPABASE_URL}/rest/v1/rpc/${name}`,
    headers: supabaseHeaders,
    body,
    json: true
  });
}

async function sendTelegram(chatId, text) {
  return await httpRequest({
    method: "POST",
    url: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    headers: { "Content-Type": "application/json" },
    body: { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false },
    json: true
  });
}

function shouldRemind(order, nowMs) {
  if (String(order.driver_ack_status || "pending") !== "pending") return false;
  if (String(order.dispatch_status || "") !== "assigned") return false;
  const count = Number(order.driver_ack_count || 0);
  if (count >= 3) return false;
  if (!order.driver_ack_last_sent_at) return true;
  return nowMs - new Date(order.driver_ack_last_sent_at).getTime() >= 2 * 60 * 1000;
}

function driverReminderMessage(order, nextCount) {
  const legs = orderRouteLegs(order);
  const actionUrl = `${APP_URL}/?view=driver&order=${encodeURIComponent(order.id)}`;
  const legLines = legs.map((leg, index) => {
    const time = [legStartAt(leg) ? formatDateTime(legStartAt(leg)) : "", legEndAt(leg) ? formatDateTime(legEndAt(leg)) : ""].filter(Boolean).join(" - ");
    const maps = mapsUrlForLeg(leg);
    const label = `Chặng ${index + 1}`;
    return [
      `<b>${label}</b>: ${escapeHtml(leg.pickup || "-")} -> ${escapeHtml(leg.dropoff || "-")}`,
      time ? `Thời gian: ${escapeHtml(time)}` : "",
      maps ? `<a href="${escapeHtml(maps)}">Google Maps ${escapeHtml(label)}</a>` : ""
    ].filter(Boolean).join("\n");
  });

  return [
    `<b>Nhắc nhận chuyến lần ${nextCount}/3</b>`,
    `Lệnh: <b>${escapeHtml(order.code)}</b>`,
    order.vehicle_plate_no ? `Xe: ${escapeHtml(order.vehicle_plate_no)}` : "",
    order.driver_full_name ? `Tài xế: ${escapeHtml(order.driver_full_name)} / ${escapeHtml(order.driver_phone || "")}` : "",
    `Giờ chạy: ${escapeHtml(formatDateTime(order.start_at))} - ${escapeHtml(formatDateTime(order.end_at))}`,
    ...legLines,
    `<a href="${escapeHtml(actionUrl)}">Nhận chuyến</a>`
  ].filter(Boolean).join("\n");
}

function dispatcherEscalationMessage(order) {
  const actionUrl = `${APP_URL}/?view=dispatch&order=${encodeURIComponent(order.id)}`;
  return [
    "<b>Tài xế chưa nhận chuyến sau 3 lần nhắc</b>",
    `Lệnh: <b>${escapeHtml(order.code)}</b>`,
    `Tài xế: ${escapeHtml(order.driver_full_name || order.driver_id || "-")} / ${escapeHtml(order.driver_phone || "")}`,
    order.vehicle_plate_no ? `Xe: ${escapeHtml(order.vehicle_plate_no)}` : "",
    `Giờ chạy: ${escapeHtml(formatDateTime(order.start_at))} - ${escapeHtml(formatDateTime(order.end_at))}`,
    `<a href="${escapeHtml(actionUrl)}">Điều hành gọi tài xế / đổi phân công</a>`
  ].filter(Boolean).join("\n");
}

const select = [
  "id",
  "code",
  "customer_name",
  "contact_phone",
  "pickup",
  "dropoff",
  "route_legs",
  "start_at",
  "end_at",
  "vehicle_plate_no",
  "driver_id",
  "driver_full_name",
  "driver_phone",
  "dispatch_status",
  "driver_ack_status",
  "driver_ack_count",
  "driver_ack_last_sent_at"
].join(",");

const rows = await httpRequest({
  method: "GET",
  url: `${SUPABASE_URL}/rest/v1/app_dispatch_orders?select=${encodeURIComponent(select)}&dispatch_status=eq.assigned&driver_ack_status=eq.pending&driver_ack_count=lt.3&order=start_at.asc&limit=20`,
  headers: supabaseHeaders,
  json: true
});

const nowMs = Date.now();
const dueOrders = (Array.isArray(rows) ? rows : []).filter((order) => shouldRemind(order, nowMs));
const results = [];

for (const order of dueOrders) {
  const nextCount = Number(order.driver_ack_count || 0) + 1;
  await sendTelegram(TELEGRAM_CHAT_DRIVER, driverReminderMessage(order, nextCount));
  const savedCount = await supabaseRpc("record_driver_ack_reminder", { p_order_id: order.id });
  results.push({ order: order.code, action: "reminded_driver", count: savedCount || nextCount });
}

const escalationRows = await httpRequest({
  method: "GET",
  url: `${SUPABASE_URL}/rest/v1/app_dispatch_orders?select=${encodeURIComponent(select)}&dispatch_status=eq.assigned&driver_ack_status=eq.pending&driver_ack_count=gte.3&order=start_at.asc&limit=20`,
  headers: supabaseHeaders,
  json: true
});

for (const order of Array.isArray(escalationRows) ? escalationRows : []) {
  await sendTelegram(TELEGRAM_CHAT_DISPATCHER, dispatcherEscalationMessage(order));
  await supabaseRpc("escalate_driver_ack", {
    p_order_id: order.id,
    p_reason: "Tài xế chưa nhận chuyến sau 3 lần nhắc tự động"
  });
  results.push({ order: order.code, action: "escalated_to_dispatcher" });
}

return [{ json: { due: dueOrders.length, results } }];
