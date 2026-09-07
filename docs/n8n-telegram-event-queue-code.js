const vars = typeof $vars !== "undefined" ? $vars : {};
const env = typeof $env !== "undefined" ? $env : {};
const readConfig = (name) => vars[name] || env[name];

const SUPABASE_URL = readConfig("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = readConfig("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_BOT_TOKEN = readConfig("TELEGRAM_BOT_TOKEN");
const APP_URL = (readConfig("APP_URL") || "https://carmanagement-seven.vercel.app").replace(/\/$/, "");
const TELEGRAM_CHAT_ADMIN = readConfig("TELEGRAM_CHAT_ADMIN");

const audienceLabels = {
  admin: "Admin/Owner",
  manager: "Quản lý",
  dispatcher: "Điều hành",
  sale: "Sale",
  accountant: "Kế toán",
  driver: "Tài xế"
};

const v1EventTypes = new Set([
  "dispatch_proposal_submitted",
  "dispatch_proposal_approved",
  "dispatch_proposal_rejected",
  "driver_assigned",
  "driver_assignment_replaced",
  "trip_completed",
  "driver_trip_report_submitted",
  "urgent_driver_proposal_submitted",
  "urgent_driver_proposal_needs_sales_completion",
  "driver_proposal_submitted",
  "driver_proposal_promoted_to_dispatch"
]);

function assertEnv(name, value) {
  if (!value) throw new Error(`Missing n8n env: ${name}`);
}

assertEnv("SUPABASE_URL", SUPABASE_URL);
assertEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
assertEnv("TELEGRAM_BOT_TOKEN", TELEGRAM_BOT_TOKEN);
assertEnv("TELEGRAM_CHAT_ADMIN", TELEGRAM_CHAT_ADMIN);

const supabaseHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json"
};

const httpRequest = this.helpers.httpRequest.bind(this.helpers);

async function supabaseRpc(name, body) {
  try {
    return await httpRequest({
      method: "POST",
      url: `${SUPABASE_URL}/rest/v1/rpc/${name}`,
      headers: supabaseHeaders,
      body,
      json: true
    });
  } catch (error) {
    throw new Error(`${name} failed: ${error.message}`);
  }
}

