import { money } from "@/lib/domain";
import type { AppNotification, Assignment, DispatchOrder, DispatchPriority, DispatchRouteLeg, DispatchStatus, Driver, InvoiceStatus, Payment, QuoteStatus, Vehicle } from "@/lib/types";
import { roleLabels, type AppRole } from "@/lib/permissions";

export const storageKey = "angel-one-travel-ops-state-v1";

export const dispatchLabels: Record<DispatchStatus, string> = {
  waiting_assignment: "Chờ phân xe",
  assigned: "Đã phân",
  driver_accepted: "Tài xế nhận",
  in_progress: "Đang chạy",
  completed: "Hoàn thành",
  cancelled: "Đã hủy"
};

export const orderStatusLabels: Record<DispatchOrder["orderStatus"], string> = {
  draft: "Nháp sale",
  pending_dispatch_review: "Chờ điều hành duyệt",
  confirmed: "Đã duyệt",
  cancelled: "Đã hủy"
};

export const paymentLabels: Record<DispatchOrder["paymentStatus"], string> = {
  unpaid: "Chưa thu",
  partial: "Thu một phần",
  paid: "Đã thu",
  refunded: "Đã hoàn"
};

export const quoteLabels: Record<QuoteStatus, string> = {
  draft: "Nháp",
  sent: "Đã gửi",
  approved: "Khách duyệt",
  rejected: "Từ chối",
  expired: "Hết hạn"
};

export const priorityLabels: Record<DispatchPriority, string> = {
  normal: "Thường",
  high: "Cao",
  urgent: "Gấp"
};

export const invoiceLabels: Record<InvoiceStatus, string> = {
  not_required: "Không HĐ",
  pending_info: "Thiếu TT HĐ",
  ready_to_issue: "Chờ xuất",
  issued: "Đã xuất",
  voided: "HĐ hủy"
};

export const contractTypeLabels: Record<NonNullable<DispatchOrder["contractType"]>, string> = {
  simple: "Hợp đồng giản đơn",
  template: "Hợp đồng mẫu",
  terms: "Hợp đồng điều khoản"
};

export const ownerCompanyProfile = {
  legalName: "CÔNG TY TNHH ANGEL ONE TRAVEL",
  taxCode: "0402198423",
  address: "Số 111/3 Nguyễn Công Trứ, phường An Hải, thành phố Đà Nẵng, Việt Nam",
  phone: "0978638227",
  bankAccount: "282826999",
  bankName: "MB"
};

export const defaultOrderManagerName = "Nguyễn Quang Nam";
export const salesOwnerOptions = ["Phan Thị Bích Hà", "Đặng Thị Hồng Tiên", "Lê Hoàn Nin Hy"];

export const serviceOptions = [
  { code: "DVVT", label: "Dịch vụ vận tải" },
  { code: "DVHL", label: "Dịch vụ lữ hành" },
  { code: "DVHT", label: "Dịch vụ hợp tác" },
  { code: "DVCT", label: "Dịch vụ cho thuê" }
] as const;
export type ServiceCode = (typeof serviceOptions)[number]["code"];

export const guestMarketOptions = [
  { value: "domestic", code: "NĐ", label: "Khách Nội Địa" },
  { value: "international", code: "QT", label: "Khách Quốc Tế" },
  { value: "mixed", code: "NĐQT", label: "Khách Nội Địa + Quốc Tế" }
] as const;

export const customerRecognitionOptions = [
  { value: "DL", label: "DL - Khách du lịch / khách du lịch đoàn" },
  { value: "CT", label: "CT - Khách tổ chức công ty / khách đoàn hội nghị" },
  { value: "GD", label: "GĐ - Khách gia đình" },
  { value: "KL", label: "KL - Khách lẻ" }
] as const;

export const customerSourceCodeOptions = [
  { value: "T", code: "T", label: "T - Nguồn khách Tour" },
  { value: "DDH", code: "ĐDH", label: "ĐDH - Khách theo đơn đặt hàng vận chuyển" }
] as const;

