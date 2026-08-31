const vars = typeof $vars !== "undefined" ? $vars : {};
const env = typeof $env !== "undefined" ? $env : {};
const readConfig = (name) => vars[name] || env[name];

const SUPABASE_URL = readConfig("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = readConfig("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_BOT_TOKEN = readConfig("TELEGRAM_BOT_TOKEN");
const APP_URL = (readConfig("APP_URL") || "https://carmanagement-seven.vercel.app").replace(/\/$/, "");

const chatByAudience = {
  admin: readConfig("TELEGRAM_CHAT_ADMIN"),
  manager: readConfig("TELEGRAM_CHAT_MANAGER") || readConfig("TELEGRAM_CHAT_ADMIN"),
  dispatcher: readConfig("TELEGRAM_CHAT_DISPATCHER") || readConfig("TELEGRAM_CHAT_ADMIN"),
  sale: readConfig("TELEGRAM_CHAT_SALE") || readConfig("TELEGRAM_CHAT_ADMIN"),
  accountant: readConfig("TELEGRAM_CHAT_ACCOUNTANT") || readConfig("TELEGRAM_CHAT_ADMIN"),
  driver: readConfig("TELEGRAM_CHAT_DRIVER") || readConfig("TELEGRAM_CHAT_ADMIN")
};

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
assertEnv("TELEGRAM_CHAT_ADMIN", chatByAudience.admin);

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
    const driver = order?.driver_id ? await getRow("app_drivers", "id,full_name,phone,status", order.driver_id) : null;
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
const deliveryGroups = new Map();

for (const event of events) {
  if (!v1EventTypes.has(event.event_type)) {
    await supabaseRpc("mark_integration_event_sent", { p_event_id: event.id });
    results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "skipped_non_v1" });
    continue;
  }
  const chatId = chatByAudience[event.audience] || chatByAudience.admin;
  const text = await formatMessage(event);
  const dedupeKey = dedupeKeyFor(event, text);
  const groupKey = `${chatId}::${dedupeKey}`;
  const group = deliveryGroups.get(groupKey) || { chatId, text, dedupeKey, events: [] };
  group.events.push(event);
  deliveryGroups.set(groupKey, group);
}

for (const group of deliveryGroups.values()) {
  const reserved = await optionalSupabaseRpc("reserve_integration_delivery", {
    p_event_id: group.events[0].id,
    p_channel: "telegram",
    p_recipient_key: String(group.chatId),
    p_dedupe_key: group.dedupeKey
  }, true);

  if (!reserved) {
    for (const event of group.events) {
      await supabaseRpc("mark_integration_event_sent", { p_event_id: event.id });
      results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "skipped_duplicate_delivery" });
    }
    continue;
  }

  try {
    const response = await sendTelegram(group.chatId, group.text);
    await optionalSupabaseRpc("mark_integration_delivery_sent", {
      p_channel: "telegram",
      p_recipient_key: String(group.chatId),
      p_dedupe_key: group.dedupeKey,
      p_provider_message_id: response?.result?.message_id ? String(response.result.message_id) : null
    }, null);
    for (const event of group.events) {
      await supabaseRpc("mark_integration_event_sent", { p_event_id: event.id });
      results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "sent" });
    }
  } catch (error) {
    await optionalSupabaseRpc("mark_integration_delivery_failed", {
      p_channel: "telegram",
      p_recipient_key: String(group.chatId),
      p_dedupe_key: group.dedupeKey,
      p_error: error.message
    }, null);
    for (const event of group.events) {
      await supabaseRpc("mark_integration_event_failed", { p_event_id: event.id, p_error: error.message });
      results.push({ id: event.id, event_type: event.event_type, audience: event.audience, status: "failed", error: error.message });
    }
  }
}

return [{ json: { claimed: events.length, sentMessages: deliveryGroups.size, results } }];