async function optionalSupabaseRpc(name, body, fallback) {
  try {
    return await supabaseRpc(name, body);
  } catch (error) {
    if (String(error.message || "").includes("Could not find the function")) return fallback;
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(value) {
  const number = Number(value || 0);
  return number > 0 ? new Intl.NumberFormat("vi-VN").format(number) + " đ" : "";
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

function mapsUrl(order) {
  const legs = orderRouteLegs(order);
  const origin = legs[0]?.pickup || order?.pickup;
  const destination = legs[legs.length - 1]?.dropoff || order?.dropoff;
  if (!origin || !destination) return "";
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving"
  });
  const waypoints = legs.slice(0, -1).map((leg) => leg.dropoff).filter(Boolean);
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function actionUrl(event, order) {
  const orderId = encodeURIComponent(order?.id || event.entity_id || event.payload?.entityId || "");
  if (!orderId) return APP_URL;
  if (event.audience === "accountant") return `${APP_URL}/?view=finance&order=${orderId}`;
  if (event.audience === "dispatcher" || event.audience === "manager" || event.audience === "admin") return `${APP_URL}/?view=dispatch&order=${orderId}`;
  if (event.audience === "driver") return `${APP_URL}/?view=driver&order=${orderId}`;
  return `${APP_URL}/?view=orders&order=${orderId}`;
}

async function getRow(table, select, id) {
  if (!id) return null;
  try {
    const rows = await httpRequest({
      method: "GET",
      url: `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(id)}&limit=1`,
      headers: supabaseHeaders,
      json: true
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (error) {
    return null;
  }
}

async function getRows(table, select, filters = [], limit = 50) {
  try {
    const filterQuery = filters.map(([column, operator, value]) => {
      return `${encodeURIComponent(column)}=${operator}.${encodeURIComponent(String(value))}`;
    }).join("&");
    const query = [
      `select=${encodeURIComponent(select)}`,
      filterQuery,
      `limit=${encodeURIComponent(String(limit))}`
    ].filter(Boolean).join("&");
    const rows = await httpRequest({
      method: "GET",
      url: `${SUPABASE_URL}/rest/v1/${table}?${query}`,
      headers: supabaseHeaders,
      json: true
    });
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function recipientFromDriver(driver) {
  if (!driver?.telegram_enabled || !driver.telegram_chat_id) return null;
  return {
    chatId: driver.telegram_chat_id,
    recipientKey: `driver:${driver.id}`,
    label: driver.full_name || driver.id,
    type: "driver"
  };
}

function recipientFromUser(user) {
  if (!user?.telegram_enabled || !user.telegram_chat_id) return null;
  return {
    chatId: user.telegram_chat_id,
    recipientKey: `user:${user.user_id}`,
    label: user.full_name || user.phone || user.user_id,
    type: user.role || "user"
  };
}

async function resolveRecipients(event) {
  const payload = event.payload || {};
  const targetDriverId = event.target_driver_id || payload.targetDriverId || payload.driverId;
  const targetUserId = event.target_user_id || payload.targetUserId || payload.userId;

  if (targetDriverId) {
    const driver = await getRow(
      "app_drivers",
      "id,full_name,phone,status,telegram_chat_id,telegram_username,telegram_enabled",
      targetDriverId
    );
    if (!driver) return { recipients: [], error: `Khong tim thay tai xe Telegram target ${targetDriverId}` };
    const recipient = recipientFromDriver(driver);
    if (!recipient) return { recipients: [], error: `Tai xe ${driver.full_name || driver.id} chua lien ket Telegram` };
    return { recipients: [recipient] };
  }

  if (targetUserId) {
    const users = await getRows(
      "app_user_profiles",
      "user_id,full_name,phone,role,telegram_chat_id,telegram_username,telegram_enabled",
      [["user_id", "eq", targetUserId]],
      1
    );
    const user = users[0] || null;
    if (!user) return { recipients: [], error: `Khong tim thay user Telegram target ${targetUserId}` };
    const recipient = recipientFromUser(user);
    if (!recipient) return { recipients: [], error: `User ${user.full_name || user.user_id} chua lien ket Telegram` };
    return { recipients: [recipient] };
  }

  const audience = String(event.audience || "").trim();
  if (!audience) return { recipients: [], error: "Event khong co audience" };
  const users = await getRows(
    "app_user_profiles",
    "user_id,full_name,phone,role,telegram_chat_id,telegram_username,telegram_enabled",
    [["role", "eq", audience], ["telegram_enabled", "eq", true]],
    50
  );
  const recipients = users.map(recipientFromUser).filter(Boolean);
  if (recipients.length === 0) return { recipients: [], error: `Role ${audience} chua co nguoi lien ket Telegram` };
  return { recipients };
}

async function getOrderDetails(event) {
  const orderId = event.entity_id || event.payload?.entityId;
  if (!orderId) return { order: null, vehicle: null, driver: null };
  try {
    const select = [
      "id", "code", "customer_name", "contact_phone", "pickup", "dropoff", "route_legs",
      "service_label", "start_at", "end_at", "amount_due", "driver_cost",
      "vehicle_id", "driver_id", "driver_full_name", "driver_phone",
      "vehicle_plate_no", "external_vehicle_plate", "external_vehicle_type",
      "external_driver_name", "external_driver_phone",
      "dispatch_status", "order_status", "payment_status", "invoice_status",
      "driver_collected_amount", "driver_expense_fuel", "driver_expense_toll",
      "driver_expense_parking", "driver_expense_water", "driver_expense_other",
      "driver_expense_note", "source_owner_name", "priority"
    ].join(",");
    const rows = await httpRequest({
      method: "GET",
      url: `${SUPABASE_URL}/rest/v1/app_dispatch_orders?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(orderId)}&limit=1`,
      headers: supabaseHeaders,
      json: true
    });
    const order = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const vehicle = order?.vehicle_id ? await getRow("app_vehicles", "id,plate_no,vehicle_type,seats,status", order.vehicle_id) : null;
    const driver = order?.driver_id ? await getRow("app_drivers", "id,full_name,phone,status,telegram_chat_id,telegram_username,telegram_enabled", order.driver_id) : null;
    return { order, vehicle, driver };
  } catch (error) {
    return { order: null, vehicle: null, driver: null };
  }
}

function orderRoute(order) {
  const legs = orderRouteLegs(order);
  if (legs.length === 0) return "";
  const points = [legs[0]?.pickup, ...legs.map((leg) => leg.dropoff)].filter(Boolean);
  return points.filter((point, index) => index === 0 || point !== points[index - 1]).join(" -> ");
}

function orderRouteDetails(order) {
  const legs = orderRouteLegs(order);
  if (legs.length <= 1) return [];
  return legs.map((leg, index) => {
    const time = [legStartAt(leg) ? formatDateTime(legStartAt(leg)) : "", legEndAt(leg) ? formatDateTime(legEndAt(leg)) : ""].filter(Boolean).join(" - ");
    const note = leg.note ? ` / ${leg.note}` : "";
    return `Chặng ${index + 1}: ${time ? `${time} / ` : ""}${leg.pickup || "-"} -> ${leg.dropoff || "-"}${note}`;
  });
}

function orderVehicleLabel(order, vehicle) {
  return [
    order?.external_vehicle_plate || order?.vehicle_plate_no || vehicle?.plate_no || order?.vehicle_id,
    order?.external_vehicle_type || vehicle?.vehicle_type
  ].filter(Boolean).join(" / ");
}

function orderDriverLabel(order, driver) {
  return [
    order?.external_driver_name || order?.driver_full_name || driver?.full_name || order?.driver_id,
    order?.external_driver_phone || order?.driver_phone || driver?.phone
  ].filter(Boolean).join(" / ");
}

function eventRule(event, details) {
  const { order, vehicle, driver: driverProfile } = details;
  const type = event.event_type || "";
  const route = orderRoute(order);
  const routeDetails = orderRouteDetails(order);
  const vehicleLabel = orderVehicleLabel(order, vehicle);
  const driver = orderDriverLabel(order, driverProfile);
  const assignment = [vehicleLabel ? `Xe: ${vehicleLabel}` : "", driver ? `Tài xế: ${driver}` : ""].filter(Boolean);
  const driverReportedCost = order
    ? Number(order.driver_expense_fuel || 0) + Number(order.driver_expense_toll || 0) + Number(order.driver_expense_parking || 0) + Number(order.driver_expense_water || 0) + Number(order.driver_expense_other || 0)
    : 0;
  const rules = {
    dispatch_proposal_submitted: {
      title: "🟠 Lệnh chờ điều hành duyệt",
      action: "Kiểm tra thông tin lệnh và duyệt hoặc từ chối.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, order?.amount_due ? `Giá bán: ${money(order.amount_due)}` : ""].filter(Boolean)
    },
    dispatch_proposal_approved: {
      title: event.audience === "sale" ? "✅ Đề xuất đã được duyệt" : "🚗 Lệnh cần phân xe/tài xế",
      action: event.audience === "sale" ? "Theo dõi lệnh đã duyệt và bổ sung thông tin thương mại nếu còn thiếu." : "Chọn xe và tài xế phù hợp để phát hành chuyến.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, "Trạng thái: chờ phân xe/tài xế"].filter(Boolean)
    },
    dispatch_proposal_rejected: {
      title: "🔴 Đề xuất bị từ chối",
      action: "Xem lý do từ chối, chỉnh thông tin và gửi lại nếu cần.",
      info: [event.payload?.body || "Đề xuất chưa đủ điều kiện duyệt."]
    },
    driver_assigned: {
      title: event.audience === "driver" ? "🚗 Bạn được phân chuyến mới" : "✅ Đã phân xe/tài xế",
      action: event.audience === "driver" ? "Kiểm tra thông tin chuyến, bấm Nhận chuyến và xem Google Maps." : "Theo dõi tài xế nhận chuyến trước giờ chạy.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, ...assignment].filter(Boolean)
    },
    driver_assignment_replaced: {
      title: "🔄 Điều chỉnh xe/tài xế",
      action: event.audience === "driver" ? "Kiểm tra lại chuyến vì xe hoặc tài xế vừa được điều chỉnh." : "Theo dõi phân công mới và báo tài xế nếu sát giờ chạy.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, ...assignment].filter(Boolean)
    },
    trip_completed: {
      title: event.audience === "accountant" ? "💰 Chuyến chờ đối soát" : "✅ Chuyến đã hoàn thành",
      action: event.audience === "accountant" ? "Kiểm tra payment, thu hộ, chi phí phát sinh, hóa đơn và công nợ để chốt lệnh." : "Kiểm tra kết thúc chuyến và ghi nhận phát sinh vận hành nếu có.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, order?.amount_due ? `Giá bán: ${money(order.amount_due)}` : ""].filter(Boolean)
    },
    driver_trip_report_submitted: {
      title: "🧾 Tài xế đã gửi báo cáo chuyến",
      action: "Kiểm tra thu hộ và chi phí phát sinh trước khi chốt lệnh.",
      info: [
        order?.driver_collected_amount ? `Thu hộ: ${money(order.driver_collected_amount)}` : "",
        driverReportedCost ? `Chi phí phát sinh: ${money(driverReportedCost)}` : "",
        order?.driver_expense_note ? `Ghi chú: ${order.driver_expense_note}` : ""
      ].filter(Boolean)
    },
    urgent_driver_proposal_submitted: {
      title: "🔴 CHUYẾN GẤP TỪ TÀI XẾ",
      action: "Xử lý ngay, gọi xác nhận và duyệt nhanh nếu đủ điều kiện chạy.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, order?.source_owner_name ? `Tài xế báo: ${order.source_owner_name}` : "", event.payload?.body || ""].filter(Boolean)
    },
    urgent_driver_proposal_needs_sales_completion: {
      title: "🟠 Chuyến gấp cần bổ sung thương mại",
      action: "Bổ sung giá bán, nguồn khách, hóa đơn và điều khoản thanh toán sau khi điều hành xử lý vận hành.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, order?.source_owner_name ? `Tạo bởi: ${order.source_owner_name}` : ""].filter(Boolean)
    },
    driver_proposal_submitted: {
      title: "🟡 Cuốc mới từ tài xế",
      action: "Kiểm tra khách, giá bán, nguồn khách và chuyển thành đề xuất điều xe nếu phù hợp.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, order?.source_owner_name ? `Tài xế báo: ${order.source_owner_name}` : ""].filter(Boolean)
    },
    driver_proposal_promoted_to_dispatch: {
      title: "🟠 Lệnh mới từ cuốc tài xế",
      action: "Kiểm tra và duyệt hoặc từ chối đề xuất.",
      info: [route ? `Tuyến: ${route}` : "", ...routeDetails, order?.source_owner_name ? `Nguồn: ${order.source_owner_name}` : ""].filter(Boolean)
    }
  };
  return rules[type] || {
    title: event.payload?.title || type || "Angel One Ops",
    action: "Mở Angel One Ops để kiểm tra và xử lý bước tiếp theo.",
    info: [event.payload?.body || ""].filter(Boolean)
  };
}

async function formatMessage(event) {
  const payload = event.payload || {};
  const details = await getOrderDetails(event);
  const { order } = details;
  const rule = eventRule(event, details);
  const code = order?.code || payload.orderCode || payload.code || "";
  const customer = order ? [order.customer_name, order.contact_phone].filter(Boolean).join(" / ") : "";
  const time = order?.start_at ? formatDateTime(order.start_at) + (order.end_at ? " - " + formatDateTime(order.end_at) : "") : "";
  const url = actionUrl(event, order);
  const map = mapsUrl(order);
  const lines = [
    `<b>${escapeHtml(rule.title)}</b>`,
    "",
    `Việc cần làm: ${escapeHtml(rule.action)}`,
    code ? `Thông tin: <b>${escapeHtml(code)}</b>` : "",
    customer ? `Khách: ${escapeHtml(customer)}` : "",
    time ? `Giờ chạy: ${escapeHtml(time)}` : "",
    ...(rule.info || []).map((line) => escapeHtml(line)),
    map ? `Google Maps: ${escapeHtml(map)}` : "",
    `Thao tác: ${escapeHtml(url)}`
  ].filter((line) => line !== "");
  return lines.join("\n");
}

function dedupeKeyFor(event, text) {
  const payload = event.payload || {};
  const entity = event.entity_id || payload.entityId || "no-entity";
  return [event.event_type || "", entity, payload.title || "", payload.body || "", text].join("::");
}

async function sendTelegram(chatId, text) {
  try {
    return await httpRequest({
      method: "POST",
      url: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      headers: { "Content-Type": "application/json" },
      body: { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false },
      json: true
    });
  } catch (error) {
    throw new Error(`telegram failed: ${error.message}`);
  }
}

const claimed = await supabaseRpc("claim_pending_integration_events", { p_limit: 10 });
const events = Array.isArray(claimed) ? claimed : [];
const results = [];
let sentMessages = 0;

async function reserveDelivery(event, recipient, dedupeKey, channel = "telegram") {
  return await optionalSupabaseRpc("reserve_integration_delivery", {
    p_event_id: event.id,
    p_channel: channel,
    p_recipient_key: recipient.recipientKey,
    p_dedupe_key: dedupeKey
  }, true);
}

async function markDeliverySent(recipient, dedupeKey, response, channel = "telegram") {
  await optionalSupabaseRpc("mark_integration_delivery_sent", {
    p_channel: channel,
    p_recipient_key: recipient.recipientKey,
    p_dedupe_key: dedupeKey,
    p_provider_message_id: response?.result?.message_id ? String(response.result.message_id) : null
  }, null);
}

async function markDeliveryFailed(recipient, dedupeKey, error, channel = "telegram") {
  await optionalSupabaseRpc("mark_integration_delivery_failed", {
    p_channel: channel,
    p_recipient_key: recipient.recipientKey,
    p_dedupe_key: dedupeKey,
    p_error: error.message || String(error)
  }, null);
}

async function alertAdminOnce(event, errorMessage) {
  const recipient = {
    chatId: TELEGRAM_CHAT_ADMIN,
    recipientKey: `admin:${TELEGRAM_CHAT_ADMIN}`,
    label: "Telegram admin",
    type: "admin"
  };
  const dedupeKey = [event.id, event.event_type, "recipient_error", errorMessage].join("::");
  const reserved = await reserveDelivery(event, recipient, dedupeKey, "telegram_admin_alert");
  if (!reserved) return "skipped_duplicate_admin_alert";
  const text = [
    "<b>Can cau hinh nguoi nhan Telegram</b>",
    `Event: <b>${escapeHtml(event.event_type || event.id)}</b>`,
    `Audience: ${escapeHtml(event.audience || "-")}`,
    `Loi: ${escapeHtml(errorMessage)}`,
    event.entity_id ? `Lenh: ${escapeHtml(event.entity_id)}` : ""
  ].filter(Boolean).join("\n");
  const response = await sendTelegram(TELEGRAM_CHAT_ADMIN, text);
  await markDeliverySent(recipient, dedupeKey, response, "telegram_admin_alert");
  sentMessages += 1;
  return "admin_alert_sent";
}

for (const event of events) {
  if (!v1EventTypes.has(event.event_type)) {
    await supabaseRpc("mark_integration_event_sent", { p_event_id: event.id });
    results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "skipped_non_v1" });
    continue;
  }

  const { recipients, error: recipientError } = await resolveRecipients(event);
  if (recipients.length === 0) {
    const errorMessage = recipientError || "Khong tim thay nguoi nhan Telegram";
    const adminAlert = await alertAdminOnce(event, errorMessage);
    await supabaseRpc("mark_integration_event_failed", { p_event_id: event.id, p_error: errorMessage });
    results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "failed_no_recipient", error: errorMessage, adminAlert });
    continue;
  }

  const text = await formatMessage(event);
  const dedupeKey = dedupeKeyFor(event, text);
  const eventResults = [];

  for (const recipient of recipients) {
    const reserved = await reserveDelivery(event, recipient, dedupeKey);
    if (!reserved) {
      eventResults.push({ recipient: recipient.recipientKey, status: "skipped_duplicate_delivery" });
      continue;
    }

    try {
      const response = await sendTelegram(recipient.chatId, text);
      await markDeliverySent(recipient, dedupeKey, response);
      sentMessages += 1;
      eventResults.push({ recipient: recipient.recipientKey, status: "sent" });
    } catch (error) {
      await markDeliveryFailed(recipient, dedupeKey, error);
      eventResults.push({ recipient: recipient.recipientKey, status: "failed", error: error.message });
    }
  }

  const failedDelivery = eventResults.find((item) => item.status === "failed");
  if (failedDelivery) {
    await supabaseRpc("mark_integration_event_failed", { p_event_id: event.id, p_error: failedDelivery.error });
    results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "failed", deliveries: eventResults });
  } else {
    await supabaseRpc("mark_integration_event_sent", { p_event_id: event.id });
    results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "sent", deliveries: eventResults });
  }
}

return [{ json: { claimed: events.length, sentMessages, results } }];