export const provinceCodeOptions = [
  { value: "DAD", label: "DAD - Đà Nẵng" },
  { value: "QNH", label: "QNH - Quảng Nam / Hội An" },
  { value: "HUE", label: "HUE - Huế" },
  { value: "HAN", label: "HAN - Hà Nội" },
  { value: "SGN", label: "SGN - TP.HCM" },
  { value: "QYN", label: "QYN - Quy Nhơn" }
] as const;

export const paymentMethodLabels: Record<Payment["method"], string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  card: "Thẻ",
  other: "Khác"
};

const collectionNotePrefix = "Ghi chú thu hộ:";
const extraChargeReasonPrefix = "Lý do phụ phí phát sinh:";

export function driverReportNoteParts(note?: string) {
  const raw = (note || "").trim();
  if (!raw) return { collectionNote: "", extraChargeReason: "" };
  const collectionLine = raw.split("\n").find((line) => line.trim().startsWith(collectionNotePrefix));
  const extraChargeLine = raw.split("\n").find((line) => line.trim().startsWith(extraChargeReasonPrefix));
  if (!collectionLine && !extraChargeLine) return { collectionNote: raw, extraChargeReason: "" };
  return {
    collectionNote: collectionLine?.replace(collectionNotePrefix, "").trim() || "",
    extraChargeReason: extraChargeLine?.replace(extraChargeReasonPrefix, "").trim() || ""
  };
}

export function buildDriverReportNote(collectionNote: string, extraChargeReason: string) {
  return [
    collectionNote ? `${collectionNotePrefix} ${collectionNote}` : "",
    extraChargeReason ? `${extraChargeReasonPrefix} ${extraChargeReason}` : ""
  ].filter(Boolean).join("\n");
}

export const tabs = ["Dashboard", "Lệnh điều xe", "Điều hành", "Màn làm việc", "Users", "Khách hàng", "Tài chính", "Master data", "Audit"] as const;
export type Tab = (typeof tabs)[number];

export const roleHomeTab: Record<AppRole, Tab> = {
  sale: "Lệnh điều xe",
  dispatcher: "Điều hành",
  driver: "Màn làm việc",
  accountant: "Tài chính",
  manager: "Dashboard",
  admin: "Dashboard"
};

export const roleVisibleTabs: Record<AppRole, Tab[]> = {
  sale: ["Lệnh điều xe", "Khách hàng"],
  dispatcher: ["Điều hành"],
  driver: ["Màn làm việc"],
  accountant: ["Tài chính"],
  manager: ["Dashboard", "Điều hành", "Tài chính", "Lệnh điều xe"],
  admin: ["Dashboard", "Điều hành", "Tài chính", "Lệnh điều xe", "Users", "Khách hàng", "Master data", "Audit"]
};

export const roleTabLabels: Partial<Record<AppRole, Partial<Record<Tab, string>>>> = {
  sale: {
    "Lệnh điều xe": "Lệnh của tôi",
    "Khách hàng": "Khách hàng"
  },
  dispatcher: {
    "Điều hành": "Bảng điều hành",
    "Lệnh điều xe": "Hồ sơ lệnh"
  },
  driver: {
    "Màn làm việc": "Hôm nay"
  },
  accountant: {
    "Tài chính": "Cần xử lý"
  },
  manager: {
    "Dashboard": "Tổng quan",
    "Điều hành": "Điều hành",
    "Tài chính": "Tài chính",
    "Lệnh điều xe": "Lệnh"
  },
  admin: {
    "Dashboard": "Tổng quan",
    "Điều hành": "Điều hành",
    "Tài chính": "Tài chính",
    "Lệnh điều xe": "Lệnh",
    "Users": "Users",
    "Master data": "Dữ liệu",
    "Audit": "Audit"
  }
};

export function tabLabel(tab: Tab, role: AppRole) {
  return roleTabLabels[role]?.[tab] ?? tab;
}

export function canViewTab(tab: Tab, role: AppRole) {
  return roleVisibleTabs[role].includes(tab);
}

export const vietnamTimeZone = "Asia/Ho_Chi_Minh";

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: vietnamTimeZone,
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function vietnamDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: vietnamTimeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(value);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    day: map.get("day") ?? "01",
    month: map.get("month") ?? "01",
    year: map.get("year") ?? "1970",
    hour: map.get("hour") ?? "00",
    minute: map.get("minute") ?? "00"
  };
}

export function vietnamDateKey(value = new Date()) {
  const parts = vietnamDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function vietnamDateTimeLabel(value = new Date()) {
  const parts = vietnamDateParts(value);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function vietnamDateTimeLiveLabel(value = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: vietnamTimeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(value);
}

export function vietnamFriendlyDate(value = new Date()) {
  const parts = vietnamDateParts(value);
  const weekday = new Intl.DateTimeFormat("vi-VN", {
    timeZone: vietnamTimeZone,
    weekday: "long"
  }).format(value);
  return `${weekday}, ${parts.day}/${parts.month}/${parts.year}`;
}

export function vietnamMonthLabel(value = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: vietnamTimeZone,
    month: "long",
    year: "numeric"
  }).format(value);
}

export function vietnamDateTimeLocalValue(value = new Date()) {
  const parts = vietnamDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function timeOnly(value: string) {
  return new Date(value).toLocaleTimeString("vi-VN", {
    timeZone: vietnamTimeZone,
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function dateOnly(value: string) {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: vietnamTimeZone
  });
}

export function dateKey(value: Date) {
  return vietnamDateKey(value);
}

export function inputDateValue(value: Date) {
  return vietnamDateKey(value);
}

export function orderDateKey(order: DispatchOrder) {
  return dateKey(new Date(order.startAt));
}

export const defaultOrderTimes = {
  startAt: vietnamDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)),
  endAt: vietnamDateTimeLocalValue(new Date(Date.now() + 4 * 60 * 60 * 1000))
};

export function getMonthCells(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function calendarEventClass(order: DispatchOrder) {
  if (order.dispatchStatus === "cancelled") return "bg-rose-600 text-white";
  if (order.dispatchStatus === "waiting_assignment") return "bg-amber-500 text-white";
  if (order.dispatchStatus === "completed") return "bg-emerald-600 text-white";
  if (order.dispatchStatus === "in_progress") return "bg-cyan-600 text-white";
  return "bg-blue-600 text-white";
}

export function hourOffset(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

export function durationMinutes(order: DispatchOrder) {
  return Math.max(30, Math.round((new Date(order.endAt).getTime() - new Date(order.startAt).getTime()) / 60000));
}

export function toIsoFromInput(value: string) {
  return new Date(value).toISOString();
}

export function toDateTimeInput(value: string) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function parseRouteLegs(form: FormData): DispatchRouteLeg[] {
  const starts = form.getAll("routeLegStartAt").map((value) => String(value || ""));
  const ends = form.getAll("routeLegEndAt").map((value) => String(value || ""));
  const pickups = form.getAll("routeLegPickup").map((value) => String(value || "").trim());
  const dropoffs = form.getAll("routeLegDropoff").map((value) => String(value || "").trim());
  const notes = form.getAll("routeLegNote").map((value) => String(value || "").trim());

  return pickups
    .map((pickup, index) => ({
      startAt: starts[index] ? toIsoFromInput(starts[index]) : undefined,
      endAt: ends[index] ? toIsoFromInput(ends[index]) : undefined,
      pickup,
      dropoff: dropoffs[index] || "",
      note: notes[index] || undefined
    }))
    .filter((leg) => leg.pickup || leg.dropoff);
}

export function primaryLegValues(routeLegs: DispatchRouteLeg[], fallbackStartAt: string, fallbackEndAt: string) {
  const first = routeLegs[0];
  const last = routeLegs[routeLegs.length - 1] ?? first;
  return {
    startAt: first?.startAt ?? (fallbackStartAt ? toIsoFromInput(fallbackStartAt) : ""),
    endAt: last?.endAt ?? (fallbackEndAt ? toIsoFromInput(fallbackEndAt) : ""),
    pickup: first?.pickup ?? "",
    dropoff: last?.dropoff ?? ""
  };
}

export function routeLegsForOrder(order: DispatchOrder): DispatchRouteLeg[] {
  return order.routeLegs?.length ? order.routeLegs : [{ pickup: order.pickup, dropoff: order.dropoff, startAt: order.startAt, endAt: order.endAt }];
}

export function routeSummaryForOrder(order: DispatchOrder) {
  const legs = routeLegsForOrder(order);
  if (legs.length === 0) return `${order.pickup} → ${order.dropoff}`;
  const points = [legs[0]?.pickup, ...legs.map((leg) => leg.dropoff)].filter(Boolean);
  return points.filter((point, index) => index === 0 || point !== points[index - 1]).join(" → ");
}

export function mapsRouteUrlForOrder(order: DispatchOrder) {
  const legs = routeLegsForOrder(order);
  const origin = legs[0]?.pickup || order.pickup;
  const destination = legs[legs.length - 1]?.dropoff || order.dropoff;
  const waypoints = legs.slice(0, -1).map((leg) => leg.dropoff).filter(Boolean);
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving"
  });
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function mapsRouteUrlForLeg(leg: DispatchRouteLeg) {
  const params = new URLSearchParams({
    api: "1",
    origin: leg.pickup || "-",
    destination: leg.dropoff || "-",
    travelmode: "driving"
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function appOrderActionUrl(order: DispatchOrder, view = "dispatch") {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams({ view, order: order.id });
  return `${window.location.origin}/?${params.toString()}`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function telegramHtml(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function buildDispatchProposalIntegrationPayload(order: DispatchOrder, audience: AppNotification["audience"]) {
  const legs = routeLegsForOrder(order);
  const actionLabel = audience === "dispatcher" ? "Duyệt xe / phân tài xế" : "Xem và xử lý lệnh";
  const actionUrl = appOrderActionUrl(order, "dispatch");
  const routePayload = legs.map((leg, index) => ({
    index: index + 1,
    label: `Chặng ${index + 1}: ${leg.pickup || "-"} -> ${leg.dropoff || "-"}`,
    time: `${leg.startAt ? formatDateTime(leg.startAt) : "-"} - ${leg.endAt ? formatDateTime(leg.endAt) : "-"}`,
    pickup: leg.pickup || "-",
    dropoff: leg.dropoff || "-",
    note: leg.note || "",
    maps_url: mapsRouteUrlForLeg(leg),
    maps_label: `Mở Google Maps chặng ${index + 1}`
  }));
  const routeText = routePayload.flatMap((leg) => [
    `${leg.label}`,
    `Thời gian: ${leg.time}`,
    `Google Maps: ${leg.maps_label}`
  ]);
  const textLines = [
    "Lệnh chờ điều hành duyệt",
    "Việc cần làm: Kiểm tra thông tin lệnh và duyệt hoặc từ chối.",
    `Thông tin: ${order.code}`,
    `Khách: ${order.contactName || order.customerName} / ${order.contactPhone}`,
    `Giá bán: ${money(order.amountDue)}`,
    "",
    ...routeText,
    "",
    `Thao tác: ${actionLabel}`
  ];
  const htmlLines = [
    "<b>Lệnh chờ điều hành duyệt</b>",
    "Việc cần làm: Kiểm tra thông tin lệnh và duyệt hoặc từ chối.",
    `Thông tin: <b>${telegramHtml(order.code)}</b>`,
    `Khách: ${telegramHtml(order.contactName || order.customerName)} / ${telegramHtml(order.contactPhone)}`,
    `Giá bán: ${telegramHtml(money(order.amountDue))}`,
    "",
    ...routePayload.flatMap((leg) => [
      `<b>${telegramHtml(leg.label)}</b>`,
      `Thời gian: ${telegramHtml(leg.time)}`,
      `Google Maps: <a href="${escapeHtml(leg.maps_url)}">${telegramHtml(leg.maps_label)}</a>`
    ]),
    "",
    `Thao tác: <a href="${escapeHtml(actionUrl)}">${telegramHtml(actionLabel)}</a>`
  ];

  return {
    telegram: {
      parse_mode: "HTML",
      message_text: textLines.join("\n"),
      message_html: htmlLines.join("\n")
    },
    action: {
      label: actionLabel,
      url: actionUrl
    },
    order: {
      id: order.id,
      code: order.code,
      customer_name: order.contactName || order.customerName,
      customer_phone: order.contactPhone,
      amount_due: order.amountDue,
      amount_due_label: money(order.amountDue)
    },
    route_legs: routePayload
  };
}

export function resolveOrderTransport(order: DispatchOrder, assignments: Assignment[], vehicles: Vehicle[], drivers: Driver[]) {
  const activeAssignment = assignments.find((assignment) => assignment.dispatchOrderId === order.id && assignment.status === "active");
  const vehicle = vehicles.find((item) => item.id === (activeAssignment?.vehicleId || order.vehicleId));
  const driver = drivers.find((item) => item.id === (activeAssignment?.driverId || order.driverId));
  return {
    vehiclePlate: order.externalVehiclePlate || order.vehiclePlateNo || vehicle?.plateNo || "-",
    driverName: order.externalDriverName || order.driverFullName || driver?.fullName || "-",
    driverPhone: order.externalDriverPhone || order.driverPhone || driver?.phone || "-",
    driverCccd: order.driverCccd || driver?.cccd || "-",
    vehicleOwnership: vehicle?.ownershipType,
    ownerName: vehicle?.ownerName,
    ownerCccd: vehicle?.ownerCccd,
    supplierInvoiceRequired: vehicle?.supplierInvoiceRequired,
    supplierCompanyName: vehicle?.supplierCompanyName,
    supplierTaxCode: vehicle?.supplierTaxCode,
    supplierAddress: vehicle?.supplierAddress,
    supplierPhone: vehicle?.supplierPhone,
    supplierBankAccount: vehicle?.supplierBankAccount,
    supplierBankName: vehicle?.supplierBankName
  };
}

export function paymentCollectorInfo(payment: Payment, order: DispatchOrder, transport: ReturnType<typeof resolveOrderTransport>) {
  const raw = (payment.collector || "").trim();
  const normalized = raw.toLocaleLowerCase("vi-VN");
  const isDriver = normalized.includes("tài") || normalized.includes("tai") || normalized.includes("driver");
  const isDispatch = normalized.includes("điều") || normalized.includes("dieu") || normalized.includes("ban");
  const isCompany = !raw || normalized.includes("công") || normalized.includes("cong") || normalized.includes("company") || normalized.includes("khách") || normalized.includes("khach");

  if (isDriver) return { type: "Tài xế thu", name: transport.driverName };
  if (isDispatch) return { type: "Ban điều hành", name: raw || order.sourceOwnerName || "-" };
  if (isCompany) return { type: "Công ty thu", name: order.collectionAccountOwner || ownerCompanyProfile.legalName };
  return { type: raw, name: raw };
}

export function routeLinesForOrder(order: DispatchOrder) {
  return routeLegsForOrder(order).map((leg, index) => {
    const time = [leg.startAt ? formatDateTime(leg.startAt) : "", leg.endAt ? formatDateTime(leg.endAt) : ""].filter(Boolean).join(" - ");
    const note = leg.note ? ` (${leg.note})` : "";
    return `Chặng ${index + 1}: ${time ? `${time} / ` : ""}${leg.pickup || "-"} -> ${leg.dropoff || "-"}${note}`;
  });
}

export function customerConfirmationText(order: DispatchOrder) {
  return [
    "CÔNG TY TNHH ANGEL ONE TRAVEL",
    "",
    "PHIẾU THÔNG TIN KHÁCH HÀNG",
    `Loại hợp đồng: ${contractTypeLabels[order.contractType ?? "simple"]}`,
    `Tên khách hàng / người sử dụng: ${order.customerName}`,
    `SĐT: ${order.contactPhone}`,
    order.customerCccd ? `Số CCCD: ${order.customerCccd}` : "Số CCCD: Không cung cấp",
    order.invoiceRequired ? `Tên công ty: ${order.companyName || "-"}` : "",
    order.invoiceRequired ? `MST: ${order.taxCode || "-"}` : "",
    order.invoiceRequired ? `Địa chỉ: ${order.companyAddress || "-"}` : "",
    order.invoiceRequired ? `STK: ${order.companyBankAccount || order.customerBankAccount || "-"}` : "",
    order.invoiceRequired ? `Tên ngân hàng: ${order.companyBankName || order.customerBankName || "-"}` : "",
    "",
    "Thông tin dịch vụ:",
    `Mã dịch vụ: ${order.serviceCode || "-"}`,
    `Dịch vụ: ${order.serviceLabel}`,
    `Đơn vị tính: ${order.unit || "Chuyến"}`,
    ...routeLinesForOrder(order),
    order.serviceClarification ? `Nội dung làm rõ: ${order.serviceClarification}` : "",
    "",
    "Thanh toán:",
    `Tiền trước thuế: ${money(order.subtotalAmount ?? order.amountDue)}`,
    `VAT: ${order.vatRate ?? 0}% / ${money(order.vatAmount ?? 0)}`,
    `Tổng thanh toán: ${money(order.amountDue)}`,
    order.customerConfirmationNote ? `Lưu ý xác nhận: ${order.customerConfirmationNote}` : ""
  ].filter(Boolean).join("\n");
}

export function finalDispatchOrderText(order: DispatchOrder) {
  return [
    `LỆNH ĐIỀU XE ${order.code}`,
    `Ngày lệnh: ${order.orderDate || "-"}`,
    `Nguồn: ${order.sourceOwnerName || order.salesOwner} / ${order.source}`,
    `Loại hợp đồng: ${contractTypeLabels[order.contractType ?? "simple"]}`,
    "",
    "Khách hàng:",
    `${order.customerName} / ${order.contactPhone}`,
    `Công ty: ${order.companyName || "-"}`,
    `MST: ${order.taxCode || "-"}`,
    "",
    "Hành trình:",
    ...routeLinesForOrder(order),
    `Dịch vụ: ${order.serviceCode || "-"} / ${order.serviceLabel} / ${order.unit || "Chuyến"}`,
    "",
    "Xe / tài xế:",
    `Hình thức xe: ${order.vehicleOwnership === "rented" ? "Thuê ngoài" : "Xe công ty"}`,
    `Biển số: ${order.externalVehiclePlate || order.vehiclePlateNo || order.vehicleId || "-"}`,
    `Tài xế: ${order.externalDriverName || order.driverFullName || order.driverId || "-"} / ${order.externalDriverPhone || order.driverPhone || "-"}`,
    "",
    "Tài chính:",
    `Tiền trước thuế: ${money(order.subtotalAmount ?? order.amountDue)}`,
    `VAT: ${order.vatRate ?? 0}% / ${money(order.vatAmount ?? 0)}`,
    `Tổng thanh toán: ${money(order.amountDue)}`,
    `Thu hộ tài xế: ${money(order.driverCollectedAmount ?? 0)}`,
    `Chi phí dự kiến: ${money(orderCost(order))}`,
    `Chi phí thực tế: ${money(orderActualCost(order))}`,
    `Công nợ/đối soát: ${paymentLabels[order.paymentStatus]} / ${invoiceLabels[order.invoiceStatus]}`
  ].join("\n");
}

export function buildCode(index: number, orderDate = vietnamDateKey()) {
  const dateCode = orderDate.replaceAll("-", "").slice(2);
  return `AOT-${dateCode}-${String(index).padStart(4, "0")}`;
}

export function orderMonthCode(orderDate = vietnamDateKey()) {
  const [year, month] = orderDate.split("-");
  return `${month ?? "01"}.${year ?? new Date().getFullYear()}`;
}

export function guestMarketCode(value?: DispatchOrder["guestMarket"]) {
  return guestMarketOptions.find((item) => item.value === value)?.code ?? "NĐ";
}

export function guestMarketLabel(value?: DispatchOrder["guestMarket"]) {
  return guestMarketOptions.find((item) => item.value === value)?.label ?? "-";
}

export function customerSourceCodeLabel(value?: DispatchOrder["customerSourceCode"]) {
  return customerSourceCodeOptions.find((item) => item.value === value || item.code === value)?.code ?? "ĐDH";
}

export function customerRecognitionFullLabel(value?: DispatchOrder["customerRecognitionCode"]) {
  const item = customerRecognitionOptions.find((option) => option.value === value);
  return item ? item.label.replace("GĐ", "GD") : "-";
}

export function customerSourceFullLabel(value?: DispatchOrder["customerSourceCode"]) {
  const item = customerSourceCodeOptions.find((option) => option.value === value || option.code === value);
  return item ? item.label : "ĐDH - Khách theo đơn đặt hàng vận chuyển";
}

export function provinceCodeFullLabel(value?: string) {
  const code = (value || "").toUpperCase();
  const item = provinceCodeOptions.find((option) => option.value === code);
  return item ? item.label : code || "-";
}

export function provinceNameLabel(value?: string) {
  return provinceCodeFullLabel(value).replace(/^[A-Z]+ - /, "");
}

export function provinceRouteFullLabel(origin?: string, destination?: string) {
  return `${provinceNameLabel(origin)} - ${provinceNameLabel(destination)}`;
}

export function buildTransportCode(index: number, input: {
  orderDate?: string;
  guestMarket?: DispatchOrder["guestMarket"];
  customerRecognitionCode?: DispatchOrder["customerRecognitionCode"];
  customerSourceCode?: DispatchOrder["customerSourceCode"];
  originProvinceCode?: string;
  destinationProvinceCode?: string;
}) {
  return [
    `V${String(index).padStart(4, "0")}`,
    orderMonthCode(input.orderDate),
    guestMarketCode(input.guestMarket),
    input.customerRecognitionCode || "DL",
    customerSourceCodeLabel(input.customerSourceCode),
    `${(input.originProvinceCode || "DAD").toUpperCase()}-${(input.destinationProvinceCode || "QNH").toUpperCase()}`
  ].join("/");
}

export function safeOrderFileCode(code: string) {
  return code.replace(/[\\/]/g, "-");
}

export function orderCost(order: DispatchOrder) {
  return (order.driverCost ?? 0) + (order.vehicleCost ?? 0) + (order.otherCost ?? 0);
}

export function orderProfit(order: DispatchOrder) {
  return order.amountDue - orderCost(order);
}

export function orderActualCost(order: DispatchOrder) {
  return (order.actualDriverCost ?? 0) + (order.actualVehicleCost ?? 0) + (order.actualOtherCost ?? 0);
}

export function orderActualProfit(order: DispatchOrder) {
  const actualCost = orderActualCost(order);
  return order.amountDue - (actualCost > 0 ? actualCost : orderCost(order));
}

export function orderMargin(order: DispatchOrder) {
  if (order.amountDue <= 0) return 0;
  return orderProfit(order) / order.amountDue;
}

export function statusTone(order: DispatchOrder) {
  if (order.dispatchStatus === "completed") return "good";
  if (order.dispatchStatus === "waiting_assignment") return "warn";
  if (order.dispatchStatus === "cancelled") return "danger";
  return "info";
}

export function quoteTone(status?: QuoteStatus): "neutral" | "info" | "good" | "warn" | "danger" {
  if (status === "approved") return "good";
  if (status === "sent") return "info";
  if (status === "rejected") return "danger";
  if (status === "expired") return "warn";
  return "neutral";
}

export function orderStatusTone(status: DispatchOrder["orderStatus"]): "neutral" | "info" | "good" | "warn" | "danger" {
  if (status === "confirmed") return "good";
  if (status === "pending_dispatch_review") return "warn";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export function present(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function orderReadiness(order: DispatchOrder) {
  const salesMissing = [
    ["Ngày lệnh", order.orderDate],
    ["Khách hàng", order.customerName],
    ["SĐT liên hệ", order.contactPhone],
    ["Điểm đón", order.pickup],
    ["Điểm trả", order.dropoff],
    ["Dịch vụ", order.serviceLabel],
    ["Giờ bắt đầu", order.startAt],
    ["Giờ kết thúc", order.endAt],
    ["Nguồn", order.source],
    ["Sale phụ trách", order.salesOwner],
    ["Giá bán", order.amountDue > 0 ? order.amountDue : ""]
  ].filter(([, value]) => !present(value)).map(([label]) => String(label));

  const hasDriver = present(order.driverId) || present(order.driverFullName);
  const hasVehicle = present(order.vehicleId) || present(order.vehiclePlateNo);
  const dispatchMissing = [
    ["Xe/biển số", hasVehicle ? "ok" : ""],
    ["Tài xế", hasDriver ? "ok" : ""],
    ["SĐT tài xế", present(order.driverId) || present(order.driverPhone) ? "ok" : ""]
  ].filter(([, value]) => !present(value)).map(([label]) => String(label));

  if (order.vehicleOwnership === "rented") {
    [
      ["Chủ xe/NCC", order.supplierOwnerName],
      ["SĐT NCC", order.supplierPhone],
      ["Tổng tiền mua gồm VAT", order.supplierTotalWithVat && order.supplierTotalWithVat > 0 ? order.supplierTotalWithVat : ""]
    ].forEach(([label, value]) => {
      if (!present(value)) dispatchMissing.push(String(label));
    });
  }

  const accountingMissing = [
    ["Hình thức thanh toán", order.paymentMethod],
    ["Đối tượng thu", order.payer],
    ["Chủ tài khoản thu", order.collectionAccountOwner],
    ["Số tài khoản thu", order.collectionBankAccount],
    ["Ngân hàng thu", order.collectionBankName]
  ].filter(([, value]) => !present(value)).map(([label]) => String(label));

  if (order.invoiceRequired) {
    [
      ["Tên công ty xuất HĐ", order.companyName || order.customerName],
      ["MST", order.taxCode],
      ["Email HĐ", order.billingEmail],
      ["Địa chỉ xuất HĐ", order.companyAddress || order.customerAddress]
    ].forEach(([label, value]) => {
      if (!present(value)) accountingMissing.push(String(label));
    });
  }

  return [
    {
      label: "Tạo đề xuất",
      description: "Đủ để Sale gửi lệnh vào hàng chờ.",
      missing: salesMissing
    },
    {
      label: "Phát hành xe",
      description: "Đủ để Điều hành phát chuyến cho tài xế.",
      missing: dispatchMissing
    },
    {
      label: "Chốt kế toán",
      description: "Đủ để đối soát, hóa đơn và công nợ.",
      missing: accountingMissing
    }
  ];
}

export function driverActionLabel(order: DispatchOrder) {
  if (order.dispatchStatus === "assigned" || order.dispatchStatus === "waiting_assignment") return "Nhận chuyến";
  if (order.dispatchStatus === "driver_accepted") return "Bắt đầu chạy";
  if (order.dispatchStatus === "in_progress") return "Hoàn thành";
  if (order.dispatchStatus === "completed") return "Đã hoàn thành";
  return "Đã hủy";
}

export function driverActionDetail(order: DispatchOrder) {
  if (order.dispatchStatus === "assigned" || order.dispatchStatus === "waiting_assignment") return "Tài xế cần xác nhận chuyến trước giờ chạy.";
  if (order.dispatchStatus === "driver_accepted") return "Chuyến đã được nhận, chuẩn bị xuất phát.";
  if (order.dispatchStatus === "in_progress") return "Xe đang chạy, khi xong thì chốt chuyến.";
  if (order.dispatchStatus === "completed") return "Chuyến đã xong.";
  return "Chuyến này đã bị hủy.";
}

export function driverNextDispatchStatus(order: DispatchOrder): DispatchStatus | null {
  if (order.dispatchStatus === "assigned") return "driver_accepted";
  if (order.dispatchStatus === "driver_accepted") return "in_progress";
  if (order.dispatchStatus === "in_progress") return "completed";
  return null;
}

export const resourceStatusLabels: Record<Vehicle["status"], string> = {
  active: "Sẵn sàng",
  maintenance: "Bảo dưỡng",
  inactive: "Ngưng",
  leave: "Nghỉ"
};

export const vehicleOwnershipLabels: Record<NonNullable<Vehicle["ownershipType"]>, string> = {
  company: "Chính chủ",
  partner: "Hợp tác",
  rented: "Thuê ngoài"
};

export function vehicleOptionLabel(vehicle: Vehicle) {
  const ownership = vehicle.ownershipType ? vehicleOwnershipLabels[vehicle.ownershipType] : "Chưa phân loại";
  return `${vehicle.plateNo} - ${vehicle.seats} chỗ / ${ownership} / ${resourceStatusLabels[vehicle.status] ?? vehicle.status}`;
}

export function driverOptionLabel(driver: Driver, vehicles: Vehicle[]) {
  const defaultVehicle = vehicles.find((vehicle) => vehicle.defaultDriverId === driver.id);
  const vehicleLabel = defaultVehicle ? `${defaultVehicle.plateNo} - ${defaultVehicle.seats} chỗ` : "chưa gắn xe mặc định";
  return `${driver.fullName} / ${driver.phone} / ${vehicleLabel} / ${resourceStatusLabels[driver.status] ?? driver.status}`;
}
