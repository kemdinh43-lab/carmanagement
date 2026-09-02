"use client";

import {
  AlertTriangle,
  Banknote,
  Bell,
  CalendarClock,
  Car,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  MapPin,
  Navigation,
  PhoneCall,
  Plus,
  ReceiptText,
  RefreshCw,
  Route,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UserPlus,
  UserRound,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  assignments as seedAssignments,
  auditEvents as seedAuditEvents,
  companies as seedCompanies,
  companyContacts as seedCompanyContacts,
  customers as seedCustomers,
  drivers as seedDrivers,
  orders as seedOrders,
  payments as seedPayments,
  vehicles as seedVehicles
} from "@/data/demo";
import { hasSupabaseBrowserConfig } from "@/lib/config";
import { calculatePaymentStatus, canMoveDispatchStatus, findAssignmentConflict, getOperationalAlerts, money } from "@/lib/domain";
import { emptyOpsState } from "@/lib/empty-ops-state";
import {
  assignVehicleDriver,
  cancelOrder as cancelOrderCommand,
  closeOrder,
  createCompany as createCompanyCommand,
  createCustomer as createCustomerCommand,
  createDriver as createDriverCommand,
  createVehicle as createVehicleCommand,
  canRunCommand,
  commandCatalog,
  recordPayment as recordPaymentCommand,
  reviewDispatchProposal as reviewDispatchProposalCommand,
  submitDriverDispatchProposal,
  submitDriverTripReport as submitDriverTripReportCommand,
  submitDispatchProposal,
  updateActualCosts as updateActualCostsCommand,
  updateDispatchStatus as updateDispatchStatusCommand,
  updateInvoiceStatus as updateInvoiceStatusCommand,
  updateOrderDetails,
  updateQuoteStatus as updateQuoteStatusCommand,
  type OpsCommand
} from "@/lib/commands/ops-commands";
import { can, roleLabels, type AppRole } from "@/lib/permissions";
import { createOpsRepository } from "@/lib/repositories/ops-repository";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AdminUsersPanel } from "@/components/admin-users-panel";
import type {
  Assignment,
  AuditEvent,
  AppNotification,
  Company,
  CompanyContact,
  Customer,
  DispatchOrder,
  DispatchRouteLeg,
  DispatchStatus,
  Driver,
  InvoiceStatus,
  OpsState,
  Payment,
  QuoteStatus,
  DispatchPriority,
  Vehicle
} from "@/lib/types";

const storageKey = "angel-one-travel-ops-state-v1";
const supabaseConfigured = hasSupabaseBrowserConfig();

const dispatchLabels: Record<DispatchStatus, string> = {
  waiting_assignment: "Chờ phân xe",
  assigned: "Đã phân",
  driver_accepted: "Tài xế nhận",
  in_progress: "Đang chạy",
  completed: "Hoàn thành",
  cancelled: "Đã hủy"
};

const orderStatusLabels: Record<DispatchOrder["orderStatus"], string> = {
  draft: "Nháp sale",
  pending_dispatch_review: "Chờ điều hành duyệt",
  confirmed: "Đã duyệt",
  cancelled: "Đã hủy"
};

const paymentLabels: Record<DispatchOrder["paymentStatus"], string> = {
  unpaid: "Chưa thu",
  partial: "Thu một phần",
  paid: "Đã thu",
  refunded: "Đã hoàn"
};

const quoteLabels: Record<QuoteStatus, string> = {
  draft: "Nháp",
  sent: "Đã gửi",
  approved: "Khách duyệt",
  rejected: "Từ chối",
  expired: "Hết hạn"
};

const priorityLabels: Record<DispatchPriority, string> = {
  normal: "Thường",
  high: "Cao",
  urgent: "Gấp"
};

const invoiceLabels: Record<InvoiceStatus, string> = {
  not_required: "Không HĐ",
  pending_info: "Thiếu TT HĐ",
  ready_to_issue: "Chờ xuất",
  issued: "Đã xuất",
  voided: "HĐ hủy"
};

const contractTypeLabels: Record<NonNullable<DispatchOrder["contractType"]>, string> = {
  simple: "Hợp đồng giản đơn",
  template: "Hợp đồng mẫu",
  terms: "Hợp đồng điều khoản"
};

const ownerCompanyProfile = {
  legalName: "CÔNG TY TNHH ANGEL ONE TRAVEL",
  taxCode: "0402198423",
  address: "Số 111/3 Nguyễn Công Trứ, phường An Hải, thành phố Đà Nẵng, Việt Nam",
  phone: "0978638227",
  bankAccount: "282826999",
  bankName: "MB"
};

const defaultOrderManagerName = "Nguyễn Quang Nam";
const salesOwnerOptions = ["Phan Thị Bích Hà", "Đặng Thị Hồng Tiên", "Lê Hoàn Nin Hy"];
const serviceOptions = [
  { code: "DVVT", label: "Dịch vụ vận tải" },
  { code: "DVHL", label: "Dịch vụ lữ hành" },
  { code: "DVHT", label: "Dịch vụ hợp tác" },
  { code: "DVCT", label: "Dịch vụ cho thuê" }
] as const;
type ServiceCode = (typeof serviceOptions)[number]["code"];
const guestMarketOptions = [
  { value: "domestic", code: "NĐ", label: "Khách Nội Địa" },
  { value: "international", code: "QT", label: "Khách Quốc Tế" },
  { value: "mixed", code: "NĐQT", label: "Khách Nội Địa + Quốc Tế" }
] as const;
const customerRecognitionOptions = [
  { value: "DL", label: "DL - Khách du lịch / khách du lịch đoàn" },
  { value: "CT", label: "CT - Khách tổ chức công ty / khách đoàn hội nghị" },
  { value: "GD", label: "GĐ - Khách gia đình" },
  { value: "KL", label: "KL - Khách lẻ" }
] as const;
const customerSourceCodeOptions = [
  { value: "T", code: "T", label: "T - Nguồn khách Tour" },
  { value: "DDH", code: "ĐDH", label: "ĐDH - Khách theo đơn đặt hàng vận chuyển" }
] as const;
const provinceCodeOptions = [
  { value: "DAD", label: "DAD - Đà Nẵng" },
  { value: "QNH", label: "QNH - Quảng Nam / Hội An" },
  { value: "HUE", label: "HUE - Huế" },
  { value: "HAN", label: "HAN - Hà Nội" },
  { value: "SGN", label: "SGN - TP.HCM" },
  { value: "QYN", label: "QYN - Quy Nhơn" }
] as const;

const paymentMethodLabels: Record<Payment["method"], string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  card: "Thẻ",
  other: "Khác"
};

const tabs = ["Dashboard", "Lệnh điều xe", "Điều hành", "Màn làm việc", "Users", "Khách hàng", "Tài chính", "Master data", "Audit"] as const;
type Tab = (typeof tabs)[number];

function canViewTab(tab: Tab, role: AppRole) {
  if (tab === "Dashboard") return role !== "driver";
  if (tab === "Lệnh điều xe") return role !== "driver";
  if (tab === "Điều hành") return can(role, "assign_vehicle");
  if (tab === "Màn làm việc") return true;
  if (tab === "Users") return role === "admin";
  if (tab === "Khách hàng") return can(role, "create_order");
  if (tab === "Tài chính") return can(role, "record_payment") || can(role, "update_invoice") || can(role, "close_order");
  if (tab === "Master data") return can(role, "manage_master_data");
  if (tab === "Audit") return can(role, "view_audit");
  return false;
}

const initialState: OpsState = {
  vehicles: seedVehicles,
  drivers: seedDrivers,
  customers: seedCustomers,
  companies: seedCompanies,
  companyContacts: seedCompanyContacts,
  orders: seedOrders,
  assignments: seedAssignments,
  payments: seedPayments,
  auditEvents: seedAuditEvents,
  notifications: []
};

const runtimeInitialState = supabaseConfigured ? emptyOpsState : initialState;

function normalizeState(state: OpsState): OpsState {
  const fallbackState = supabaseConfigured ? emptyOpsState : initialState;
  const orders = state.orders ?? fallbackState.orders;

  return {
    ...state,
    vehicles: state.vehicles ?? fallbackState.vehicles,
    drivers: state.drivers ?? fallbackState.drivers,
    customers: state.customers ?? fallbackState.customers,
    companies: state.companies ?? fallbackState.companies,
    companyContacts: state.companyContacts ?? fallbackState.companyContacts,
    assignments: state.assignments ?? fallbackState.assignments,
    payments: state.payments ?? fallbackState.payments,
    auditEvents: state.auditEvents ?? fallbackState.auditEvents,
    notifications: state.notifications ?? [],
    orders: orders.map((order) => ({
      ...order,
      customerKind: order.customerKind ?? (order.companyName ? "company" : "individual"),
      customerName: order.customerName || order.companyName || "Khách chưa đặt tên",
      contactName: order.contactName ?? (order.companyName ? order.customerName : undefined)
    }))
  };
}

function sameOpsState(a: OpsState, b: OpsState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

type StaticPinKind = "pickup" | "dropoff";

type StaticPinPoint = {
  kind: StaticPinKind;
  label: string;
  address: string;
  note: string;
  lat: number;
  lng: number;
};

const staticLocationRules: Array<{ aliases: string[]; label: string; note: string; lat: number; lng: number }> = [
  { aliases: ["da nang airport", "sân bay da nang", "sân bay đà nẵng", "airport"], label: "Da Nang Airport", note: "Sân bay / điểm đón nhanh", lat: 16.0439, lng: 108.1992 },
  { aliases: ["four seasons nam hai", "nam hai"], label: "Four Seasons Nam Hai", note: "Khu resort ven biển", lat: 15.9114, lng: 108.3459 },
  { aliases: ["hyatt regency", "hyatt"], label: "Hyatt Regency Da Nang", note: "Khách sạn / điểm đón doanh nghiệp", lat: 16.0118, lng: 108.2663 },
  { aliases: ["ba na hills", "ba na"], label: "Ba Na Hills", note: "Tuyến tham quan / ngoại thành", lat: 15.9951, lng: 107.9964 },
  { aliases: ["intercontinental", "intercontinental da nang"], label: "InterContinental Da Nang", note: "Resort / tuyến khách cao cấp", lat: 16.0908, lng: 108.2519 },
  { aliases: ["hoi an ancient town", "hoi an"], label: "Hoi An Ancient Town", note: "Phố cổ / điểm trả khách", lat: 15.8801, lng: 108.3386 },
  { aliases: ["da nang", "danang"], label: "Da Nang", note: "Khu trung tâm thành phố", lat: 16.0544, lng: 108.2022 },
  { aliases: ["hue"], label: "Hue", note: "Liên tỉnh / tuyến dài", lat: 16.4637, lng: 107.5909 },
  { aliases: ["quy nhon"], label: "Quy Nhon", note: "Liên tỉnh / tuyến dài", lat: 13.7829, lng: 109.2194 }
];

function normalizeLocationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash << 5) - hash + value.charCodeAt(index);
  return Math.abs(hash);
}

function baseLocationForText(value: string) {
  const normalized = normalizeLocationText(value);
  const match = staticLocationRules.find((rule) => rule.aliases.some((alias) => normalized.includes(alias)));
  if (match) return { lat: match.lat, lng: match.lng };
  if (normalized.includes("hue")) return { lat: 16.4637, lng: 107.5909 };
  if (normalized.includes("quy nhon")) return { lat: 13.7829, lng: 109.2194 };
  if (normalized.includes("hoi an")) return { lat: 15.8801, lng: 108.3386 };
  return { lat: 16.0544, lng: 108.2022 };
}

function resolveStaticLocation(value: string, kind: StaticPinKind): StaticPinPoint {
  const normalized = normalizeLocationText(value);
  const match = staticLocationRules.find((rule) => rule.aliases.some((alias) => normalized.includes(alias)));
  const base = match ?? { label: value || (kind === "pickup" ? "Điểm đón" : "Điểm trả"), note: kind === "pickup" ? "Điểm đón cố định" : "Điểm trả cố định", ...baseLocationForText(value) };
  const seed = hashString(`${kind}:${normalized}`);
  const latOffset = ((seed % 1000) / 1000 - 0.5) * 0.14;
  const lngOffset = (((seed / 1000) % 1000) / 1000 - 0.5) * 0.18;

  return {
    kind,
    label: base.label,
    address: value,
    note: base.note,
    lat: base.lat + latOffset,
    lng: base.lng + lngOffset
  };
}

function buildStaticPinPoints(order: DispatchOrder) {
  const pickup = resolveStaticLocation(order.pickup, "pickup");
  const dropoff = resolveStaticLocation(order.dropoff, "dropoff");
  return [pickup, dropoff];
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earth = 6371;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "danger" | "info" }) {
  const toneClass = {
    neutral: "border-slate-200 bg-white text-slate-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-cyan-200 bg-cyan-50 text-cyan-800"
  }[tone];

  return <span className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium ${toneClass}`}>{children}</span>;
}

function StatCard({ label, value, icon: Icon, detail }: { label: string; value: string; icon: typeof Car; detail: string }) {
  return (
    <section className="border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-md bg-teal-50 text-brand">
          <Icon size={20} />
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-500">{detail}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function SectionDetails({
  badge,
  children,
  defaultOpen = true,
  description,
  title
}: {
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  description?: string;
  title: string;
}) {
  return (
    <details className="rounded-lg border border-line bg-white p-3 shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{title}</p>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {badge && <Badge tone="info">{badge}</Badge>}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function RouteLegFields({ initialLegs }: { initialLegs?: DispatchRouteLeg[] }) {
  function normalizeDateTimeInput(value?: string) {
    if (!value) return "";
    return value.length > 16 ? toDateTimeInput(value) : value;
  }

  const [legs, setLegs] = useState<DispatchRouteLeg[]>(() => {
    const normalized = initialLegs?.length ? initialLegs : [{ pickup: "", dropoff: "", startAt: defaultOrderTimes.startAt, endAt: defaultOrderTimes.endAt }];
    return normalized.map((leg) => ({
      ...leg,
      startAt: normalizeDateTimeInput(leg.startAt),
      endAt: normalizeDateTimeInput(leg.endAt)
    }));
  });
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1] ?? firstLeg;

  function updateLeg(index: number, patch: Partial<DispatchRouteLeg>) {
    setLegs((current) => current.map((leg, legIndex) => (legIndex === index ? { ...leg, ...patch } : leg)));
  }

  function addLeg() {
    setLegs((current) => {
      const previous = current[current.length - 1];
      return [...current, { pickup: previous?.dropoff ?? "", dropoff: "", startAt: previous?.endAt ?? "", endAt: "", note: "" }];
    });
  }

  function removeLeg(index: number) {
    setLegs((current) => current.filter((_, legIndex) => legIndex !== index));
  }

  return (
    <div className="space-y-3 md:col-span-full">
      <input name="pickup" type="hidden" value={firstLeg?.pickup ?? ""} />
      <input name="dropoff" type="hidden" value={lastLeg?.dropoff ?? ""} />
      <input name="startAt" type="hidden" value={firstLeg?.startAt ?? ""} />
      <input name="endAt" type="hidden" value={lastLeg?.endAt ?? ""} />
      {legs.map((leg, index) => (
        <div className="border border-line bg-white p-3" key={index}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Chặng {index + 1}</p>
            {legs.length > 1 && (
              <button className="h-8 rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => removeLeg(index)} type="button">
                Xóa
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Ngày/giờ bắt đầu"><input className={inputClass()} name="routeLegStartAt" onChange={(event) => updateLeg(index, { startAt: event.target.value })} required={index === 0} type="datetime-local" value={leg.startAt ?? ""} /></Field>
            <Field label="Ngày/giờ kết thúc dự kiến"><input className={inputClass()} name="routeLegEndAt" onChange={(event) => updateLeg(index, { endAt: event.target.value })} required={index === legs.length - 1} type="datetime-local" value={leg.endAt ?? ""} /></Field>
            <Field label="Điểm đi"><input className={inputClass()} name="routeLegPickup" onChange={(event) => updateLeg(index, { pickup: event.target.value })} required value={leg.pickup} /></Field>
            <Field label="Điểm đến"><input className={inputClass()} name="routeLegDropoff" onChange={(event) => updateLeg(index, { dropoff: event.target.value })} required value={leg.dropoff} /></Field>
            <div className="md:col-span-2">
              <Field label="Ghi chú chặng"><input className={inputClass()} name="routeLegNote" onChange={(event) => updateLeg(index, { note: event.target.value })} placeholder="Flight, điểm chờ, khách lên/xuống, yêu cầu riêng..." value={leg.note ?? ""} /></Field>
            </div>
          </div>
        </div>
      ))}
      <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-brand hover:bg-teal-50" onClick={addLeg} type="button">
        <Plus size={16} /> Thêm chặng
      </button>
    </div>
  );
}

function serviceOptionFromCode(code?: string) {
  return serviceOptions.find((option) => option.code === code) ?? null;
}

function serviceOptionFromLabel(label?: string) {
  return serviceOptions.find((option) => option.label === label) ?? null;
}

function serviceOptionFor(code?: string, label?: string) {
  return serviceOptionFromCode(code) ?? serviceOptionFromLabel(label) ?? serviceOptions[0];
}

function ServiceFields({ initialCode, initialLabel }: { initialCode?: string; initialLabel?: string }) {
  const [selectedCode, setSelectedCode] = useState(() => serviceOptionFor(initialCode, initialLabel).code);
  const selected = serviceOptionFor(selectedCode);

  return (
    <>
      <Field label="Mã dịch vụ">
        <select className={inputClass()} name="serviceCode" onChange={(event) => setSelectedCode(event.target.value as ServiceCode)} value={selected.code}>
          {serviceOptions.map((option) => <option key={option.code} value={option.code}>{option.code}</option>)}
        </select>
      </Field>
      <Field label="Dịch vụ">
        <select className={inputClass()} name="serviceLabel" onChange={(event) => setSelectedCode(serviceOptionFromLabel(event.target.value)?.code ?? serviceOptions[0].code)} required value={selected.label}>
          {serviceOptions.map((option) => <option key={option.code} value={option.label}>{option.label}</option>)}
        </select>
      </Field>
    </>
  );
}

function VatCalculatorFields({ initialSubtotal = 0, initialVatRate = 0, initialTotal = 0 }: { initialSubtotal?: number; initialVatRate?: number; initialTotal?: number }) {
  const startingTotal = initialTotal || (initialSubtotal ? Math.round(initialSubtotal * (1 + initialVatRate / 100)) : 0);
  const startingSubtotal = initialSubtotal || (startingTotal ? Math.round(startingTotal / (1 + initialVatRate / 100)) : 0);
  const [subtotal, setSubtotal] = useState(startingSubtotal);
  const [vatRate, setVatRate] = useState(initialVatRate);
  const [total, setTotal] = useState(startingTotal);
  const [basis, setBasis] = useState<"subtotal" | "total">("total");
  const vatAmount = Math.max(0, total - subtotal);

  function changeSubtotal(value: number) {
    const nextSubtotal = Number.isFinite(value) ? value : 0;
    setBasis("subtotal");
    setSubtotal(nextSubtotal);
    setTotal(Math.round(nextSubtotal * (1 + vatRate / 100)));
  }

  function changeVatRate(value: number) {
    const nextRate = Number.isFinite(value) ? value : 0;
    setVatRate(nextRate);
    if (basis === "subtotal") {
      setTotal(Math.round(subtotal * (1 + nextRate / 100)));
      return;
    }
    setSubtotal(Math.round(total / (1 + nextRate / 100)));
  }

  function changeTotal(value: number) {
    const nextTotal = Number.isFinite(value) ? value : 0;
    setBasis("total");
    setTotal(nextTotal);
    setSubtotal(Math.round(nextTotal / (1 + vatRate / 100)));
  }

  return (
    <>
      <Field label="Tiền trước thuế"><input className={inputClass()} min="0" name="subtotalAmount" onChange={(event) => changeSubtotal(Number(event.target.value))} type="number" value={subtotal} /></Field>
      <Field label="VAT">
        <select className={inputClass()} name="vatRate" onChange={(event) => changeVatRate(Number(event.target.value))} value={vatRate}>
          <option value={0}>0% / Không VAT</option>
          <option value={5}>5%</option>
          <option value={8}>8%</option>
          <option value={10}>10%</option>
        </select>
      </Field>
      <Field label="Tiền thuế"><input className={inputClass()} min="0" name="vatAmount" readOnly type="number" value={vatAmount} /></Field>
      <Field label="Tổng thanh toán"><input className={inputClass()} min="0" name="amountDue" onChange={(event) => changeTotal(Number(event.target.value))} required type="number" value={total} /></Field>
    </>
  );
}

function DocumentPreview({ title, body }: { title: string; body: string }) {
  return (
    <section className="border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{title}</p>
        <Badge tone="info">Preview</Badge>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-white p-3 text-xs leading-5 text-slate-700">{body}</pre>
    </section>
  );
}

function FinalDispatchOrderSheet({
  assignments = [],
  drivers = [],
  order,
  payments,
  vehicles = []
}: {
  assignments?: Assignment[];
  drivers?: Driver[];
  order: DispatchOrder;
  payments: Payment[];
  vehicles?: Vehicle[];
}) {
  const startDate = dateOnly(order.startAt);
  const startTime = timeOnly(order.startAt);
  const endDate = dateOnly(order.endAt);
  const endTime = timeOnly(order.endAt);
  const routeText = routeSummaryForOrder(order);
  const pdfRouteText = routeText.replaceAll("→", "->");
  const validPayments = payments
    .filter((payment) => payment.orderId === order.id && payment.status === "valid")
    .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
  const paid = validPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const debt = Math.max(order.amountDue - paid, 0);
  const routeLegRows = routeLegsForOrder(order).map((leg, index) => ({
    group: "Hành trình",
    label: `Chặng ${index + 1}`,
    value: `${leg.startAt ? formatDateTime(leg.startAt) : "-"}${leg.endAt ? ` - ${formatDateTime(leg.endAt)}` : ""} / ${leg.pickup || "-"} -> ${leg.dropoff || "-"}${leg.note ? ` / ${leg.note}` : ""}`
  }));
  const transport = resolveOrderTransport(order, assignments, vehicles, drivers);
  const vehicleLabel = transport.vehiclePlate;
  const driverLabel = transport.driverName;
  const driverPhone = transport.driverPhone;
  const driverCccd = transport.driverCccd;
  const isRentedVehicle = order.vehicleOwnership === "rented" || transport.vehicleOwnership === "partner" || transport.vehicleOwnership === "rented";
  const ownerName = isRentedVehicle
    ? order.supplierOwnerName || transport.ownerName || order.supplierCompanyName || "-"
    : ownerCompanyProfile.legalName;
  const supplierCompanyName = isRentedVehicle
    ? order.supplierCompanyName || transport.supplierCompanyName || ownerName
    : ownerCompanyProfile.legalName;
  const supplierTaxCode = isRentedVehicle ? order.supplierTaxCode || transport.supplierTaxCode || "-" : ownerCompanyProfile.taxCode || "-";
  const supplierAddress = isRentedVehicle ? order.supplierAddress || transport.supplierAddress || "-" : ownerCompanyProfile.address || "-";
  const supplierPhone = isRentedVehicle ? order.supplierPhone || transport.supplierPhone || "-" : ownerCompanyProfile.phone || "-";
  const supplierBankAccount = isRentedVehicle ? order.supplierBankAccount || transport.supplierBankAccount || "-" : ownerCompanyProfile.bankAccount || "-";
  const supplierBankName = isRentedVehicle ? order.supplierBankName || transport.supplierBankName || "-" : ownerCompanyProfile.bankName || "-";
  const supplierInvoiceRequired = isRentedVehicle ? order.supplierInvoiceRequired ?? transport.supplierInvoiceRequired ?? true : true;
  const supplierTotal = isRentedVehicle ? order.supplierTotalWithVat ?? orderCost(order) : orderActualCost(order) || orderCost(order);
  const paymentRows = (validPayments.length > 0
    ? validPayments.flatMap((payment, index) => {
        const collector = paymentCollectorInfo(payment, order, transport);
        return [
          { group: `Thanh toán lần ${index + 1}`, label: "Đối tượng thu: Công ty thu; tài xế thu; Ban điều hành", value: collector.type },
          { group: `Thanh toán lần ${index + 1}`, label: "Tên người thu", value: collector.name },
          { group: `Thanh toán lần ${index + 1}`, label: "Số tiền thu", value: money(payment.amount) },
          { group: `Thanh toán lần ${index + 1}`, label: "Hình thức thu", value: paymentMethodLabels[payment.method] },
          { group: `Thanh toán lần ${index + 1}`, label: "Thời gian thu", value: formatDateTime(payment.paidAt) },
          { group: `Thanh toán lần ${index + 1}`, label: "Số tài khoản thu (Công ty; Khác; tài xế)", value: payment.bankAccount || order.collectionBankAccount || "-" },
          { group: `Thanh toán lần ${index + 1}`, label: "Ngân hàng thu", value: payment.bankName || order.collectionBankName || "-" },
          { group: `Thanh toán lần ${index + 1}`, label: "Thời gian nhập", value: [payment.reference, payment.note].filter(Boolean).join(" / ") || "-" }
        ];
      })
    : [
        { group: "Thanh toán lần 1", label: "Đối tượng thu: Công ty thu; tài xế thu; Ban điều hành", value: "Chưa ghi nhận thanh toán" },
        { group: "Thanh toán lần 1", label: "Tên người thu", value: order.collectionAccountOwner || ownerCompanyProfile.legalName },
        { group: "Thanh toán lần 1", label: "Số tiền thu", value: money(0) },
        { group: "Thanh toán lần 1", label: "Hình thức thu", value: order.paymentMethod || "-" },
        { group: "Thanh toán lần 1", label: "Thời gian thu", value: "-" },
        { group: "Thanh toán lần 1", label: "Số tài khoản thu (Công ty; Khác; tài xế)", value: order.collectionBankAccount || "-" },
        { group: "Thanh toán lần 1", label: "Ngân hàng thu", value: order.collectionBankName || "-" },
        { group: "Thanh toán lần 1", label: "Thời gian nhập", value: debt > 0 ? `Còn phải thu ${money(debt)}` : "-" }
      ]) satisfies Array<{ group: string; label: string; value: string }>;

  const rows: Array<{ group: string; label: string; value: string; tone?: "yellow" | "blue" }> = [
    { group: "Quản lý lệnh", label: "Quản lý lệnh", value: defaultOrderManagerName },
    { group: "Quản lý lệnh", label: "Số", value: order.code },
    { group: "Quản lý lệnh", label: "Ngày", value: order.orderDate || dateOnly(order.startAt) },
    { group: "Quản lý lệnh", label: "Nguồn (Sale; xe; ĐHXX; khác)", value: `${order.salesOwner} / ${order.source}` },
    { group: "Quản lý lệnh", label: "Tên người giao nguồn", value: order.sourceOwnerName || order.salesOwner || "-" },
    { group: "Quản lý lệnh", label: "Số lượng khách", value: String(order.guestCount ?? "-") },
    { group: "Quản lý lệnh", label: "Dòng khách", value: `${guestMarketCode(order.guestMarket)} - ${guestMarketLabel(order.guestMarket)}` },
    { group: "Quản lý lệnh", label: "Nhận biết khách", value: customerRecognitionFullLabel(order.customerRecognitionCode) },
    { group: "Quản lý lệnh", label: "Nguồn khách", value: customerSourceFullLabel(order.customerSourceCode) },
    { group: "Quản lý lệnh", label: "Mã tỉnh/thành", value: provinceRouteFullLabel(order.originProvinceCode, order.destinationProvinceCode) },
    { group: "Quản lý lệnh", label: "Có xuất hóa đơn không (Có; Không)", value: order.invoiceRequired ? "Có" : "Không", tone: "yellow" },
    { group: "Quản lý lệnh", label: "Hình thức xe (Công ty; Thuê ngoài)", value: order.vehicleOwnership === "rented" ? "Thuê ngoài" : "Công ty", tone: "blue" },
    { group: "Quản lý lệnh", label: "Loại hợp đồng (Mẫu; Giản đơn; Điều khoản)", value: contractTypeLabels[order.contractType ?? "simple"] },
    { group: "Thông tin xe", label: "Biển số xe", value: vehicleLabel },
    { group: "Thông tin xe", label: "Họ và tên tài xế", value: driverLabel },
    { group: "Thông tin xe", label: "CCCD", value: driverCccd },
    { group: "Thông tin xe", label: "Số điện thoại tài xế", value: driverPhone },
    { group: "Thông tin nhà cung cấp", label: "Họ và tên chủ sở hữu xe", value: ownerName, tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Số CCCD", value: isRentedVehicle ? order.supplierCccd || transport.ownerCccd || "-" : "-", tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Có xuất hóa đơn đầu vào được không (Có; không)", value: supplierInvoiceRequired ? "Có" : "Không", tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Tên đơn vị thuê ngoài", value: supplierCompanyName, tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Mã số thuế", value: supplierTaxCode, tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Địa chỉ", value: supplierAddress, tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Số điện thoại nhà cung cấp", value: supplierPhone, tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Tổng tiền mua", value: money(supplierTotal), tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Số tài khoản ngân hàng", value: supplierBankAccount, tone: "blue" },
    { group: "Thông tin nhà cung cấp", label: "Tên ngân hàng", value: supplierBankName, tone: "blue" },
    { group: "Thông tin khách hàng", label: "Họ và tên khách hàng", value: order.customerName },
    { group: "Thông tin khách hàng", label: "Số CCCD", value: order.customerCccd || "Không cung cấp" },
    { group: "Thông tin khách hàng", label: "Số điện thoại", value: order.contactPhone },
    { group: "Thông tin khách hàng", label: "Tên công ty", value: order.companyName || "-", tone: "yellow" },
    { group: "Thông tin khách hàng", label: "Mã số thuế", value: order.taxCode || "-", tone: "yellow" },
    { group: "Thông tin khách hàng", label: "Địa chỉ", value: order.companyAddress || order.customerAddress || "-", tone: "yellow" },
    { group: "Thông tin khách hàng", label: "Số tài khoản", value: order.companyBankAccount || order.customerBankAccount || "-", tone: "yellow" },
    { group: "Thông tin khách hàng", label: "Tên ngân hàng", value: order.companyBankName || order.customerBankName || "-", tone: "yellow" },
    { group: "Hành trình", label: "Ngày bắt đầu", value: startDate },
    { group: "Hành trình", label: "Giờ bắt đầu", value: startTime },
    { group: "Hành trình", label: "Ngày kết thúc", value: endDate },
    { group: "Hành trình", label: "Giờ kết thúc dự kiến", value: endTime },
    { group: "Hành trình", label: "Điểm đi", value: order.pickup },
    { group: "Hành trình", label: "Điểm đến", value: pdfRouteText || order.dropoff },
    ...routeLegRows,
    { group: "Hành trình", label: "Mã dịch vụ (DVVT; DVHL; DVHT; DVCT)", value: order.serviceCode || serviceOptionFor(undefined, order.serviceLabel).code },
    { group: "Hành trình", label: "Dịch vụ", value: serviceOptionFor(order.serviceCode, order.serviceLabel).label },
    { group: "Hành trình", label: "Nội dung làm rõ (Nếu có)", value: order.serviceClarification || order.customerConfirmationNote || "-", tone: "yellow" },
    { group: "Hành trình", label: "Đơn vị tính (Chuyến; Ngày; tháng; Kỳ)", value: order.unit || "Chuyến" },
    { group: "Hành trình", label: "Thuế suất %", value: `${order.vatRate ?? 0}%` },
    { group: "Hành trình", label: "Tiền hàng", value: money(order.subtotalAmount ?? order.amountDue) },
    { group: "Hành trình", label: "Tiền thuế", value: money(order.vatAmount ?? 0) },
    { group: "Hành trình", label: "Tổng thanh toán", value: money(order.amountDue) },
    { group: "Hành trình", label: "Hình thức thanh toán (TM/CK/TMCK/Đối trừ)", value: order.paymentMethod || "-" },
    { group: "Hành trình", label: "Số lần thanh toán", value: String(validPayments.length) },
    { group: "Hành trình", label: "Tổng đã thu", value: money(paid) },
    { group: "Hành trình", label: "Còn phải thu", value: money(debt) },
    { group: "Hành trình", label: "Trạng thái thanh toán", value: paymentLabels[order.paymentStatus] },
    ...paymentRows
  ];
  const exportStatus = order.reconciliationStatus === "closed" ? "Bản chính thức" : "Bản xem trước";
  const [isSendingPdfPayload, setIsSendingPdfPayload] = useState(false);

  function exportFinalOrder() {
    const fileCode = safeOrderFileCode(order.code);
    const bodyRows = rows.map((row) => {
      const background = row.tone === "yellow" ? "#fef08a" : row.tone === "blue" ? "#67e8f9" : "#ffffff";
      return `<tr style="background:${background}"><td>${escapeHtml(row.group)}</td><td>${escapeHtml(row.label)}</td><td><strong>${escapeHtml(row.value || "-")}</strong></td></tr>`;
    }).join("");
    const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Lệnh điều xe ${escapeHtml(order.code)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    h1 { text-align: center; font-size: 18px; margin: 0 0 12px; }
    .meta { margin-bottom: 12px; font-size: 12px; color: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f8fafc; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>LỆNH ĐIỀU XE</h1>
  <div class="meta">${escapeHtml(exportStatus)} / ${escapeHtml(order.code)} / Xuất lúc ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
  <table>
    <thead><tr><th>Nhóm</th><th>Thông tin</th><th>Giá trị</th></tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
    downloadTextFile(`lenh-dieu-xe-${fileCode}.html`, html, "text/html;charset=utf-8");
  }

  function buildFinalPdfData() {
    const driverExpenseTotal =
      (order.driverExpenseFuel ?? 0) +
      (order.driverExpenseToll ?? 0) +
      (order.driverExpenseParking ?? 0) +
      (order.driverExpenseWater ?? 0) +
      (order.driverExpenseOther ?? 0);

    const fileCode = safeOrderFileCode(order.code);
    return {
      delivery: {
        schema: "aot_final_dispatch_order_pdf_v1",
        generated_at: new Date().toISOString(),
        status: order.reconciliationStatus === "closed" ? "official" : "preview",
        filename: `Lenh_dieu_xe_${fileCode}.pdf`,
        telegram_caption: `Lệnh điều xe ${order.code} - ${order.customerName} - ${pdfRouteText}`,
        email_subject: `Lệnh điều xe ${order.code} - ${order.customerName}`,
        email_body: `Kính gửi,\n\nĐính kèm là lệnh điều xe ${order.code}.\n\nTrân trọng,\n${ownerCompanyProfile.legalName}`
      },
      order_no: order.code,
      order_date: order.orderDate ? dateOnly(`${order.orderDate}T00:00:00`) : dateOnly(order.startAt),
      city: "Đà Nẵng",
      management: {
        manager_1: defaultOrderManagerName,
        source: `${order.salesOwner} / ${order.source}`,
        dispatcher: order.sourceOwnerName || "-",
        guest_count: order.guestCount ?? "-",
        guest_market: `${guestMarketCode(order.guestMarket)} - ${guestMarketLabel(order.guestMarket)}`,
        customer_recognition_code: customerRecognitionFullLabel(order.customerRecognitionCode),
        customer_source_code: customerSourceFullLabel(order.customerSourceCode),
        province_route_code: provinceRouteFullLabel(order.originProvinceCode, order.destinationProvinceCode),
        output_invoice: order.invoiceRequired ? "Có" : "Không",
        vehicle_form: isRentedVehicle ? "Thuê ngoài" : "Công ty",
        contract_type: contractTypeLabels[order.contractType ?? "simple"]
      },
      vehicle: {
        plate: vehicleLabel,
        driver_name: driverLabel,
        driver_cccd: driverCccd,
        driver_phone: driverPhone
      },
      supplier: {
        owner_name: ownerName,
        owner_cccd: isRentedVehicle ? order.supplierCccd || transport.ownerCccd || "-" : "-",
        input_invoice: supplierInvoiceRequired ? "Có" : "Không",
        supplier_name: supplierCompanyName,
        tax_code: supplierTaxCode,
        address: supplierAddress,
        phone: supplierPhone,
        purchase_total: money(supplierTotal),
        bank_account: supplierBankAccount,
        bank_name: supplierBankName
      },
      customer: {
        name: order.customerName,
        cccd: order.customerCccd || "Không cung cấp",
        phone: order.contactPhone,
        company: order.companyName || "-",
        tax_code: order.taxCode || "-",
        address: order.companyAddress || order.customerAddress || "-",
        bank_account: order.companyBankAccount || order.customerBankAccount || "-",
        bank_name: order.companyBankName || order.customerBankName || "-"
      },
      trip: {
        start_date: startDate,
        start_time: startTime,
        end_date: endDate,
        end_time_expected: endTime,
        pickup: order.pickup,
        dropoff: pdfRouteText || order.dropoff,
        service_code: order.serviceCode || serviceOptionFor(undefined, order.serviceLabel).code,
        service_label: serviceOptionFor(order.serviceCode, order.serviceLabel).label,
        clarification: order.serviceClarification || order.customerConfirmationNote || "-",
        unit: order.unit || "Chuyến",
        tax_rate: `${order.vatRate ?? 0}%`,
        subtotal: money(order.subtotalAmount ?? order.amountDue),
        tax_amount: money(order.vatAmount ?? 0),
        total: money(order.amountDue),
        payment_method: order.paymentMethod || "-",
        route_legs: routeLegsForOrder(order).map((leg) => ({
          time: [leg.startAt ? timeOnly(leg.startAt) : "", leg.endAt ? timeOnly(leg.endAt) : ""].filter(Boolean).join("-") || "-",
          from: leg.pickup || "-",
          to: leg.dropoff || "-",
          note: leg.note || ""
        }))
      },
      payments: validPayments.map((payment) => {
        const collector = paymentCollectorInfo(payment, order, transport);
        return {
        collector_type: collector.type,
        collector_name: collector.name,
        amount: money(payment.amount),
        method: paymentMethodLabels[payment.method],
        paid_at: formatDateTime(payment.paidAt),
        bank_account: payment.bankAccount || order.collectionBankAccount || "-",
        bank_name: payment.bankName || order.collectionBankName || "-",
        entry_time_note: [payment.reference, payment.note].filter(Boolean).join(" / ") || "-",
        reference_note: [payment.reference, payment.note].filter(Boolean).join(" / ") || "-",
        note: [payment.reference, payment.note].filter(Boolean).join(" / ") || paymentMethodLabels[payment.method]
      };
      }),
      reconciliation: {
        receivable_total: money(order.amountDue),
        received_total: money(paid),
        receivable_remaining: money(debt),
        customer_payment_status: paymentLabels[order.paymentStatus],
        supplier_total: money(supplierTotal),
        supplier_paid: "-",
        supplier_remaining: isRentedVehicle ? money(supplierTotal) : "0 đ",
        extra_cost: money(driverExpenseTotal),
        actual_profit: money(orderActualProfit(order)),
        output_invoice_status: invoiceLabels[order.invoiceStatus],
        input_invoice_status: isRentedVehicle ? (supplierInvoiceRequired ? "Chưa nhận / cần đối soát" : "Không yêu cầu") : "Không áp dụng",
        reconciliation_status: order.reconciliationStatus === "closed" ? "Đã chốt" : "Đang mở",
        accounting_closed_at: order.reconciliationStatus === "closed" ? formatDateTime(new Date().toISOString()) : "-"
      }
    };
  }

  function exportFinalPdfData() {
    const pdfData = buildFinalPdfData();
    downloadTextFile(`lenh-dieu-xe-${order.code}-pdf-data.json`, JSON.stringify(pdfData, null, 2), "application/json;charset=utf-8");
  }

  async function sendFinalPdfPayload() {
    setIsSendingPdfPayload(true);
    try {
      const response = await fetch("/api/final-order-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFinalPdfData())
      });
      const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        window.alert(result?.error || `Chưa gửi được n8n: HTTP ${response.status}`);
        return;
      }

      window.alert(result?.message || "Đã gửi payload lệnh điều xe final sang n8n.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Chưa gửi được payload sang n8n.");
    } finally {
      setIsSendingPdfPayload(false);
    }
  }

  return (
    <section className="border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">Lệnh điều xe final</p>
        <div className="flex items-center gap-2">
          <Badge tone={order.reconciliationStatus === "closed" ? "good" : "info"}>{exportStatus}</Badge>
          <button className="h-8 rounded-md border border-line bg-white px-3 text-xs font-semibold text-brand hover:bg-teal-50" onClick={exportFinalOrder} type="button">
            Xuất lệnh
          </button>
          <button className="h-8 rounded-md border border-line bg-white px-3 text-xs font-semibold text-brand hover:bg-teal-50" onClick={exportFinalPdfData} type="button">
            Payload n8n
          </button>
          <button
            className="h-8 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSendingPdfPayload}
            onClick={sendFinalPdfPayload}
            type="button"
          >
            {isSendingPdfPayload ? "Đang gửi..." : "Gửi n8n"}
          </button>
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto border border-line bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs text-slate-800">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-white px-2 py-2 text-center text-base font-bold text-ink" colSpan={3}>LỆNH ĐIỀU XE</th>
            </tr>
            <tr className="bg-slate-50">
              <th className="w-40 border border-slate-300 px-2 py-1 font-semibold">Nhóm</th>
              <th className="w-80 border border-slate-300 px-2 py-1 font-semibold">Thông tin</th>
              <th className="border border-slate-300 px-2 py-1 font-semibold">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr className={row.tone === "yellow" ? "bg-yellow-100" : row.tone === "blue" ? "bg-cyan-100" : "bg-white"} key={`${row.group}-${row.label}-${index}`}>
                <td className="border border-slate-300 px-2 py-1 align-top text-slate-700">{row.group}</td>
                <td className="border border-slate-300 px-2 py-1 align-top">{row.label}</td>
                <td className="border border-slate-300 px-2 py-1 align-top font-medium text-ink">{row.value || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderDocumentPreviews({
  assignments,
  drivers,
  order,
  payments,
  vehicles
}: {
  assignments: Assignment[];
  drivers: Driver[];
  order: DispatchOrder;
  payments: Payment[];
  vehicles: Vehicle[];
}) {
  return (
    <SectionDetails
      badge="Sale/Kế toán"
      defaultOpen={false}
      description="Cùng một bộ dữ liệu lệnh, nhưng xuất thành phiếu gửi khách và lệnh điều xe final."
      title="Phiếu xác nhận & lệnh final"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <DocumentPreview body={customerConfirmationText(order)} title="Phiếu gửi khách xác nhận" />
        <FinalDispatchOrderSheet assignments={assignments} drivers={drivers} order={order} payments={payments} vehicles={vehicles} />
      </div>
    </SectionDetails>
  );
}

function inputClass() {
  return "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100";
}

function textAreaClass() {
  return "min-h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100";
}

function tabIcon(tab: Tab) {
  if (tab === "Dashboard") return CalendarClock;
  if (tab === "Lệnh điều xe") return ClipboardList;
  if (tab === "Điều hành") return Route;
  if (tab === "Màn làm việc") return Smartphone;
  if (tab === "Users") return UsersRound;
  if (tab === "Khách hàng") return UserRound;
  if (tab === "Tài chính") return Banknote;
  if (tab === "Master data") return Car;
  return ShieldCheck;
}

function statusTone(order: DispatchOrder) {
  if (order.dispatchStatus === "completed") return "good";
  if (order.dispatchStatus === "waiting_assignment") return "warn";
  if (order.dispatchStatus === "cancelled") return "danger";
  return "info";
}

function quoteTone(status?: QuoteStatus): "neutral" | "info" | "good" | "warn" | "danger" {
  if (status === "approved") return "good";
  if (status === "sent") return "info";
  if (status === "rejected") return "danger";
  if (status === "expired") return "warn";
  return "neutral";
}

function orderStatusTone(status: DispatchOrder["orderStatus"]): "neutral" | "info" | "good" | "warn" | "danger" {
  if (status === "confirmed") return "good";
  if (status === "pending_dispatch_review") return "warn";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function StaticPinMap({ compact = false, order }: { compact?: boolean; order: DispatchOrder }) {
  const points = useMemo(() => buildStaticPinPoints(order), [order]);
  const routeUrl = useMemo(() => mapsRouteUrlForOrder(order), [order]);
  const pickupUrl = useMemo(() => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.pickup)}`, [order.pickup]);
  const dropoffUrl = useMemo(() => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.dropoff)}`, [order.dropoff]);
  const estimatedDistance = Math.round(haversineKm(points[0], points[1]) * 10) / 10;

  return (
    <section className="border border-line bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div>
          <p className="text-sm font-semibold text-ink">Thông tin chuyến</p>
          <p className="text-xs text-slate-500">Mở tuyến đường trên Google Maps, không dùng bản đồ nhúng</p>
        </div>
        <Badge tone="info">{estimatedDistance} km gợi ý</Badge>
      </div>

      <div className={`mt-3 grid gap-3 ${compact ? "md:grid-cols-1" : "md:grid-cols-[1.2fr_0.8fr]"}`}>
        <div className="rounded-lg border border-line bg-panel p-3">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <MapPin size={14} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Điểm đón</p>
                <p className="font-semibold text-ink">{points[0].label}</p>
                <p className="text-sm text-slate-600">{points[0].address}</p>
                <p className="text-xs text-slate-500">{points[0].note}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                <Navigation size={14} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Điểm trả</p>
                <p className="font-semibold text-ink">{points[1].label}</p>
                <p className="text-sm text-slate-600">{points[1].address}</p>
                <p className="text-xs text-slate-500">{points[1].note}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-3">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 text-slate-700">
              <UserRound size={14} className="shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="font-semibold">Khách:</span> {order.contactName || order.customerName}
              </span>
            </p>
            <p className="flex items-center gap-2 text-slate-700">
              <PhoneCall size={14} className="shrink-0 text-brand" />
              <a className="font-semibold text-brand hover:underline" href={`tel:${order.contactPhone}`}>
                {order.contactPhone}
              </a>
            </p>
            <p className="flex items-center gap-2 text-slate-700">
              <Clock3 size={14} className="shrink-0 text-brand" />
              <span>{formatDateTime(order.startAt)} - {formatDateTime(order.endAt)}</span>
            </p>
            <p className="flex items-center gap-2 text-slate-700">
              <Route size={14} className="shrink-0 text-brand" />
              <span className="truncate">{order.serviceLabel}</span>
            </p>
            <p className="text-xs text-slate-500">{order.salesNote || order.quoteNote || "Không có ghi chú"}</p>
          </div>

          <div className="mt-3 grid gap-2">
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-brand/90"
              href={routeUrl}
              rel="noreferrer"
              target="_blank"
            >
              <Route size={16} /> Mở tuyến đường Google Maps
            </a>
            <div className="grid grid-cols-2 gap-2">
              <a className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" href={pickupUrl} rel="noreferrer" target="_blank">
                <MapPin size={16} /> Xem điểm đón
              </a>
              <a className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50" href={dropoffUrl} rel="noreferrer" target="_blank">
                <Navigation size={16} /> Xem điểm trả
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTripAccessToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  }
  return `${makeId("trip")}-${makeId("token")}`;
}

function tripAccessUrl(token?: string) {
  if (!token || typeof window === "undefined") return "";
  return `${window.location.origin}/trip/${token}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: vietnamTimeZone,
    hour: "2-digit",
    minute: "2-digit"
  });
}

const vietnamTimeZone = "Asia/Ho_Chi_Minh";

function vietnamDateParts(value = new Date()) {
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

function vietnamDateKey(value = new Date()) {
  const parts = vietnamDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function vietnamDateTimeLabel(value = new Date()) {
  const parts = vietnamDateParts(value);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function vietnamDateTimeLiveLabel(value = new Date()) {
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

function vietnamMonthLabel(value = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: vietnamTimeZone,
    month: "long",
    year: "numeric"
  }).format(value);
}

function vietnamDateTimeLocalValue(value = new Date()) {
  const parts = vietnamDateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function timeOnly(value: string) {
  return new Date(value).toLocaleTimeString("vi-VN", {
    timeZone: vietnamTimeZone,
    hour: "2-digit",
    minute: "2-digit"
  });
}

function dateKey(value: Date) {
  return vietnamDateKey(value);
}

function inputDateValue(value: Date) {
  return vietnamDateKey(value);
}

function orderDateKey(order: DispatchOrder) {
  return dateKey(new Date(order.startAt));
}

const defaultOrderTimes = {
  startAt: vietnamDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)),
  endAt: vietnamDateTimeLocalValue(new Date(Date.now() + 4 * 60 * 60 * 1000))
};

function getMonthCells(monthDate: Date) {
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

function calendarEventClass(order: DispatchOrder) {
  if (order.dispatchStatus === "cancelled") return "bg-rose-600 text-white";
  if (order.dispatchStatus === "waiting_assignment") return "bg-amber-500 text-white";
  if (order.dispatchStatus === "completed") return "bg-emerald-600 text-white";
  if (order.dispatchStatus === "in_progress") return "bg-cyan-600 text-white";
  return "bg-blue-600 text-white";
}

function hourOffset(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function durationMinutes(order: DispatchOrder) {
  return Math.max(30, Math.round((new Date(order.endAt).getTime() - new Date(order.startAt).getTime()) / 60000));
}

function toIsoFromInput(value: string) {
  return new Date(value).toISOString();
}

function toDateTimeInput(value: string) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseRouteLegs(form: FormData): DispatchRouteLeg[] {
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

function primaryLegValues(routeLegs: DispatchRouteLeg[], fallbackStartAt: string, fallbackEndAt: string) {
  const first = routeLegs[0];
  const last = routeLegs[routeLegs.length - 1] ?? first;
  return {
    startAt: first?.startAt ?? toIsoFromInput(fallbackStartAt),
    endAt: last?.endAt ?? toIsoFromInput(fallbackEndAt),
    pickup: first?.pickup ?? "",
    dropoff: last?.dropoff ?? ""
  };
}

function routeSummaryForOrder(order: DispatchOrder) {
  const legs = routeLegsForOrder(order);
  if (legs.length === 0) return `${order.pickup} → ${order.dropoff}`;
  const points = [legs[0]?.pickup, ...legs.map((leg) => leg.dropoff)].filter(Boolean);
  return points.filter((point, index) => index === 0 || point !== points[index - 1]).join(" → ");
}

function mapsRouteUrlForOrder(order: DispatchOrder) {
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

function mapsRouteUrlForLeg(leg: DispatchRouteLeg) {
  const params = new URLSearchParams({
    api: "1",
    origin: leg.pickup || "-",
    destination: leg.dropoff || "-",
    travelmode: "driving"
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function appOrderActionUrl(order: DispatchOrder, view = "dispatch") {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams({ view, order: order.id });
  return `${window.location.origin}/?${params.toString()}`;
}

function telegramHtml(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function buildDispatchProposalIntegrationPayload(order: DispatchOrder, audience: AppNotification["audience"]) {
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

function resolveOrderTransport(order: DispatchOrder, assignments: Assignment[], vehicles: Vehicle[], drivers: Driver[]) {
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

function paymentCollectorInfo(payment: Payment, order: DispatchOrder, transport: ReturnType<typeof resolveOrderTransport>) {
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

function vatFromForm(form: FormData) {
  const subtotalAmount = Number(form.get("subtotalAmount") || 0);
  const vatRate = Number(form.get("vatRate") || 0);
  const totalAmount = Number(form.get("amountDue") || 0);
  const vatAmount = Number(form.get("vatAmount") || 0);
  return {
    subtotalAmount: Number.isFinite(subtotalAmount) ? subtotalAmount : 0,
    vatRate: Number.isFinite(vatRate) ? vatRate : 0,
    vatAmount: Number.isFinite(vatAmount) ? vatAmount : 0,
    amountDue: Number.isFinite(totalAmount) ? totalAmount : 0
  };
}

function routeLegsForOrder(order: DispatchOrder): DispatchRouteLeg[] {
  return order.routeLegs?.length ? order.routeLegs : [{ pickup: order.pickup, dropoff: order.dropoff, startAt: order.startAt, endAt: order.endAt }];
}

function routeLinesForOrder(order: DispatchOrder) {
  return routeLegsForOrder(order).map((leg, index) => {
    const time = [leg.startAt ? formatDateTime(leg.startAt) : "", leg.endAt ? formatDateTime(leg.endAt) : ""].filter(Boolean).join(" - ");
    const note = leg.note ? ` (${leg.note})` : "";
    return `Chặng ${index + 1}: ${time ? `${time} / ` : ""}${leg.pickup || "-"} -> ${leg.dropoff || "-"}${note}`;
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadTextFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function dateOnly(value: string) {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: vietnamTimeZone
  });
}

function customerConfirmationText(order: DispatchOrder) {
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

function finalDispatchOrderText(order: DispatchOrder) {
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

function buildCode(index: number, orderDate = vietnamDateKey()) {
  const dateCode = orderDate.replaceAll("-", "").slice(2);
  return `AOT-${dateCode}-${String(index).padStart(4, "0")}`;
}

function orderMonthCode(orderDate = vietnamDateKey()) {
  const [year, month] = orderDate.split("-");
  return `${month ?? "01"}.${year ?? new Date().getFullYear()}`;
}

function guestMarketCode(value?: DispatchOrder["guestMarket"]) {
  return guestMarketOptions.find((item) => item.value === value)?.code ?? "NĐ";
}

function guestMarketLabel(value?: DispatchOrder["guestMarket"]) {
  return guestMarketOptions.find((item) => item.value === value)?.label ?? "-";
}

function customerSourceCodeLabel(value?: DispatchOrder["customerSourceCode"]) {
  return customerSourceCodeOptions.find((item) => item.value === value || item.code === value)?.code ?? "ĐDH";
}

function customerRecognitionFullLabel(value?: DispatchOrder["customerRecognitionCode"]) {
  const item = customerRecognitionOptions.find((option) => option.value === value);
  return item ? item.label.replace("GĐ", "GD") : "-";
}

function customerSourceFullLabel(value?: DispatchOrder["customerSourceCode"]) {
  const item = customerSourceCodeOptions.find((option) => option.value === value || option.code === value);
  return item ? item.label : "ĐDH - Khách theo đơn đặt hàng vận chuyển";
}

function provinceCodeFullLabel(value?: string) {
  const code = (value || "").toUpperCase();
  const item = provinceCodeOptions.find((option) => option.value === code);
  return item ? item.label : code || "-";
}

function provinceNameLabel(value?: string) {
  return provinceCodeFullLabel(value).replace(/^[A-Z]+ - /, "");
}

function provinceRouteFullLabel(origin?: string, destination?: string) {
  return `${provinceNameLabel(origin)} - ${provinceNameLabel(destination)}`;
}

function buildTransportCode(index: number, input: {
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

function safeOrderFileCode(code: string) {
  return code.replace(/[\\/]/g, "-");
}

function orderCost(order: DispatchOrder) {
  return (order.driverCost ?? 0) + (order.vehicleCost ?? 0) + (order.otherCost ?? 0);
}

function orderProfit(order: DispatchOrder) {
  return order.amountDue - orderCost(order);
}

function orderActualCost(order: DispatchOrder) {
  return (order.actualDriverCost ?? 0) + (order.actualVehicleCost ?? 0) + (order.actualOtherCost ?? 0);
}

function orderActualProfit(order: DispatchOrder) {
  const actualCost = orderActualCost(order);
  return order.amountDue - (actualCost > 0 ? actualCost : orderCost(order));
}

function orderMargin(order: DispatchOrder) {
  if (order.amountDue <= 0) return 0;
  return orderProfit(order) / order.amountDue;
}

function present(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function orderReadiness(order: DispatchOrder) {
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

function driverActionLabel(order: DispatchOrder) {
  if (order.dispatchStatus === "assigned" || order.dispatchStatus === "waiting_assignment") return "Nhận chuyến";
  if (order.dispatchStatus === "driver_accepted") return "Bắt đầu chạy";
  if (order.dispatchStatus === "in_progress") return "Hoàn thành";
  if (order.dispatchStatus === "completed") return "Đã hoàn thành";
  return "Đã hủy";
}

function driverActionDetail(order: DispatchOrder) {
  if (order.dispatchStatus === "assigned" || order.dispatchStatus === "waiting_assignment") return "Tài xế cần xác nhận chuyến trước giờ chạy.";
  if (order.dispatchStatus === "driver_accepted") return "Chuyến đã được nhận, chuẩn bị xuất phát.";
  if (order.dispatchStatus === "in_progress") return "Xe đang chạy, khi xong thì chốt chuyến.";
  if (order.dispatchStatus === "completed") return "Chuyến đã xong.";
  return "Chuyến này đã bị hủy.";
}

function driverNextDispatchStatus(order: DispatchOrder): DispatchStatus | null {
  if (order.dispatchStatus === "assigned") return "driver_accepted";
  if (order.dispatchStatus === "driver_accepted") return "in_progress";
  if (order.dispatchStatus === "in_progress") return "completed";
  return null;
}

const resourceStatusLabels: Record<Vehicle["status"], string> = {
  active: "Sẵn sàng",
  maintenance: "Bảo dưỡng",
  inactive: "Ngưng",
  leave: "Nghỉ"
};

const vehicleOwnershipLabels: Record<NonNullable<Vehicle["ownershipType"]>, string> = {
  company: "Chính chủ",
  partner: "Hợp tác",
  rented: "Thuê ngoài"
};

function vehicleOptionLabel(vehicle: Vehicle) {
  const ownership = vehicle.ownershipType ? vehicleOwnershipLabels[vehicle.ownershipType] : "Chưa phân loại";
  return `${vehicle.plateNo} - ${vehicle.seats} chỗ / ${ownership} / ${resourceStatusLabels[vehicle.status] ?? vehicle.status}`;
}

function driverOptionLabel(driver: Driver, vehicles: Vehicle[]) {
  const defaultVehicle = vehicles.find((vehicle) => vehicle.defaultDriverId === driver.id);
  const vehicleLabel = defaultVehicle ? `${defaultVehicle.plateNo} - ${defaultVehicle.seats} chỗ` : "chưa gắn xe mặc định";
  return `${driver.fullName} / ${driver.phone} / ${vehicleLabel} / ${resourceStatusLabels[driver.status] ?? driver.status}`;
}

function assignmentIssueLines({
  assignments,
  driver,
  drivers,
  ignoreAssignmentId,
  order,
  orders,
  vehicle,
  vehicles
}: {
  assignments: Assignment[];
  driver?: Driver;
  drivers: Driver[];
  ignoreAssignmentId?: string;
  order: DispatchOrder;
  orders: DispatchOrder[];
  vehicle?: Vehicle;
  vehicles: Vehicle[];
}) {
  const issues: { tone: "warn" | "block"; text: string }[] = [];
  if (!vehicle) issues.push({ tone: "block", text: "Chưa chọn xe." });
  if (!driver) issues.push({ tone: "block", text: "Chưa chọn tài xế." });
  if (vehicle && vehicle.status !== "active") issues.push({ tone: "block", text: `Xe ${vehicle.plateNo} đang ở trạng thái ${resourceStatusLabels[vehicle.status] ?? vehicle.status}.` });
  if (driver && driver.status !== "active") issues.push({ tone: "block", text: `Tài xế ${driver.fullName} đang ở trạng thái ${resourceStatusLabels[driver.status] ?? driver.status}.` });
  if (driver && !driver.phone) issues.push({ tone: "block", text: `Thiếu SĐT tài xế ${driver.fullName}, chưa thể gửi thông báo nhận chuyến.` });
  if (driver && !driver.cccd) issues.push({ tone: "warn", text: `Thiếu CCCD tài xế ${driver.fullName}, cần bổ sung trước khi xuất lệnh final.` });
  if (vehicle && driver && vehicle.defaultDriverId && vehicle.defaultDriverId !== driver.id) {
    const defaultDriver = drivers.find((item) => item.id === vehicle.defaultDriverId);
    issues.push({ tone: "warn", text: `Xe ${vehicle.plateNo} mặc định chạy với ${defaultDriver?.fullName ?? vehicle.defaultDriverId}; vẫn có thể đổi nếu điều hành xác nhận.` });
  }

  if (vehicle || driver) {
    const conflicts = assignments.filter((assignment) => {
      if (assignment.status !== "active") return false;
      if (assignment.id === ignoreAssignmentId) return false;
      if (vehicle && assignment.vehicleId !== vehicle.id && (!driver || assignment.driverId !== driver.id)) return false;
      if (!vehicle && driver && assignment.driverId !== driver.id) return false;
      try {
        return new Date(order.startAt) < new Date(assignment.endAt) && new Date(order.endAt) > new Date(assignment.startAt);
      } catch {
        return false;
      }
    });
    for (const conflict of conflicts) {
      const conflictOrder = orders.find((item) => item.id === conflict.dispatchOrderId);
      const conflictVehicle = vehicles.find((item) => item.id === conflict.vehicleId);
      const conflictDriver = drivers.find((item) => item.id === conflict.driverId);
      const parts = [
        vehicle && conflict.vehicleId === vehicle.id ? `xe ${conflictVehicle?.plateNo ?? conflict.vehicleId}` : "",
        driver && conflict.driverId === driver.id ? `tài xế ${conflictDriver?.fullName ?? conflict.driverId}` : ""
      ].filter(Boolean).join(" và ");
      issues.push({
        tone: "block",
        text: `Trùng lịch ${parts || "nguồn lực"} với lệnh ${conflictOrder?.code ?? conflict.dispatchOrderId}: ${formatDateTime(conflict.startAt)} - ${formatDateTime(conflict.endAt)}.`
      });
    }
  }
  return issues;
}

function toAppNotification(row: unknown): AppNotification {
  const item = row as Record<string, unknown>;
  return {
    id: String(item.id),
    audience: String(item.audience) as AppNotification["audience"],
    eventType: typeof item.event_type === "string" ? item.event_type : undefined,
    title: String(item.title),
    body: String(item.body),
    entityId: typeof item.entity_id === "string" ? item.entity_id : undefined,
    targetUserId: typeof item.target_user_id === "string" ? item.target_user_id : undefined,
    targetDriverId: typeof item.target_driver_id === "string" ? item.target_driver_id : undefined,
    createdAt: String(item.created_at),
    read: Boolean(item.is_read)
  };
}

function startupTiming(label: string, startedAt: number, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const elapsedMs = Math.round(performance.now() - startedAt);
  console.info(`[startup] ${label}`, { elapsedMs, ...detail });
}

export default function OpsApp() {
  const repository = useMemo(() => createOpsRepository(storageKey), []);
  const persistedStateRef = useRef<OpsState | null>(null);
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [state, setState] = useState<OpsState>(runtimeInitialState);
  const [selectedOrderId, setSelectedOrderId] = useState(supabaseConfigured ? "" : seedOrders[2]?.id ?? seedOrders[0]?.id);
  const [query, setQuery] = useState("");
  const [customerKind, setCustomerKind] = useState<DispatchOrder["customerKind"]>("individual");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarDay, setCalendarDay] = useState(() => new Date());
  const [mobileDriverId, setMobileDriverId] = useState(supabaseConfigured ? "" : seedDrivers[0]?.id ?? "");
  const [roleState, setRoleState] = useState<AppRole | null>(supabaseConfigured ? null : "manager");
  const [authLabel, setAuthLabel] = useState(supabaseConfigured ? "Đang kiểm tra đăng nhập..." : "Local demo");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authDriverId, setAuthDriverId] = useState<string | undefined>();
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [message, setMessage] = useState(supabaseConfigured ? "Đang kết nối Supabase..." : "Dữ liệu pilot lưu trên trình duyệt máy này.");
  const [now, setNow] = useState(() => new Date());
  const [isMobileViewport, setIsMobileViewport] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(max-width: 1023px)").matches : false));
  const pendingActionsRef = useRef(new Set<string>());
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showTripCleanupConfirm, setShowTripCleanupConfirm] = useState(false);
  const [tripCleanupConfirmText, setTripCleanupConfirmText] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => setIsMobileViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  const currentRole = roleState ?? "manager";
  const visibleTabs = useMemo(() => tabs.filter((item) => canViewTab(item, currentRole)), [currentRole]);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0] ?? "Dashboard";
  const isVisibleNotification = (item: AppNotification) => {
    if (currentRole === "admin" || currentRole === "manager") return true;
    if (item.audience !== currentRole) return false;
    if (item.targetUserId && item.targetUserId !== authUserId) return false;
    if (currentRole === "driver" && item.targetDriverId && item.targetDriverId !== authDriverId) return false;
    if (currentRole === "driver" && item.entityId) {
      const order = state.orders.find((candidate) => candidate.id === item.entityId);
      if (order?.driverId && authDriverId && order.driverId !== authDriverId) return false;
    }
    return true;
  };
  const visibleNotifications = (state.notifications ?? [])
    .filter(isVisibleNotification)
    .slice(0, 5);
  const canCleanTripData = currentRole === "admin" || currentRole === "manager";
  const tripCleanupPhrase = "XOA CHUYEN";

  function beginAction(key: string, label: string) {
    if (pendingActionsRef.current.has(key)) {
      setMessage(`${label} đang được xử lý, vui lòng chờ.`);
      return false;
    }
    pendingActionsRef.current.add(key);
    setPendingActions(new Set(pendingActionsRef.current));
    return true;
  }

  function endAction(key: string) {
    pendingActionsRef.current.delete(key);
    setPendingActions(new Set(pendingActionsRef.current));
  }

  function isActionPending(key: string) {
    return pendingActions.has(key);
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!showNotifications) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showNotifications]);

  useEffect(() => {
    if (supabaseConfigured && (!authReady || !roleState)) return;
    let cancelled = false;
    const loadStartedAt = performance.now();

    repository
      .load()
      .then((loadedState) => {
        if (cancelled) return;
        const normalizeStartedAt = performance.now();
        const normalized = normalizeState(loadedState);
        startupTiming("normalize_state", normalizeStartedAt, {
          assignments: normalized.assignments.length,
          auditEvents: normalized.auditEvents.length,
          orders: normalized.orders.length,
          payments: normalized.payments.length
        });
        setState((current) => {
          const merged = {
            ...normalized,
            notifications: current.notifications ?? normalized.notifications ?? []
          };
          persistedStateRef.current = merged;
          return merged;
        });
        setSelectedOrderId(normalized.orders[2]?.id ?? normalized.orders[0]?.id ?? "");
        setMobileDriverId(normalized.drivers[0]?.id ?? "");
        setPersistenceReady(true);
        startupTiming("repository_load", loadStartedAt, { mode: repository.mode });
        setMessage(repository.mode === "supabase" ? "Đã kết nối Supabase và tải dữ liệu." : "Dữ liệu pilot lưu trên trình duyệt máy này.");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPersistenceReady(true);
        startupTiming("repository_load_failed", loadStartedAt, { mode: repository.mode });
        setMessage(`Không tải được dữ liệu ${repository.mode}: ${error instanceof Error ? error.message : "unknown error"}`);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, repository, roleState]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    const authStartedAt = performance.now();
    let bootstrapTimeout: number | null = null;

    (async () => {
      try {
        bootstrapTimeout = window.setTimeout(() => {
          if (cancelled) return;
          setRoleState(null);
          setAuthUserId(null);
          setAuthLabel("Auth chậm, vui lòng mở Auth");
          setAuthReady(true);
        }, 3000);

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (bootstrapTimeout) {
          window.clearTimeout(bootstrapTimeout);
          bootstrapTimeout = null;
        }

        const user = data.session?.user ?? null;
        if (!user) {
          setRoleState(null);
          setAuthUserId(null);
          setAuthLabel("Chưa đăng nhập");
          setAuthReady(true);
          startupTiming("auth_get_session", authStartedAt, { signedIn: false });
          return;
        }
        setAuthUserId(user.id);
        startupTiming("auth_get_session", authStartedAt, { signedIn: true });
        const profileStartedAt = performance.now();
        const { data: profile } = await supabase
          .from("app_user_profiles" as never)
          .select("role,full_name,driver_id" as never)
          .eq("user_id" as never, user.id as never)
          .maybeSingle();
        const typedProfile = profile as { role?: AppRole; full_name?: string; driver_id?: string } | null;
        const nextRole = typedProfile?.role ?? "sale";
        if (!typedProfile) {
          await supabase.from("app_user_profiles" as never).upsert({
            user_id: user.id,
            full_name: user.email || "",
            phone: null,
            role: nextRole,
            driver_id: null
          } as never);
        }
        setRoleState(nextRole);
        if (typedProfile?.driver_id) {
          setAuthDriverId(typedProfile.driver_id);
          setMobileDriverId(typedProfile.driver_id);
          setTab("Màn làm việc");
        }
        setAuthLabel(typedProfile?.full_name || user.email || "Signed in");
        startupTiming("profile_load", profileStartedAt, { role: nextRole });
      } catch (error) {
        if (cancelled) return;
        setRoleState(null);
        setAuthUserId(null);
        setAuthLabel(error instanceof Error ? error.message : "Auth load failed");
      } finally {
        if (bootstrapTimeout) {
          window.clearTimeout(bootstrapTimeout);
          bootstrapTimeout = null;
        }
        if (!cancelled) {
          setAuthReady(true);
          startupTiming("auth_total", authStartedAt);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !authUserId) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const reloadAuthProfile = async () => {
      try {
        const { data: profile } = await supabase
          .from("app_user_profiles" as never)
          .select("role,full_name,driver_id" as never)
          .eq("user_id" as never, authUserId as never)
          .maybeSingle();
        if (cancelled) return;
        const typedProfile = profile as { role?: AppRole; full_name?: string; driver_id?: string } | null;
        const nextRole = typedProfile?.role ?? null;
        setRoleState(nextRole);
        setAuthDriverId(typedProfile?.driver_id);
        if (typedProfile?.driver_id) setMobileDriverId(typedProfile.driver_id);
        setAuthLabel((current) => typedProfile?.full_name ?? current);
      } catch (error) {
        if (!cancelled) {
          setMessage(`Không đồng bộ được phân quyền: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      }
    };

    const channel = supabase
      .channel("ops-auth-profile-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_user_profiles" }, (payload) => {
        const row = payload.new as { user_id?: string } | null;
        const oldRow = payload.old as { user_id?: string } | null;
        if (row?.user_id === authUserId || oldRow?.user_id === authUserId) {
          void reloadAuthProfile();
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [authUserId]);

  useEffect(() => {
    if (!supabaseConfigured || !authReady || !roleState) return;
    const supabase = createSupabaseBrowserClient();
    const notificationStartedAt = performance.now();
    supabase
      .from("app_notifications" as never)
      .select("*" as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(20 as never)
      .then(({ data, error }) => {
        if (error) {
          setMessage(`Không tải được thông báo: ${error.message}`);
          if (process.env.NODE_ENV !== "production") console.warn("[notifications-load]", error);
          return;
        }
        if (data) setState((current) => ({ ...current, notifications: (data as unknown[]).map(toAppNotification) }));
        startupTiming("notifications_load", notificationStartedAt, { rows: (data as unknown[] | null)?.length ?? 0 });
      });
    const channel = supabase
      .channel("app_notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "app_notifications" }, (payload) => {
        setState((current) => ({ ...current, notifications: [toAppNotification(payload.new), ...(current.notifications ?? [])].slice(0, 30) }));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authReady, roleState]);

  useEffect(() => {
    if (!supabaseConfigured || !persistenceReady) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let inFlight = false;
    let pendingReload = false;
    let timeout: number | null = null;

    const reloadTables = currentRole === "driver"
      ? ([
          "app_drivers",
          "app_vehicles",
          "app_dispatch_orders",
          "app_dispatch_assignments",
          "app_notifications"
        ] as const)
      : (isMobileViewport
        ? ([
            "app_customers",
            "app_companies",
            "app_company_contacts",
            "app_vehicles",
            "app_drivers",
            "app_dispatch_orders",
            "app_dispatch_assignments",
            "app_payments",
            "app_notifications"
          ] as const)
        : ([
            "app_customers",
            "app_companies",
            "app_company_contacts",
            "app_vehicles",
            "app_drivers",
            "app_dispatch_orders",
            "app_dispatch_assignments",
            "app_payments",
            "app_audit_events"
          ] as const));

    const runReload = async () => {
      if (inFlight) {
        pendingReload = true;
        return;
      }
      inFlight = true;
      try {
        do {
          pendingReload = false;
          const loadedState = await repository.load();
          if (cancelled) return;
          let nextState: OpsState | null = null;
          setState((current) => {
            const merged = normalizeState({
              ...loadedState,
              notifications: current.notifications ?? []
            });
            nextState = merged;
            return sameOpsState(current, merged) ? current : merged;
          });
          const syncedState = nextState ?? normalizeState({
            ...loadedState,
            notifications: persistedStateRef.current?.notifications ?? []
          });
          persistedStateRef.current = syncedState;
          setSelectedOrderId((current) => (syncedState.orders.some((order) => order.id === current) ? current : syncedState.orders[0]?.id ?? ""));
          setMobileDriverId((current) => (syncedState.drivers.some((driver) => driver.id === current) ? current : syncedState.drivers[0]?.id ?? ""));
        } while (pendingReload && !cancelled);
      } catch (error) {
        if (!cancelled) {
          setMessage(`Không đồng bộ được dữ liệu ${repository.mode}: ${error instanceof Error ? error.message : "unknown error"}`);
        }
      } finally {
        inFlight = false;
      }
    };

    const scheduleReload = () => {
      if (cancelled) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = null;
        void runReload();
      }, 150);
    };

    const subscribeStartedAt = performance.now();
    const channels = reloadTables.map((table) => {
      const tableStartedAt = performance.now();
      return supabase
        .channel(`ops-sync-${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, scheduleReload)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") startupTiming(`realtime_${table}`, tableStartedAt);
        });
    });
    startupTiming("realtime_subscribe_started", subscribeStartedAt, { tables: reloadTables.length });

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [currentRole, isMobileViewport, persistenceReady, repository]);

  useEffect(() => {
    if (!persistenceReady) return;
    const previousState = persistedStateRef.current ?? undefined;
    repository
      .save(state, previousState)
      .then(() => {
        persistedStateRef.current = state;
      })
      .catch((error: unknown) => {
        setMessage(`Không lưu được dữ liệu ${repository.mode}: ${error instanceof Error ? error.message : "unknown error"}`);
      });
  }, [persistenceReady, repository, state]);

  const todayKey = vietnamDateKey();
  const selectedOrder = state.orders.find((order) => order.id === selectedOrderId) ?? state.orders[0];
  const todayOrders = state.orders.filter((order) => orderDateKey(order) === todayKey);
  const pendingDispatchReviewCount = todayOrders.filter((order) => order.orderStatus === "pending_dispatch_review").length;
  const alerts = getOperationalAlerts(state.orders);
  const revenue = todayOrders.reduce((sum, order) => sum + order.amountDue, 0);
  const grossProfit = todayOrders.reduce((sum, order) => sum + orderProfit(order), 0);
  const collected = state.payments.reduce((sum, payment) => sum + (payment.status === "valid" ? payment.amount : 0), 0);
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return state.orders;
    return state.orders.filter((order) =>
      [order.code, order.customerName, order.companyName, order.contactName, order.contactPhone, order.taxCode, order.pickup, order.dropoff, order.salesOwner, order.source]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    );
  }, [query, state.orders]);

  function runCommand(
    command: OpsCommand,
    updater: (draft: OpsState) => OpsState,
    note: string,
    serverRpc?: { name: string; args: Record<string, unknown> }
  ) {
    if (!canRunCommand(currentRole, command)) {
      setMessage(`${roleLabels[currentRole]} không có quyền thực hiện lệnh này.`);
      return;
    }
    if (process.env.NODE_ENV !== "production") console.debug(`[ops-command] ${command}`);
    setState((current) => updater(current));
    setMessage(note);
    if (supabaseConfigured) {
      const supabase = createSupabaseBrowserClient();
      if (serverRpc) {
        void supabase
          .rpc(serverRpc.name as never, serverRpc.args as never)
          .then(({ error }) => {
            if (error) {
              setMessage(`Không lưu được command ${commandCatalog[command].rpcName} xuống Supabase: ${error.message}`);
              if (process.env.NODE_ENV !== "production") console.warn("[command-rpc]", error);
            }
          });
      }
      void supabase
        .rpc(
          "record_app_command_event" as never,
          {
            command_name: command,
            actor_role: currentRole,
            actor_user_id: authUserId,
            rpc_name: commandCatalog[command].rpcName,
            payload: { note }
          } as never
        )
        .then(
          () => undefined,
          (error: unknown) => {
            if (process.env.NODE_ENV !== "production") console.warn("[command-event]", error);
          }
        );
    }
  }

  async function runSupabaseRpc(name: string, args: Record<string, unknown>, failPrefix: string) {
    if (!supabaseConfigured) return true;
    const { error } = await createSupabaseBrowserClient().rpc(name as never, args as never);
    if (error) {
      setMessage(`${failPrefix}: ${error.message}`);
      if (process.env.NODE_ENV !== "production") console.warn(`[${name}]`, error);
      return false;
    }
    return true;
  }

  function orderRpcPayload(order: DispatchOrder) {
    return {
      id: order.id,
      code: order.code,
      order_date: order.orderDate ?? null,
      contract_type: order.contractType ?? null,
      customer_kind: order.customerKind,
      customer_name: order.customerName,
      customer_cccd: order.customerCccd ?? null,
      customer_address: order.customerAddress ?? null,
      customer_bank_account: order.customerBankAccount ?? null,
      customer_bank_name: order.customerBankName ?? null,
      company_name: order.companyName ?? null,
      company_address: order.companyAddress ?? null,
      company_bank_account: order.companyBankAccount ?? null,
      company_bank_name: order.companyBankName ?? null,
      contact_name: order.contactName ?? null,
      contact_phone: order.contactPhone,
      tax_code: order.taxCode ?? null,
      billing_email: order.billingEmail ?? null,
      pickup: order.pickup,
      dropoff: order.dropoff,
      route_legs: order.routeLegs ?? null,
      service_code: order.serviceCode ?? null,
      service_label: order.serviceLabel,
      service_clarification: order.serviceClarification ?? null,
      unit: order.unit ?? null,
      sales_owner: order.salesOwner,
      source_owner_name: order.sourceOwnerName ?? null,
      source: order.source,
      guest_count: order.guestCount ?? null,
      guest_market: order.guestMarket ?? null,
      customer_recognition_code: order.customerRecognitionCode ?? null,
      customer_source_code: order.customerSourceCode ?? null,
      origin_province_code: order.originProvinceCode ?? null,
      destination_province_code: order.destinationProvinceCode ?? null,
      invoice_required: order.invoiceRequired ?? null,
      vehicle_ownership: order.vehicleOwnership ?? null,
      vehicle_plate_no: order.vehiclePlateNo ?? null,
      driver_full_name: order.driverFullName ?? null,
      driver_cccd: order.driverCccd ?? null,
      driver_phone: order.driverPhone ?? null,
      external_driver_name: order.externalDriverName ?? null,
      external_driver_phone: order.externalDriverPhone ?? null,
      external_vehicle_plate: order.externalVehiclePlate ?? null,
      external_vehicle_type: order.externalVehicleType ?? null,
      trip_access_token: order.tripAccessToken ?? null,
      trip_access_expires_at: order.tripAccessExpiresAt ?? null,
      trip_access_revoked: order.tripAccessRevoked ?? null,
      supplier_owner_name: order.supplierOwnerName ?? null,
      supplier_cccd: order.supplierCccd ?? null,
      supplier_invoice_required: order.supplierInvoiceRequired ?? null,
      supplier_company_name: order.supplierCompanyName ?? null,
      supplier_tax_code: order.supplierTaxCode ?? null,
      supplier_address: order.supplierAddress ?? null,
      supplier_phone: order.supplierPhone ?? null,
      supplier_total_with_vat: order.supplierTotalWithVat ?? null,
      supplier_bank_account: order.supplierBankAccount ?? null,
      supplier_bank_name: order.supplierBankName ?? null,
      subtotal_amount: order.subtotalAmount ?? null,
      vat_rate: order.vatRate ?? null,
      vat_amount: order.vatAmount ?? null,
      start_at: order.startAt,
      end_at: order.endAt,
      amount_due: order.amountDue,
      driver_cost: order.driverCost ?? null,
      vehicle_cost: order.vehicleCost ?? null,
      other_cost: order.otherCost ?? null,
      payment_method: order.paymentMethod ?? null,
      payer: order.payer ?? null,
      collection_account_owner: order.collectionAccountOwner ?? null,
      collection_bank_account: order.collectionBankAccount ?? null,
      collection_bank_name: order.collectionBankName ?? null,
      quote_note: order.quoteNote ?? null,
      customer_confirmation_note: order.customerConfirmationNote ?? null,
      quote_status: order.quoteStatus ?? null,
      order_status: order.orderStatus,
      dispatch_status: order.dispatchStatus,
      payment_status: order.paymentStatus,
      invoice_status: order.invoiceStatus,
      reconciliation_status: order.reconciliationStatus,
      priority: order.priority ?? null,
      sales_note: order.salesNote ?? null
    };
  }

  function audit(event: Omit<AuditEvent, "id" | "createdAt">): AuditEvent {
    return {
      ...event,
      id: makeId("audit"),
      createdAt: new Date().toISOString()
    };
  }

  function notify(input: Omit<AppNotification, "id" | "createdAt">) {
    const notification: AppNotification = { ...input, id: makeId("noti"), createdAt: new Date().toISOString() };
    setState((current) => ({ ...current, notifications: [notification, ...(current.notifications ?? [])].slice(0, 30) }));
    if (!supabaseConfigured) return;
    const supabase = createSupabaseBrowserClient();
    const basePayload = {
      id: notification.id,
      audience: notification.audience,
      title: notification.title,
      body: notification.body,
      entity_id: notification.entityId ?? null,
      is_read: notification.read ?? false,
      created_at: notification.createdAt
    };
    const targetedPayload = {
      ...basePayload,
      event_type: notification.eventType ?? notification.title,
      target_user_id: notification.targetUserId ?? null,
      target_driver_id: notification.targetDriverId ?? null
    };
    supabase
      .from("app_notifications" as never)
      .upsert(targetedPayload as never)
      .then(async ({ error }) => {
        if (!error) {
          await emitIntegrationEvent(notification);
          return;
        }
        const missingNewColumns = error.message.includes("target_user_id") || error.message.includes("target_driver_id") || error.message.includes("event_type");
        if (missingNewColumns) {
          const retry = await supabase.from("app_notifications" as never).upsert(basePayload as never);
          if (!retry.error) {
            await emitIntegrationEvent(notification);
            return;
          }
          error = retry.error;
        }
        setMessage(`Không ghi được thông báo ${notification.audience}: ${error.message}`);
        if (process.env.NODE_ENV !== "production") console.warn("[notification-write]", error);
      });

    async function emitIntegrationEvent(event: AppNotification) {
      const eventType = event.eventType ?? event.title;
      const { error } = await supabase.from("app_integration_events" as never).upsert({
        id: `evt_${event.id}`,
        event_type: eventType,
        audience: event.audience,
        entity_type: event.entityId ? "dispatch_order" : "notification",
        entity_id: event.entityId ?? null,
        target_user_id: event.targetUserId ?? null,
        target_driver_id: event.targetDriverId ?? null,
        payload: {
          notificationId: event.id,
          title: event.title,
          body: event.body,
          audience: event.audience,
          entityId: event.entityId ?? null,
          targetUserId: event.targetUserId ?? null,
          targetDriverId: event.targetDriverId ?? null,
          ...(event.payload ?? {})
        },
        status: "pending",
        created_at: event.createdAt
      } as never);
      if (error && process.env.NODE_ENV !== "production" && !error.message.includes("app_integration_events")) {
        console.warn("[integration-event-write]", error);
      }
    }
  }

  function notifyMany(audiences: AppNotification["audience"][], input: Omit<AppNotification, "id" | "createdAt" | "audience">) {
    for (const audience of Array.from(new Set(audiences))) {
      notify({ ...input, audience });
    }
  }

  async function reserveDispatchOrderCode(
    orderDate?: string,
    codeInput?: {
      guestMarket?: DispatchOrder["guestMarket"];
      customerRecognitionCode?: DispatchOrder["customerRecognitionCode"];
      customerSourceCode?: DispatchOrder["customerSourceCode"];
      originProvinceCode?: string;
      destinationProvinceCode?: string;
    }
  ): Promise<string | null> {
    const effectiveDate = orderDate || vietnamDateKey(now);
    const localCode = buildTransportCode(state.orders.length + 1, { orderDate: effectiveDate, ...codeInput });
    if (!supabaseConfigured) return localCode;
    if (!authUserId) {
      setMessage("Cần đăng nhập trước khi Supabase cấp số lệnh.");
      return null;
    }
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .rpc("next_transport_order_code" as never, {
        p_order_date: effectiveDate,
        p_guest_market: codeInput?.guestMarket ?? "domestic",
        p_customer_recognition_code: codeInput?.customerRecognitionCode ?? "DL",
        p_customer_source_code: codeInput?.customerSourceCode ?? "DDH",
        p_origin_province_code: codeInput?.originProvinceCode ?? "DAD",
        p_destination_province_code: codeInput?.destinationProvinceCode ?? "QNH"
      } as never) as unknown as {
        data: string | null;
        error: { message: string } | null;
      };
    if (error || !data) {
      setMessage(`Chưa cấp được số lệnh từ Supabase: ${error?.message ?? "không có dữ liệu trả về"}. Hãy chạy migration 0036 trước khi tạo lệnh mới.`);
      return null;
    }
    return data;
  }

  async function syncOrderTransportCodeFields(order: DispatchOrder) {
    if (!supabaseConfigured) return true;
    return runSupabaseRpc(
      "update_dispatch_order_transport_code_fields",
      {
        p_order_id: order.id,
        p_guest_count: order.guestCount ?? null,
        p_guest_market: order.guestMarket ?? null,
        p_customer_recognition_code: order.customerRecognitionCode ?? null,
        p_customer_source_code: order.customerSourceCode ?? null,
        p_origin_province_code: order.originProvinceCode ?? null,
        p_destination_province_code: order.destinationProvinceCode ?? null
      },
      `Không lưu được thông tin mã vận chuyển ${order.code}`
    );
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can(currentRole, "create_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền tạo lệnh.`);
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const startAt = String(form.get("startAt") || "");
    const endAt = String(form.get("endAt") || "");
    const { subtotalAmount, vatRate, vatAmount, amountDue } = vatFromForm(form);
    const driverCost = Number(form.get("driverCost") || 0);
    const vehicleCost = Number(form.get("vehicleCost") || 0);
    const otherCost = Number(form.get("otherCost") || 0);
    const routeLegs = parseRouteLegs(form);
    const primaryRoute = primaryLegValues(routeLegs, startAt, endAt);
    const kind = String(form.get("customerKind")) as DispatchOrder["customerKind"];
    const customerId = String(form.get("customerId") || "");
    const companyId = String(form.get("companyId") || "");
    const contactId = String(form.get("contactId") || "");
    const orderDate = String(form.get("orderDate") || "").trim();
    const contractType = String(form.get("contractType") || "simple") as DispatchOrder["contractType"];
    const contactName = String(form.get("contactName") || "").trim();
    const companyName = String(form.get("companyName") || "").trim();
    const taxCode = String(form.get("taxCode") || "").trim();
    const billingEmail = String(form.get("billingEmail") || "").trim();
    const customerCccd = String(form.get("customerCccd") || "").trim();
    const customerAddress = String(form.get("customerAddress") || "").trim();
    const customerBankAccount = String(form.get("customerBankAccount") || "").trim();
    const customerBankName = String(form.get("customerBankName") || "").trim();
    const companyAddress = String(form.get("companyAddress") || "").trim();
    const companyBankAccount = String(form.get("companyBankAccount") || "").trim();
    const companyBankName = String(form.get("companyBankName") || "").trim();
    const serviceSelection = serviceOptionFor(String(form.get("serviceCode") || "").trim(), String(form.get("serviceLabel") || "").trim());
    const serviceCode = serviceSelection.code;
    const serviceLabel = serviceSelection.label;
    const serviceClarification = String(form.get("serviceClarification") || "").trim();
    const unit = String(form.get("unit") || "").trim();
    const sourceOwnerName = String(form.get("sourceOwnerName") || "").trim();
    const guestCount = Number(form.get("guestCount") || 0);
    const guestMarket = String(form.get("guestMarket") || "domestic") as DispatchOrder["guestMarket"];
    const customerRecognitionCode = String(form.get("customerRecognitionCode") || "DL") as DispatchOrder["customerRecognitionCode"];
    const customerSourceCode = String(form.get("customerSourceCode") || "DDH") as DispatchOrder["customerSourceCode"];
    const originProvinceCode = String(form.get("originProvinceCode") || "DAD").trim().toUpperCase();
    const destinationProvinceCode = String(form.get("destinationProvinceCode") || "QNH").trim().toUpperCase();
    const invoiceRequired = form.get("invoiceRequired") === "yes";
    const vehicleOwnership = String(form.get("vehicleOwnership") || "company") as DispatchOrder["vehicleOwnership"];
    const vehiclePlateNo = String(form.get("vehiclePlateNo") || "").trim();
    const driverFullName = String(form.get("driverFullName") || "").trim();
    const driverCccd = String(form.get("driverCccd") || "").trim();
    const driverPhone = String(form.get("driverPhone") || "").trim();
    const supplierOwnerName = String(form.get("supplierOwnerName") || "").trim();
    const supplierCccd = String(form.get("supplierCccd") || "").trim();
    const supplierInvoiceRequired = form.get("supplierInvoiceRequired") !== "no";
    const supplierCompanyName = String(form.get("supplierCompanyName") || "").trim();
    const supplierTaxCode = String(form.get("supplierTaxCode") || "").trim();
    const supplierAddress = String(form.get("supplierAddress") || "").trim();
    const supplierPhone = String(form.get("supplierPhone") || "").trim();
    const supplierTotalWithVat = Number(form.get("supplierTotalWithVat") || 0);
    const supplierBankAccount = String(form.get("supplierBankAccount") || "").trim();
    const supplierBankName = String(form.get("supplierBankName") || "").trim();
    const selectedCustomerProfile = state.customers.find((customer) => customer.id === customerId);
    const selectedCompanyProfile = state.companies.find((company) => company.id === companyId);
    const selectedContactProfile = state.companyContacts.find((contact) => contact.id === contactId);

    if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) {
      setMessage("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }

    if (!primaryRoute.pickup || !primaryRoute.dropoff) {
      setMessage("Hành trình cần ít nhất một chặng có điểm đi và điểm đến.");
      return;
    }

    if (amountDue < 0 || driverCost < 0 || vehicleCost < 0 || otherCost < 0) {
      setMessage("Giá bán và chi phí không được âm.");
      return;
    }

    if (guestCount < 0) {
      setMessage("Số lượng khách không được âm.");
      return;
    }

    if (kind === "individual" && !selectedCustomerProfile && !String(form.get("customerName") || "").trim()) {
      setMessage("Khách cá nhân cần chọn hồ sơ có sẵn hoặc nhập tên khách mới.");
      return;
    }

    if (kind === "individual" && !selectedCustomerProfile && !String(form.get("contactPhone") || "").trim()) {
      setMessage("Khách cá nhân mới cần có SĐT.");
      return;
    }

    if (kind === "company" && !selectedCompanyProfile && (!companyName || !contactName)) {
      setMessage("Khách doanh nghiệp cần có tên công ty và người liên hệ.");
      return;
    }

    if (kind === "company" && !selectedContactProfile && !String(form.get("contactPhone") || "").trim()) {
      setMessage("Contact doanh nghiệp mới cần có SĐT.");
      return;
    }

    const actionKey = "order:create";
    if (!beginAction(actionKey, "Tạo lệnh")) return;
    try {
    const orderCode = await reserveDispatchOrderCode(orderDate || startAt.slice(0, 10), {
      guestMarket,
      customerRecognitionCode,
      customerSourceCode,
      originProvinceCode,
      destinationProvinceCode
    });
    if (!orderCode) return;

    const order: DispatchOrder = {
      id: makeId("order"),
      code: orderCode,
      orderDate: orderDate || undefined,
      contractType,
      customerKind: kind,
      customerName: kind === "company" ? selectedCompanyProfile?.legalName ?? companyName : selectedCustomerProfile?.fullName ?? String(form.get("customerName") || "").trim(),
      customerCccd: kind === "individual" ? customerCccd || undefined : undefined,
      customerAddress: kind === "individual" ? customerAddress || undefined : undefined,
      customerBankAccount: kind === "individual" ? customerBankAccount || undefined : undefined,
      customerBankName: kind === "individual" ? customerBankName || undefined : undefined,
      companyName: kind === "company" ? selectedCompanyProfile?.legalName ?? companyName : undefined,
      companyAddress: kind === "company" ? ((selectedCompanyProfile?.legalAddress || companyAddress) || undefined) : undefined,
      companyBankAccount: kind === "company" ? companyBankAccount || undefined : undefined,
      companyBankName: kind === "company" ? companyBankName || undefined : undefined,
      contactName: kind === "company" ? selectedContactProfile?.fullName ?? contactName : undefined,
      contactPhone: kind === "company" ? selectedContactProfile?.phone ?? String(form.get("contactPhone") || "").trim() : selectedCustomerProfile?.phone ?? String(form.get("contactPhone") || "").trim(),
      taxCode: kind === "company" ? ((selectedCompanyProfile?.taxCode ?? taxCode) || undefined) : undefined,
      billingEmail: kind === "company" ? ((selectedCompanyProfile?.billingEmail ?? billingEmail) || undefined) : undefined,
      serviceCode: serviceCode || undefined,
      pickup: primaryRoute.pickup,
      dropoff: primaryRoute.dropoff,
      routeLegs,
      serviceLabel,
      serviceClarification: serviceClarification || undefined,
      unit: unit || undefined,
      salesOwner: String(form.get("salesOwner") || salesOwnerOptions[0]),
      sourceOwnerName: sourceOwnerName || undefined,
      source: String(form.get("source") || "Manual"),
      guestCount: Number.isFinite(guestCount) ? guestCount : undefined,
      guestMarket,
      customerRecognitionCode,
      customerSourceCode,
      originProvinceCode,
      destinationProvinceCode,
      invoiceRequired,
      vehicleOwnership,
      vehiclePlateNo: vehiclePlateNo || undefined,
      driverFullName: driverFullName || undefined,
      driverCccd: driverCccd || undefined,
      driverPhone: driverPhone || undefined,
      supplierOwnerName: supplierOwnerName || undefined,
      supplierCccd: supplierCccd || undefined,
      supplierInvoiceRequired,
      supplierCompanyName: supplierCompanyName || undefined,
      supplierTaxCode: supplierTaxCode || undefined,
      supplierAddress: supplierAddress || undefined,
      supplierPhone: supplierPhone || undefined,
      supplierTotalWithVat: Number.isFinite(supplierTotalWithVat) ? supplierTotalWithVat : undefined,
      supplierBankAccount: supplierBankAccount || undefined,
      supplierBankName: supplierBankName || undefined,
      startAt: primaryRoute.startAt,
      endAt: primaryRoute.endAt,
      subtotalAmount,
      vatRate,
      vatAmount,
      amountDue,
      driverCost,
      vehicleCost,
      otherCost,
      paymentMethod: String(form.get("paymentMethod") || "").trim() || undefined,
      payer: String(form.get("payer") || "").trim() || undefined,
      collectionAccountOwner: String(form.get("collectionAccountOwner") || "").trim() || undefined,
      collectionBankAccount: String(form.get("collectionBankAccount") || "").trim() || undefined,
      collectionBankName: String(form.get("collectionBankName") || "").trim() || undefined,
      quoteNote: String(form.get("quoteNote") || "").trim() || undefined,
      customerConfirmationNote: String(form.get("customerConfirmationNote") || "").trim() || undefined,
      priority: String(form.get("priority") || "normal") as DispatchPriority,
      salesNote: String(form.get("salesNote") || "").trim() || undefined,
      quoteStatus: "draft",
      orderStatus: "pending_dispatch_review",
      dispatchStatus: "waiting_assignment",
      paymentStatus: "unpaid",
      invoiceStatus: invoiceRequired ? (kind === "company" && (selectedCompanyProfile?.taxCode ?? taxCode) && (selectedCompanyProfile?.billingEmail ?? billingEmail) ? "ready_to_issue" : "pending_info") : "not_required",
      reconciliationStatus: "open"
    };

    const saved = await runSupabaseRpc(
      "submit_dispatch_order_proposal",
      {
        p_order: orderRpcPayload(order),
        p_actor: "Sale"
      },
      `Không lưu được đề xuất điều xe ${order.code}`
    );
    if (!saved) return;
    const syncedTransportFields = await syncOrderTransportCodeFields(order);
    if (!syncedTransportFields) return;

    runCommand("order.submit_proposal", (current) => submitDispatchProposal(current, order, audit), `Đã gửi đề xuất điều xe ${order.code} vào hàng chờ điều hành xét duyệt.`);
    setSelectedOrderId(order.id);
    setTab("Lệnh điều xe");
    (["dispatcher", "manager", "admin"] as AppNotification["audience"][]).forEach((audience) => {
      notify({
        audience,
        eventType: "dispatch_proposal_submitted",
        title: "Đề xuất điều xe mới",
        body: `${order.code} / ${order.customerName}`,
        entityId: order.id,
        payload: buildDispatchProposalIntegrationPayload(order, audience)
      });
    });
    formElement.reset();
    } finally {
      endAction(actionKey);
    }
  }

  async function submitDriverProposal(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    if (!can(currentRole, "submit_driver_proposal")) {
      setMessage(`${roleLabels[currentRole]} không có quyền gửi đề xuất từ tài xế.`);
      return false;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const driverId = currentRole === "driver" ? authDriverId || mobileDriverId : mobileDriverId;
    const selectedDriver = state.drivers.find((driver) => driver.id === driverId);
    const customerName = String(form.get("customerName") || "").trim();
    const contactPhone = String(form.get("contactPhone") || "").trim();
    const pickup = String(form.get("pickup") || "").trim();
    const dropoff = String(form.get("dropoff") || "").trim();
    const startAt = String(form.get("startAt") || "").trim();
    const endAt = String(form.get("endAt") || "").trim();
    const serviceLabel = String(form.get("serviceLabel") || "").trim();
    const note = String(form.get("note") || "").trim();
    const urgent = form.get("urgent") === "yes";
    const urgentReason = String(form.get("urgentReason") || "").trim();

    if (!selectedDriver) {
      setMessage("Chưa xác định được hồ sơ tài xế để gửi đề xuất.");
      return false;
    }
    if (!customerName || !contactPhone || !pickup || !dropoff || !startAt || !endAt || !serviceLabel) {
      setMessage("Vui lòng nhập đủ thông tin tối thiểu của đề xuất.");
      return false;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      setMessage("Giờ kết thúc phải sau giờ bắt đầu.");
      return false;
    }
    if (urgent && !urgentReason) {
      setMessage("Đề xuất khẩn cần có lý do gấp.");
      return false;
    }

    const actionKey = "driver:proposal";
    if (!beginAction(actionKey, "Gửi đề xuất tài xế")) return false;
    try {
    const orderCode = await reserveDispatchOrderCode(startAt.slice(0, 10));
    if (!orderCode) return false;

    const order: DispatchOrder = {
      id: makeId("order"),
      code: orderCode,
      orderDate: startAt.slice(0, 10),
      customerKind: "individual",
      customerName,
      contactName: customerName,
      contactPhone,
      pickup,
      dropoff,
      serviceLabel,
      salesOwner: urgent ? selectedDriver.fullName : "Chờ Sale tiếp nhận",
      sourceOwnerName: selectedDriver.fullName,
      source: "Driver",
      amountDue: 0,
      driverCost: 0,
      vehicleCost: 0,
      otherCost: 0,
      startAt: toIsoFromInput(startAt),
      endAt: toIsoFromInput(endAt),
      quoteNote: note || undefined,
      salesNote: urgent ? `Khẩn: ${urgentReason}${note ? ` | Ghi chú: ${note}` : ""}` : note || undefined,
      priority: urgent ? "urgent" : "normal",
      quoteStatus: "draft",
      orderStatus: urgent ? "pending_dispatch_review" : "draft",
      dispatchStatus: "waiting_assignment",
      paymentStatus: "unpaid",
      invoiceStatus: "not_required",
      reconciliationStatus: "open"
    };

    const saved = await runSupabaseRpc(
      "submit_dispatch_order_proposal",
      {
        p_order: orderRpcPayload(order),
        p_actor: "Driver"
      },
      `Không lưu được đề xuất từ tài xế ${order.code}`
    );
    if (!saved) return false;

    runCommand("driver.submit_proposal", (current) => submitDriverDispatchProposal(current, order, audit), urgent ? `Đã gửi đề xuất khẩn ${order.code} cho điều hành duyệt nhanh.` : `Đã gửi đề xuất ${order.code} cho Sales tiếp nhận.`);
    notify({
      audience: "driver",
      eventType: urgent ? "urgent_driver_proposal_submitted" : "driver_proposal_submitted",
      title: urgent ? "Đề xuất khẩn đã gửi" : "Đề xuất đã gửi Sales",
      body: urgent ? `${order.code} đang chờ điều hành duyệt nhanh.` : `${order.code} đang chờ Sales hoàn thiện thông tin.`,
      entityId: order.id,
      targetDriverId: selectedDriver.id
    });
    if (urgent) {
      notifyMany(["dispatcher", "manager", "admin"], { eventType: "urgent_driver_proposal_submitted", title: "Đề xuất khẩn từ tài xế", body: `${order.code} / ${order.customerName}`, entityId: order.id });
      notifyMany(["sale", "manager", "admin"], { eventType: "urgent_driver_proposal_needs_sales_completion", title: "Đề xuất khẩn cần Sales bổ sung", body: `${order.code} / ${selectedDriver.fullName}`, entityId: order.id });
    } else {
      notifyMany(["sale", "manager", "admin"], { eventType: "driver_proposal_submitted", title: "Đề xuất tài xế mới", body: `${order.code} / ${selectedDriver.fullName}`, entityId: order.id });
    }
    formElement.reset();
    return true;
    } finally {
      endAction(actionKey);
    }
  }

  async function submitDriverTripReport(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    if (!can(currentRole, "submit_driver_report")) {
      setMessage(`${roleLabels[currentRole]} không có quyền gửi báo cáo sau chuyến.`);
      return false;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const orderId = String(form.get("orderId") || "").trim();
    const targetOrder = state.orders.find((order) => order.id === orderId);
    const driverId = currentRole === "driver" ? authDriverId || mobileDriverId : mobileDriverId;

    if (!targetOrder) {
      setMessage("Chưa xác định được chuyến để ghi báo cáo.");
      return false;
    }
    if (targetOrder.driverId !== driverId) {
      setMessage("Báo cáo chỉ được ghi cho chuyến của tài xế đang chọn.");
      return false;
    }
    if (targetOrder.dispatchStatus !== "completed") {
      setMessage("Chỉ có thể báo cáo sau khi chuyến đã hoàn thành.");
      return false;
    }

    const collectedAmount = Number(form.get("driverCollectedAmount") || 0);
    const useFuel = form.get("useFuel") === "yes";
    const useToll = form.get("useToll") === "yes";
    const useParking = form.get("useParking") === "yes";
    const useWater = form.get("useWater") === "yes";
    const useOther = form.get("useOther") === "yes";
    const driverExpenseFuel = useFuel ? Number(form.get("driverExpenseFuel") || 0) : 0;
    const driverExpenseToll = useToll ? Number(form.get("driverExpenseToll") || 0) : 0;
    const driverExpenseParking = useParking ? Number(form.get("driverExpenseParking") || 0) : 0;
    const driverExpenseWater = useWater ? Number(form.get("driverExpenseWater") || 0) : 0;
    const driverExpenseOther = useOther ? Number(form.get("driverExpenseOther") || 0) : 0;
    const driverExpenseNote = String(form.get("driverExpenseNote") || "").trim();

    const expenseValues = [driverExpenseFuel, driverExpenseToll, driverExpenseParking, driverExpenseWater, driverExpenseOther];
    if (collectedAmount < 0 || expenseValues.some((value) => value < 0)) {
      setMessage("Số tiền báo cáo không được âm.");
      return false;
    }
    if ((useFuel && driverExpenseFuel <= 0) || (useToll && driverExpenseToll <= 0) || (useParking && driverExpenseParking <= 0) || (useWater && driverExpenseWater <= 0) || (useOther && driverExpenseOther <= 0)) {
      setMessage("Các khoản chi phí đã tick cần có số tiền lớn hơn 0.");
      return false;
    }

    const actionKey = `driver:report:${targetOrder.id}`;
    if (!beginAction(actionKey, "Gửi báo cáo sau chuyến")) return false;
    try {
    const saved = await runSupabaseRpc(
      "submit_driver_trip_report",
      {
        p_order_id: targetOrder.id,
        p_driver_collected_amount: collectedAmount,
        p_driver_expense_fuel: driverExpenseFuel,
        p_driver_expense_toll: driverExpenseToll,
        p_driver_expense_parking: driverExpenseParking,
        p_driver_expense_water: driverExpenseWater,
        p_driver_expense_other: driverExpenseOther,
        p_driver_expense_note: driverExpenseNote || null
      },
      `Không lưu được báo cáo sau chuyến ${targetOrder.code}`
    );
    if (!saved) return false;

    runCommand(
      "driver.submit_trip_report",
      (current) =>
        submitDriverTripReportCommand(
          current,
          targetOrder.id,
          {
            driverCollectedAmount: collectedAmount,
            driverExpenseFuel,
            driverExpenseToll,
            driverExpenseParking,
            driverExpenseWater,
            driverExpenseOther,
            driverExpenseNote: driverExpenseNote || undefined
          },
          audit,
          false
        ),
      `Đã ghi nhận báo cáo sau chuyến cho ${targetOrder.code}.`
    );
    notify({
      audience: "driver",
      eventType: "driver_trip_report_submitted",
      title: "Đã gửi báo cáo sau chuyến",
      body: `${targetOrder.code} đã được ghi nhận.`,
      entityId: targetOrder.id,
      targetDriverId: targetOrder.driverId ?? undefined
    });
    notifyMany(["accountant", "manager", "admin"], {
      eventType: "driver_trip_report_submitted",
      title: "Tài xế đã gửi báo cáo chuyến",
      body: `${targetOrder.code} / thu hộ ${money(collectedAmount)}`,
      entityId: targetOrder.id
    });
    formElement.reset();
    return true;
    } finally {
      endAction(actionKey);
    }
  }

  async function promoteDriverProposalToDispatch(orderId: string) {
    const targetOrder = state.orders.find((order) => order.id === orderId);
    if (!targetOrder) return;
    if (!can(currentRole, "create_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền tiếp nhận đề xuất tài xế.`);
      return;
    }
    if (targetOrder.source !== "Driver" || targetOrder.orderStatus !== "draft") {
      setMessage(`${targetOrder.code} không phải đề xuất thường đang chờ Sales.`);
      return;
    }

    const actionKey = `driver-proposal:promote:${orderId}`;
    if (!beginAction(actionKey, "Chuyển đề xuất tài xế")) return;
    try {
    const nextOrder: DispatchOrder = {
      ...targetOrder,
      salesOwner: authLabel || targetOrder.salesOwner,
      orderStatus: "pending_dispatch_review",
      dispatchStatus: "waiting_assignment",
      salesNote: targetOrder.salesNote ? `${targetOrder.salesNote} | Sales đã tiếp nhận` : "Sales đã tiếp nhận đề xuất tài xế"
    };
    const saved = await runSupabaseRpc(
      "submit_dispatch_order_proposal",
      {
        p_order: orderRpcPayload(nextOrder),
        p_actor: "Sale"
      },
      `Không lưu được chuyển đề xuất ${targetOrder.code} sang điều hành`
    );
    if (!saved) return;

    runCommand(
      "order.submit_proposal",
      (current) => ({
        ...current,
        orders: current.orders.map((order) => (order.id === orderId ? nextOrder : order)),
        auditEvents: [
          audit({
            actor: "Sale",
            entityType: "dispatch_order",
            entityId: orderId,
            action: "accepted_driver_proposal",
            reason: "Sales accepted driver proposal for dispatcher review"
          }),
          ...current.auditEvents
        ]
      }),
      `Đã chuyển ${targetOrder.code} sang hàng chờ điều hành duyệt.`
    );
    notifyMany(["dispatcher", "manager", "admin"], { eventType: "driver_proposal_promoted_to_dispatch", title: "Đề xuất điều xe mới", body: `${targetOrder.code} / ${targetOrder.customerName}`, entityId: orderId });
    notify({
      audience: "driver",
      eventType: "driver_proposal_accepted_by_sales",
      title: "Sales đã tiếp nhận đề xuất",
      body: `${targetOrder.code} đang chờ điều hành duyệt.`,
      entityId: orderId,
      targetDriverId: state.drivers.find((driver) => driver.fullName === targetOrder.sourceOwnerName)?.id
    });
    } finally {
      endAction(actionKey);
    }
  }

  function updateQuoteStatus(nextStatus: QuoteStatus) {
    if (!selectedOrder) return;
    if (!can(currentRole, "create_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền cập nhật báo giá.`);
      return;
    }

    runCommand("order.update_quote", (current) => updateQuoteStatusCommand(current, selectedOrder.id, nextStatus, audit), `Đã cập nhật báo giá ${selectedOrder.code}: ${quoteLabels[nextStatus]}.`);
  }

  async function assignOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!can(currentRole, "assign_vehicle")) {
      setMessage(`${roleLabels[currentRole]} không có quyền phân xe/tài xế.`);
      return;
    }
    if (selectedOrder.orderStatus !== "confirmed") {
      setMessage(`${selectedOrder.code} chưa được điều hành duyệt nên chưa thể phân xe/tài xế.`);
      return;
    }

    const form = new FormData(event.currentTarget);
    const assignmentMode = String(form.get("assignmentMode") || "company") as NonNullable<DispatchOrder["vehicleOwnership"]>;
    const vehicleId = String(form.get("vehicleId") || "");
    const driverId = String(form.get("driverId") || "");
    const externalVehiclePlate = String(form.get("externalVehiclePlate") || "").trim();
    const externalVehicleType = String(form.get("externalVehicleType") || "").trim();
    const externalDriverName = String(form.get("externalDriverName") || "").trim();
    const externalDriverPhone = String(form.get("externalDriverPhone") || "").trim();
    const externalPurchaseAmount = Number(form.get("externalPurchaseAmount") || 0);
    const reason = String(form.get("reason") || "Assign resource").trim();
    const currentAssignment = state.assignments.find((assignment) => assignment.dispatchOrderId === selectedOrder.id && assignment.status === "active");
    const selectedVehicle = state.vehicles.find((item) => item.id === vehicleId);
    const selectedDriver = state.drivers.find((item) => item.id === driverId);

    const actionKey = `dispatch:assign:${selectedOrder.id}`;
    if (!beginAction(actionKey, "Phân xe/tài xế")) return;
    try {
      if (assignmentMode === "rented") {
        if (!externalVehiclePlate || !externalVehicleType || !externalDriverName || !externalDriverPhone || externalPurchaseAmount <= 0) {
          setMessage("Xe thuê ngoài cần biển số, loại xe, tên tài xế, SĐT và giá mua dự kiến.");
          return;
        }
        const tripToken = selectedOrder.tripAccessToken || makeTripAccessToken();
        const tripExpiresAt = selectedOrder.tripAccessExpiresAt || new Date(new Date(selectedOrder.endAt).getTime() + 1000 * 60 * 60 * 24).toISOString();
        const saved = await runSupabaseRpc(
          "assign_external_vehicle_driver",
          {
            p_order_id: selectedOrder.id,
            p_external_vehicle_plate: externalVehiclePlate,
            p_external_vehicle_type: externalVehicleType,
            p_external_driver_name: externalDriverName,
            p_external_driver_phone: externalDriverPhone,
            p_estimated_purchase_amount: externalPurchaseAmount,
            p_trip_access_token: tripToken,
            p_trip_access_expires_at: tripExpiresAt,
            p_replace_assignment_id: currentAssignment?.id ?? null,
            p_reason: reason
          },
          `Không lưu được xe thuê ngoài cho ${selectedOrder.code}`
        );
        if (!saved) return;

        setState((current) => ({
          ...current,
          assignments: currentAssignment
            ? current.assignments.map((assignment) => assignment.id === currentAssignment.id ? { ...assignment, status: "replaced", replaceReason: reason } : assignment)
            : current.assignments,
          orders: current.orders.map((order) => order.id === selectedOrder.id ? {
            ...order,
            vehicleOwnership: "rented",
            vehicleId: undefined,
            driverId: undefined,
            vehiclePlateNo: externalVehiclePlate,
            driverFullName: externalDriverName,
            driverPhone: externalDriverPhone,
            externalVehiclePlate,
            externalVehicleType,
            externalDriverName,
            externalDriverPhone,
            supplierTotalWithVat: externalPurchaseAmount,
            vehicleCost: externalPurchaseAmount,
            dispatchStatus: "assigned",
            tripAccessToken: tripToken,
            tripAccessExpiresAt: tripExpiresAt,
            tripAccessRevoked: false
          } : order),
          auditEvents: [
            audit({
              actor: "Dispatcher",
              entityType: "assignment",
              entityId: selectedOrder.id,
              action: currentAssignment ? "assigned_external_driver_replaced_internal" : "assigned_external_driver",
              reason
            }),
            ...current.auditEvents
          ]
        }));
        const link = tripAccessUrl(tripToken);
        setMessage(`Đã phân xe thuê ngoài cho ${selectedOrder.code}. Trip Link: ${link}`);
        notify({ audience: "dispatcher", eventType: "external_driver_assigned", title: "Đã phân xe thuê ngoài", body: `${selectedOrder.code} / ${externalDriverName} / ${externalVehiclePlate}`, entityId: selectedOrder.id });
        notify({ audience: "accountant", eventType: "supplier_profile_needed", title: "Cần hoàn thiện hồ sơ NCC", body: `${selectedOrder.code} đã dùng xe thuê ngoài.`, entityId: selectedOrder.id });
        return;
      }

      const assignmentIssues = assignmentIssueLines({
        assignments: state.assignments,
        driver: selectedDriver,
        drivers: state.drivers,
        ignoreAssignmentId: currentAssignment?.id,
        order: selectedOrder,
        orders: state.orders,
        vehicle: selectedVehicle,
        vehicles: state.vehicles
      });
      const blockingIssues = assignmentIssues.filter((issue) => issue.tone === "block");
      if (blockingIssues.length > 0) {
        setMessage(`Không thể phân: ${blockingIssues.map((issue) => issue.text).join(" ")}`);
        return;
      }

      const conflict = findAssignmentConflict(
        {
          vehicleId,
          driverId,
          startAt: selectedOrder.startAt,
          endAt: selectedOrder.endAt,
          ignoreAssignmentId: currentAssignment?.id
        },
        state.assignments
      );

      if (conflict) {
        const conflictOrder = state.orders.find((order) => order.id === conflict.dispatchOrderId);
        const conflictVehicle = state.vehicles.find((item) => item.id === conflict.vehicleId);
        const conflictDriver = state.drivers.find((item) => item.id === conflict.driverId);
        const reasons = [
          conflict.vehicleId === vehicleId ? `xe ${conflictVehicle?.plateNo ?? conflict.vehicleId}` : "",
          conflict.driverId === driverId ? `tài xế ${conflictDriver?.fullName ?? conflict.driverId}` : ""
        ].filter(Boolean).join(" và ");
        setMessage(`Không thể phân: trùng lịch ${reasons || "nguồn lực"} với ${conflictOrder?.code ?? conflict.dispatchOrderId} (${formatDateTime(conflict.startAt)} - ${formatDateTime(conflict.endAt)}).`);
        return;
      }

      const assignment: Assignment = {
        id: makeId("assign"),
        dispatchOrderId: selectedOrder.id,
        vehicleId,
        driverId,
        status: "active",
        startAt: selectedOrder.startAt,
        endAt: selectedOrder.endAt,
        replaceReason: currentAssignment ? reason : undefined
      };

      const saved = await runSupabaseRpc(
        "assign_vehicle_driver",
        {
          p_order_id: selectedOrder.id,
          p_assignment_id: assignment.id,
          p_vehicle_id: vehicleId,
          p_driver_id: driverId,
          p_start_at: selectedOrder.startAt,
          p_end_at: selectedOrder.endAt,
          p_replace_assignment_id: currentAssignment?.id ?? null,
          p_replace_reason: currentAssignment ? reason : null
        },
        `Không lưu được phân xe/tài xế cho ${selectedOrder.code}`
      );
      if (!saved) return;

      runCommand(
        "dispatch.assign_vehicle_driver",
        (current) => assignVehicleDriver(current, selectedOrder.id, assignment, currentAssignment?.id, reason, audit, false),
        currentAssignment ? `Đã đổi xe/tài xế cho ${selectedOrder.code}.` : `Đã phân xe/tài xế cho ${selectedOrder.code}.`
      );
      notify({
        audience: "driver",
        eventType: "driver_assigned",
        title: "Bạn có chuyến mới cần nhận",
        body: `${selectedOrder.code} / ${formatDateTime(selectedOrder.startAt)}. Vui lòng bấm Nhận chuyến.`,
        entityId: selectedOrder.id,
        targetDriverId: driverId,
        payload: {
          orderCode: selectedOrder.code,
          ack: {
            status: "pending",
            reminderEveryMinutes: 2,
            maxReminderCount: 3,
            escalationAudience: "dispatcher"
          },
          action: {
            label: "Nhận chuyến",
            url: appOrderActionUrl(selectedOrder, "driver")
          }
        }
      });
      notify({
        audience: "dispatcher",
        eventType: currentAssignment ? "driver_assignment_replaced" : "driver_assigned",
        title: currentAssignment ? "Đã đổi phân xe" : "Đã phân xe/tài xế",
        body: `${selectedOrder.code} / ${selectedVehicle ? vehicleOptionLabel(selectedVehicle) : vehicleId} / ${selectedDriver?.fullName ?? driverId}. Chờ tài xế nhận chuyến.`,
        entityId: selectedOrder.id
      });
      notify({
        audience: "sale",
        eventType: "dispatch_order_assigned",
        title: "Đề xuất đã được triển khai",
        body: `${selectedOrder.code} đã có xe và tài xế.`,
        entityId: selectedOrder.id
      });
    } finally {
      endAction(actionKey);
    }
  }

  async function reviewDispatchProposal(orderId: string, decision: "approved" | "rejected", reason: string) {
    const targetOrder = state.orders.find((order) => order.id === orderId);
    if (!targetOrder) return;
    if (!can(currentRole, "assign_vehicle")) {
      setMessage(`${roleLabels[currentRole]} không có quyền xét duyệt đề xuất điều xe.`);
      return;
    }

    const cleanReason = reason.trim();
    if (decision === "rejected" && !cleanReason) {
      setMessage("Từ chối đề xuất cần nhập lý do.");
      return;
    }

    const actionKey = `dispatch:review:${orderId}:${decision}`;
    if (!beginAction(actionKey, decision === "approved" ? "Duyệt đề xuất" : "Từ chối đề xuất")) return;
    try {
    const saved = await runSupabaseRpc(
      "review_dispatch_proposal",
      {
        p_order_id: orderId,
        p_decision: decision,
        p_reason: cleanReason || "Dispatcher approved for assignment"
      },
      `Không lưu được xét duyệt đề xuất ${targetOrder.code}`
    );
    if (!saved) return;

    runCommand(
      "dispatch.review_proposal",
      (current) => reviewDispatchProposalCommand(current, orderId, decision, cleanReason || "Dispatcher approved for assignment", audit, false),
      decision === "approved" ? `Đã duyệt ${targetOrder.code}. Có thể phân xe/tài xế.` : `Đã từ chối đề xuất ${targetOrder.code}.`
    );
    notify({
      audience: "sale",
      eventType: decision === "approved" ? "dispatch_proposal_approved" : "dispatch_proposal_rejected",
      title: decision === "approved" ? "Đề xuất đã duyệt" : "Đề xuất bị từ chối",
      body: decision === "approved" ? `${targetOrder.code} chuyển sang chờ phân xe/tài xế.` : `${targetOrder.code} / ${cleanReason}`,
      entityId: orderId
    });
    } finally {
      endAction(actionKey);
    }
  }

  async function updateOrderDispatchStatus(orderId: string, nextStatus: DispatchStatus, reason: string, actor = "Dispatcher") {
    const targetOrder = state.orders.find((order) => order.id === orderId);
    if (!targetOrder) return;
    if (!can(currentRole, "update_dispatch_status")) {
      setMessage(`${roleLabels[currentRole]} không có quyền cập nhật trạng thái điều hành.`);
      return;
    }
    if (!canMoveDispatchStatus(targetOrder.dispatchStatus, nextStatus)) {
      setMessage(`Không thể chuyển ${targetOrder.code} từ ${dispatchLabels[targetOrder.dispatchStatus]} sang ${dispatchLabels[nextStatus]}.`);
      return;
    }
    const actionKey = `dispatch:status:${orderId}:${nextStatus}`;
    if (!beginAction(actionKey, "Cập nhật trạng thái chuyến")) return;
    try {
    const saved = await runSupabaseRpc(
      "update_dispatch_status",
      {
        p_order_id: orderId,
        p_next_status: nextStatus,
        p_reason: reason,
        p_actor: actor
      },
      `Không lưu được trạng thái ${targetOrder.code}`
    );
    if (!saved) return;

    runCommand(
      "dispatch.update_status",
      (current) => updateDispatchStatusCommand(current, orderId, nextStatus, reason, actor, audit, false),
      `Đã cập nhật ${targetOrder.code}: ${dispatchLabels[nextStatus]}.`
    );
    if (nextStatus === "completed") {
      notify({ audience: "accountant", eventType: "trip_completed", title: "Chuyến đã hoàn thành", body: `${targetOrder.code} sẵn sàng đối soát.`, entityId: orderId });
      notify({ audience: "dispatcher", eventType: "trip_completed", title: "Chuyến hoàn thành", body: `${targetOrder.code} đã xong chuyến.`, entityId: orderId });
    } else if (nextStatus === "driver_accepted") {
      notify({ audience: "dispatcher", eventType: "driver_accepted_trip", title: "Tài xế đã nhận chuyến", body: `${targetOrder.code} chờ xuất phát.`, entityId: orderId });
    } else if (nextStatus === "in_progress") {
      notify({ audience: "dispatcher", eventType: "trip_started", title: "Chuyến đang chạy", body: `${targetOrder.code} đang trên đường.`, entityId: orderId });
    }
    } finally {
      endAction(actionKey);
    }
  }

  function updateDispatchStatus(nextStatus: DispatchStatus, reason: string) {
    if (!selectedOrder) return;
    void updateOrderDispatchStatus(selectedOrder.id, nextStatus, reason);
  }

  async function updateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!can(currentRole, "update_order_details")) {
      setMessage(`${roleLabels[currentRole]} không có quyền sửa lệnh.`);
      return;
    }

    const form = new FormData(event.currentTarget);
    const canEditSales = can(currentRole, "create_order");
    const canEditDispatch = can(currentRole, "assign_vehicle");
    const canEditVehicleSupplier = canEditDispatch || can(currentRole, "record_payment");
    const canEditFinance = can(currentRole, "record_payment") || can(currentRole, "update_invoice") || can(currentRole, "close_order");
    const startAt = canEditSales ? String(form.get("startAt") ?? "") : toDateTimeInput(selectedOrder.startAt);
    const endAt = canEditSales ? String(form.get("endAt") ?? "") : toDateTimeInput(selectedOrder.endAt);
    const nextStartAt = canEditSales ? toIsoFromInput(startAt) : selectedOrder.startAt;
    const nextEndAt = canEditSales ? toIsoFromInput(endAt) : selectedOrder.endAt;
    const routeLegs = canEditSales ? parseRouteLegs(form) : selectedOrder.routeLegs;
    const primaryRoute = canEditSales && routeLegs?.length ? primaryLegValues(routeLegs, startAt, endAt) : { startAt: nextStartAt, endAt: nextEndAt, pickup: selectedOrder.pickup, dropoff: selectedOrder.dropoff };
    const readText = (name: string, fallback: string, editable: boolean) => (editable ? String(form.get(name) ?? "").trim() : fallback);
    const readMaybeText = (name: string, fallback: string | null | undefined, editable: boolean) => (editable ? String(form.get(name) ?? "").trim() || null : fallback ?? null);
    const readNumber = (name: string, fallback: number, editable: boolean) => (editable ? Number(form.get(name) || 0) : fallback);
    const readMaybeNumber = (name: string, fallback: number | null | undefined, editable: boolean) => (editable ? Number(form.get(name) || 0) : fallback ?? null);
    const readBoolean = (name: string, fallback: boolean | null | undefined, editable: boolean) => (editable ? form.get(name) === "yes" : fallback ?? null);

    const kind = (canEditSales ? String(form.get("customerKind") || selectedOrder.customerKind) : selectedOrder.customerKind) as DispatchOrder["customerKind"];
    const orderDate = readText("orderDate", selectedOrder.orderDate ?? "", canEditSales);
    const contractType = readMaybeText("contractType", selectedOrder.contractType, canEditSales) as DispatchOrder["contractType"] | null;
    const customerCccd = readMaybeText("customerCccd", selectedOrder.customerCccd, canEditSales);
    const customerAddress = readMaybeText("customerAddress", selectedOrder.customerAddress, canEditSales);
    const customerBankAccount = readMaybeText("customerBankAccount", selectedOrder.customerBankAccount, canEditSales);
    const customerBankName = readMaybeText("customerBankName", selectedOrder.customerBankName, canEditSales);
    const companyName = readMaybeText("companyName", selectedOrder.companyName, canEditSales);
    const customerName = kind === "company"
      ? companyName || selectedOrder.companyName || selectedOrder.customerName
      : readText("customerName", selectedOrder.customerName, canEditSales);
    const taxCode = readMaybeText("taxCode", selectedOrder.taxCode, canEditSales);
    const billingEmail = readMaybeText("billingEmail", selectedOrder.billingEmail, canEditSales);
    const companyAddress = readMaybeText("companyAddress", selectedOrder.companyAddress, canEditSales);
    const companyBankAccount = readMaybeText("companyBankAccount", selectedOrder.companyBankAccount, canEditSales);
    const companyBankName = readMaybeText("companyBankName", selectedOrder.companyBankName, canEditSales);
    const serviceSelection = canEditSales
      ? serviceOptionFor(String(form.get("serviceCode") || "").trim(), String(form.get("serviceLabel") || "").trim())
      : serviceOptionFor(selectedOrder.serviceCode, selectedOrder.serviceLabel);
    const serviceCode = serviceSelection.code;
    const serviceLabel = serviceSelection.label;
    const serviceClarification = readMaybeText("serviceClarification", selectedOrder.serviceClarification, canEditSales);
    const unit = readMaybeText("unit", selectedOrder.unit, canEditSales);
    const salesOwner = readText("salesOwner", selectedOrder.salesOwner, canEditSales);
    const sourceOwnerName = readMaybeText("sourceOwnerName", selectedOrder.sourceOwnerName, canEditSales);
    const source = readText("source", selectedOrder.source, canEditSales);
    const guestCount = readMaybeNumber("guestCount", selectedOrder.guestCount, canEditSales);
    const guestMarket = readMaybeText("guestMarket", selectedOrder.guestMarket, canEditSales) as DispatchOrder["guestMarket"] | null;
    const customerRecognitionCode = readMaybeText("customerRecognitionCode", selectedOrder.customerRecognitionCode, canEditSales) as DispatchOrder["customerRecognitionCode"] | null;
    const customerSourceCode = readMaybeText("customerSourceCode", selectedOrder.customerSourceCode, canEditSales) as DispatchOrder["customerSourceCode"] | null;
    const originProvinceCode = readMaybeText("originProvinceCode", selectedOrder.originProvinceCode, canEditSales);
    const destinationProvinceCode = readMaybeText("destinationProvinceCode", selectedOrder.destinationProvinceCode, canEditSales);
    const invoiceRequired = readBoolean("invoiceRequired", selectedOrder.invoiceRequired, canEditSales);
    const vehicleOwnership = readMaybeText("vehicleOwnership", selectedOrder.vehicleOwnership, canEditVehicleSupplier) as DispatchOrder["vehicleOwnership"] | null;
    const vehiclePlateNo = readMaybeText("vehiclePlateNo", selectedOrder.vehiclePlateNo, canEditVehicleSupplier);
    const driverFullName = readMaybeText("driverFullName", selectedOrder.driverFullName, canEditVehicleSupplier);
    const driverCccd = readMaybeText("driverCccd", selectedOrder.driverCccd, canEditVehicleSupplier);
    const driverPhone = readMaybeText("driverPhone", selectedOrder.driverPhone, canEditVehicleSupplier);
    const supplierOwnerName = readMaybeText("supplierOwnerName", selectedOrder.supplierOwnerName, canEditVehicleSupplier);
    const supplierCccd = readMaybeText("supplierCccd", selectedOrder.supplierCccd, canEditVehicleSupplier);
    const supplierInvoiceRequired = readBoolean("supplierInvoiceRequired", selectedOrder.supplierInvoiceRequired, canEditVehicleSupplier);
    const supplierCompanyName = readMaybeText("supplierCompanyName", selectedOrder.supplierCompanyName, canEditVehicleSupplier);
    const supplierTaxCode = readMaybeText("supplierTaxCode", selectedOrder.supplierTaxCode, canEditVehicleSupplier);
    const supplierAddress = readMaybeText("supplierAddress", selectedOrder.supplierAddress, canEditVehicleSupplier);
    const supplierPhone = readMaybeText("supplierPhone", selectedOrder.supplierPhone, canEditVehicleSupplier);
    const supplierTotalWithVat = readMaybeNumber("supplierTotalWithVat", selectedOrder.supplierTotalWithVat, canEditVehicleSupplier);
    const supplierBankAccount = readMaybeText("supplierBankAccount", selectedOrder.supplierBankAccount, canEditVehicleSupplier);
    const supplierBankName = readMaybeText("supplierBankName", selectedOrder.supplierBankName, canEditVehicleSupplier);
    const vatValues = canEditSales ? vatFromForm(form) : {
      subtotalAmount: selectedOrder.subtotalAmount,
      vatRate: selectedOrder.vatRate,
      vatAmount: selectedOrder.vatAmount,
      amountDue: selectedOrder.amountDue
    };
    const amountDue = vatValues.amountDue;
    const driverCost = readNumber("driverCost", selectedOrder.driverCost ?? 0, canEditSales);
    const vehicleCost = readNumber("vehicleCost", selectedOrder.vehicleCost ?? 0, canEditSales);
    const otherCost = readNumber("otherCost", selectedOrder.otherCost ?? 0, canEditSales);
    const paymentMethod = readMaybeText("paymentMethod", selectedOrder.paymentMethod, canEditFinance);
    const payer = readMaybeText("payer", selectedOrder.payer, canEditFinance);
    const collectionAccountOwner = readMaybeText("collectionAccountOwner", selectedOrder.collectionAccountOwner, canEditFinance);
    const collectionBankAccount = readMaybeText("collectionBankAccount", selectedOrder.collectionBankAccount, canEditFinance);
    const collectionBankName = readMaybeText("collectionBankName", selectedOrder.collectionBankName, canEditFinance);
    const quoteNote = readMaybeText("quoteNote", selectedOrder.quoteNote, canEditSales);
    const customerConfirmationNote = readMaybeText("customerConfirmationNote", selectedOrder.customerConfirmationNote, canEditSales);
    const priority = readText("priority", selectedOrder.priority ?? "normal", canEditSales) as DispatchPriority;
    const salesNote = readMaybeText("salesNote", selectedOrder.salesNote, canEditSales || canEditDispatch);

    if (!startAt || !endAt || new Date(primaryRoute.endAt) <= new Date(primaryRoute.startAt)) {
      setMessage("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }
    if (canEditSales && (!primaryRoute.pickup || !primaryRoute.dropoff)) {
      setMessage("Hành trình cần ít nhất một chặng có điểm đi và điểm đến.");
      return;
    }
    if (amountDue < 0 || driverCost < 0 || vehicleCost < 0 || otherCost < 0) {
      setMessage("Giá bán và chi phí không được âm.");
      return;
    }

    const activeAssignment = state.assignments.find((assignment) => assignment.dispatchOrderId === selectedOrder.id && assignment.status === "active");
    if (activeAssignment) {
      const conflict = findAssignmentConflict(
        {
          vehicleId: activeAssignment.vehicleId,
          driverId: activeAssignment.driverId,
          startAt: primaryRoute.startAt,
          endAt: primaryRoute.endAt,
          ignoreAssignmentId: activeAssignment.id
        },
        state.assignments
      );
      if (conflict) {
        const conflictOrder = state.orders.find((order) => order.id === conflict.dispatchOrderId);
        setMessage(`Không thể sửa giờ: trùng xe hoặc tài xế với ${conflictOrder?.code ?? conflict.dispatchOrderId}.`);
        return;
      }
    }

    const reason = String(form.get("editReason") || "Update order").trim();
    const rpcArgs = {
      p_order_id: selectedOrder.id,
      p_order_date: orderDate || null,
      p_contract_type: contractType || null,
      p_customer_kind: kind,
      p_customer_name: customerName,
      p_customer_cccd: kind === "individual" ? customerCccd || null : null,
      p_customer_address: kind === "individual" ? customerAddress || null : null,
      p_customer_bank_account: kind === "individual" ? customerBankAccount || null : null,
      p_customer_bank_name: kind === "individual" ? customerBankName || null : null,
      p_contact_name: readMaybeText("contactName", selectedOrder.contactName, canEditSales),
      p_contact_phone: readText("contactPhone", selectedOrder.contactPhone, canEditSales),
      p_company_name: kind === "company" ? companyName || customerName : null,
      p_company_address: kind === "company" ? companyAddress || null : null,
      p_company_bank_account: kind === "company" ? companyBankAccount || null : null,
      p_company_bank_name: kind === "company" ? companyBankName || null : null,
      p_tax_code: kind === "company" ? taxCode || null : null,
      p_billing_email: kind === "company" ? billingEmail || null : null,
      p_service_code: serviceCode || null,
      p_pickup: primaryRoute.pickup,
      p_dropoff: primaryRoute.dropoff,
      p_route_legs: routeLegs ?? null,
      p_service_label: serviceLabel,
      p_service_clarification: serviceClarification || null,
      p_unit: unit || null,
      p_sales_owner: salesOwner,
      p_source_owner_name: sourceOwnerName || null,
      p_source: source,
      p_invoice_required: invoiceRequired,
      p_vehicle_ownership: vehicleOwnership || null,
      p_vehicle_plate_no: vehiclePlateNo || null,
      p_driver_full_name: driverFullName || null,
      p_driver_cccd: driverCccd || null,
      p_driver_phone: driverPhone || null,
      p_supplier_owner_name: supplierOwnerName || null,
      p_supplier_cccd: supplierCccd || null,
      p_supplier_invoice_required: supplierInvoiceRequired,
      p_supplier_company_name: supplierCompanyName || null,
      p_supplier_tax_code: supplierTaxCode || null,
      p_supplier_address: supplierAddress || null,
      p_supplier_phone: supplierPhone || null,
      p_supplier_total_with_vat: Number.isFinite(supplierTotalWithVat) ? supplierTotalWithVat : null,
      p_supplier_bank_account: supplierBankAccount || null,
      p_supplier_bank_name: supplierBankName || null,
      p_subtotal_amount: vatValues.subtotalAmount ?? null,
      p_vat_rate: vatValues.vatRate ?? null,
      p_vat_amount: vatValues.vatAmount ?? null,
      p_start_at: primaryRoute.startAt,
      p_end_at: primaryRoute.endAt,
      p_amount_due: amountDue,
      p_driver_cost: driverCost,
      p_vehicle_cost: vehicleCost,
      p_other_cost: otherCost,
      p_payment_method: paymentMethod || null,
      p_payer: payer || null,
      p_collection_account_owner: collectionAccountOwner || null,
      p_collection_bank_account: collectionBankAccount || null,
      p_collection_bank_name: collectionBankName || null,
      p_quote_note: quoteNote || null,
      p_customer_confirmation_note: customerConfirmationNote || null,
      p_priority: priority,
      p_sales_note: salesNote || null,
      p_active_assignment_id: activeAssignment?.id ?? null,
      p_replacement_reason: reason
    };
    const saved = await runSupabaseRpc("update_dispatch_order", rpcArgs, `Không lưu được sửa lệnh ${selectedOrder.code}`);
    if (!saved) return;
    if (canEditSales) {
      const syncedTransportFields = await syncOrderTransportCodeFields({
        ...selectedOrder,
        guestCount: typeof guestCount === "number" && Number.isFinite(guestCount) ? guestCount : undefined,
        guestMarket: guestMarket ?? undefined,
        customerRecognitionCode: customerRecognitionCode ?? undefined,
        customerSourceCode: customerSourceCode ?? undefined,
        originProvinceCode: originProvinceCode || undefined,
        destinationProvinceCode: destinationProvinceCode || undefined
      });
      if (!syncedTransportFields) return;
    }

    runCommand(
      "order.update_details",
      (current) =>
        updateOrderDetails(
          current,
          selectedOrder.id,
          {
            orderDate: orderDate || undefined,
            contractType: contractType || undefined,
            customerKind: kind,
            customerName,
            customerCccd: customerCccd || undefined,
            customerAddress: customerAddress || undefined,
            customerBankAccount: customerBankAccount || undefined,
            customerBankName: customerBankName || undefined,
            contactName: readMaybeText("contactName", selectedOrder.contactName, canEditSales) || undefined,
            contactPhone: readText("contactPhone", selectedOrder.contactPhone, canEditSales),
            companyName: companyName || undefined,
            companyAddress: companyAddress || undefined,
            companyBankAccount: companyBankAccount || undefined,
            companyBankName: companyBankName || undefined,
            taxCode: taxCode || undefined,
            billingEmail: billingEmail || undefined,
            serviceCode: serviceCode || undefined,
            pickup: primaryRoute.pickup,
            dropoff: primaryRoute.dropoff,
            routeLegs,
            serviceLabel,
            serviceClarification: serviceClarification || undefined,
            unit: unit || undefined,
            salesOwner,
            sourceOwnerName: sourceOwnerName || undefined,
            source,
            guestCount: canEditSales && typeof guestCount === "number" && Number.isFinite(guestCount) ? guestCount : selectedOrder.guestCount,
            guestMarket: canEditSales ? guestMarket ?? undefined : selectedOrder.guestMarket,
            customerRecognitionCode: canEditSales ? customerRecognitionCode ?? undefined : selectedOrder.customerRecognitionCode,
            customerSourceCode: canEditSales ? customerSourceCode ?? undefined : selectedOrder.customerSourceCode,
            originProvinceCode: canEditSales ? originProvinceCode || undefined : selectedOrder.originProvinceCode,
            destinationProvinceCode: canEditSales ? destinationProvinceCode || undefined : selectedOrder.destinationProvinceCode,
            invoiceRequired: invoiceRequired ?? undefined,
            vehicleOwnership: vehicleOwnership ?? undefined,
            vehiclePlateNo: vehiclePlateNo || undefined,
            driverFullName: driverFullName || undefined,
            driverCccd: driverCccd || undefined,
            driverPhone: driverPhone || undefined,
            supplierOwnerName: supplierOwnerName || undefined,
            supplierCccd: supplierCccd || undefined,
            supplierInvoiceRequired: supplierInvoiceRequired ?? undefined,
            supplierCompanyName: supplierCompanyName || undefined,
            supplierTaxCode: supplierTaxCode || undefined,
            supplierAddress: supplierAddress || undefined,
            supplierPhone: supplierPhone || undefined,
            supplierTotalWithVat: supplierTotalWithVat == null ? undefined : supplierTotalWithVat,
            supplierBankAccount: supplierBankAccount || undefined,
            supplierBankName: supplierBankName || undefined,
            startAt: primaryRoute.startAt,
            endAt: primaryRoute.endAt,
            subtotalAmount: vatValues.subtotalAmount,
            vatRate: vatValues.vatRate,
            vatAmount: vatValues.vatAmount,
            amountDue,
            driverCost: driverCost ?? 0,
            vehicleCost: vehicleCost ?? 0,
            otherCost: otherCost ?? 0,
            paymentMethod: paymentMethod || undefined,
            payer: payer || undefined,
            collectionAccountOwner: collectionAccountOwner || undefined,
            collectionBankAccount: collectionBankAccount || undefined,
            collectionBankName: collectionBankName || undefined,
            quoteNote: quoteNote || undefined,
            customerConfirmationNote: customerConfirmationNote || undefined,
            priority,
            salesNote: salesNote || undefined
          },
          activeAssignment?.id,
          reason,
          audit,
          false
        ),
      `Đã cập nhật lệnh ${selectedOrder.code}.`
    );
  }

  async function cancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!can(currentRole, "create_order") && !can(currentRole, "assign_vehicle")) {
      setMessage(`${roleLabels[currentRole]} không có quyền hủy lệnh.`);
      return;
    }

    const form = new FormData(event.currentTarget);
    const reason = String(form.get("cancelReason") || "").trim();
    if (!reason) {
      setMessage("Hủy lệnh cần nhập lý do.");
      return;
    }

    const actionKey = `order:cancel:${selectedOrder.id}`;
    if (!beginAction(actionKey, "Hủy lệnh")) return;
    try {
    const saved = await runSupabaseRpc(
      "cancel_dispatch_order",
      {
        p_order_id: selectedOrder.id,
        p_reason: reason
      },
      `Không lưu được hủy lệnh ${selectedOrder.code}`
    );
    if (!saved) return;

    runCommand(
      "order.cancel",
      (current) => cancelOrderCommand(current, selectedOrder.id, reason, roleLabels[currentRole], audit, false),
      `Đã hủy lệnh ${selectedOrder.code}.`
    );
    event.currentTarget.reset();
    } finally {
      endAction(actionKey);
    }
  }

  async function updateActualCosts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!can(currentRole, "record_payment")) {
      setMessage(`${roleLabels[currentRole]} không có quyền cập nhật chi phí thực tế.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const actualDriverCost = Number(form.get("actualDriverCost") || 0);
    const actualVehicleCost = Number(form.get("actualVehicleCost") || 0);
    const actualOtherCost = Number(form.get("actualOtherCost") || 0);
    if (actualDriverCost < 0 || actualVehicleCost < 0 || actualOtherCost < 0) {
      setMessage("Chi phí thực tế không được âm.");
      return;
    }
    const actualCostNote = String(form.get("actualCostNote") || "").trim();
    const actionKey = `finance:actual-costs:${selectedOrder.id}`;
    if (!beginAction(actionKey, "Lưu chi phí thực tế")) return;
    try {
    const saved = await runSupabaseRpc(
      "update_actual_costs",
      {
        p_order_id: selectedOrder.id,
        p_actual_driver_cost: actualDriverCost,
        p_actual_vehicle_cost: actualVehicleCost,
        p_actual_other_cost: actualOtherCost,
        p_actual_cost_note: actualCostNote || null
      },
      `Không lưu được chi phí thực tế ${selectedOrder.code}`
    );
    if (!saved) return;

    runCommand(
      "finance.update_actual_costs",
      (current) => updateActualCostsCommand(current, selectedOrder.id, { actualDriverCost, actualVehicleCost, actualOtherCost, actualCostNote: actualCostNote || undefined }, audit, false),
      `Đã cập nhật chi phí thực tế cho ${selectedOrder.code}.`
    );
    } finally {
      endAction(actionKey);
    }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!can(currentRole, "record_payment")) {
      setMessage(`${roleLabels[currentRole]} không có quyền ghi nhận thanh toán.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    if (amount <= 0) {
      setMessage("Số tiền thanh toán phải lớn hơn 0.");
      return;
    }
    const paidAtInput = String(form.get("paidAt") || "").trim();
    const payment: Payment = {
      id: makeId("pay"),
      orderId: selectedOrder.id,
      amount,
      status: "valid",
      paidAt: paidAtInput ? new Date(paidAtInput).toISOString() : new Date().toISOString(),
      method: String(form.get("method")) as Payment["method"],
      collector: String(form.get("collector") || "").trim() || undefined,
      bankAccount: String(form.get("bankAccount") || "").trim() || undefined,
      bankName: String(form.get("bankName") || "").trim() || undefined,
      reference: String(form.get("reference") || "").trim() || undefined,
      note: String(form.get("note") || "").trim() || undefined
    };
    const nextPayments = [payment, ...state.payments];
    const orderPayments = nextPayments.filter((item) => item.orderId === selectedOrder.id);
    const paymentStatus = calculatePaymentStatus(selectedOrder.amountDue, orderPayments);

    const actionKey = `finance:payment:${selectedOrder.id}`;
    if (!beginAction(actionKey, "Ghi payment")) return;
    try {
    const saved = await runSupabaseRpc(
      "record_payment",
      {
        p_payment_id: payment.id,
        p_order_id: selectedOrder.id,
        p_amount: amount,
        p_method: payment.method,
        p_reference: payment.reference ?? null,
        p_paid_at: payment.paidAt,
        p_payment_status: paymentStatus,
        p_collector: payment.collector ?? null,
        p_bank_account: payment.bankAccount ?? null,
        p_bank_name: payment.bankName ?? null,
        p_note: payment.note ?? null
      },
      `Không lưu được thanh toán ${selectedOrder.code}`
    );
    if (!saved) return;

    runCommand(
      "finance.record_payment",
      (current) => recordPaymentCommand(current, payment, selectedOrder.id, paymentStatus, audit, false),
      `Đã ghi nhận ${money(amount)} cho ${selectedOrder.code}.`
    );
    event.currentTarget.reset();
    } finally {
      endAction(actionKey);
    }
  }

  async function updateInvoiceStatus(nextStatus: InvoiceStatus) {
    if (!selectedOrder) return;
    if (!can(currentRole, "update_invoice")) {
      setMessage(`${roleLabels[currentRole]} không có quyền cập nhật hóa đơn.`);
      return;
    }
    const actionKey = `finance:invoice:${selectedOrder.id}:${nextStatus}`;
    if (!beginAction(actionKey, "Cập nhật hóa đơn")) return;
    try {
    const saved = await runSupabaseRpc(
      "update_invoice_status",
      {
        p_order_id: selectedOrder.id,
        p_invoice_status: nextStatus
      },
      `Không lưu được hóa đơn ${selectedOrder.code}`
    );
    if (!saved) return;

    runCommand(
      "finance.update_invoice",
      (current) => updateInvoiceStatusCommand(current, selectedOrder.id, nextStatus, audit, false),
      `Đã cập nhật hóa đơn ${selectedOrder.code}: ${invoiceLabels[nextStatus]}.`
    );
    } finally {
      endAction(actionKey);
    }
  }

  async function reconcileOrder() {
    if (!selectedOrder) return;
    if (!can(currentRole, "close_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền đóng lệnh.`);
      return;
    }
    if (selectedOrder.dispatchStatus !== "completed") {
      setMessage("Chỉ đối soát/đóng lệnh sau khi chuyến hoàn thành.");
      return;
    }
    const actionKey = `finance:close:${selectedOrder.id}`;
    if (!beginAction(actionKey, "Đóng hồ sơ")) return;
    try {
    const saved = await runSupabaseRpc(
      "close_dispatch_order",
      {
        p_order_id: selectedOrder.id
      },
      `Không lưu được đối soát ${selectedOrder.code}`
    );
    if (!saved) return;

    runCommand(
      "finance.close_order",
      (current) => closeOrder(current, selectedOrder.id, audit, false),
      `Đã đối soát và đóng ${selectedOrder.code}.`
    );
    } finally {
      endAction(actionKey);
    }
  }

  function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can(currentRole, "manage_master_data")) {
      setMessage(`${roleLabels[currentRole]} không có quyền quản lý master data.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const vehicle: Vehicle = {
      id: makeId("vehicle"),
      plateNo: String(form.get("plateNo") || "").trim(),
      type: String(form.get("type") || "Sedan").trim(),
      seats: Number(form.get("seats") || 4),
      fuelType: String(form.get("fuelType") || "").trim() || undefined,
      ownershipType: String(form.get("ownershipType") || "company") as Vehicle["ownershipType"],
      defaultDriverId: String(form.get("defaultDriverId") || "").trim() || undefined,
      ownerName: String(form.get("ownerName") || "").trim() || undefined,
      ownerCccd: String(form.get("ownerCccd") || "").trim() || undefined,
      supplierInvoiceRequired: form.get("supplierInvoiceRequired") === "yes",
      supplierCompanyName: String(form.get("supplierCompanyName") || "").trim() || undefined,
      supplierTaxCode: String(form.get("supplierTaxCode") || "").trim() || undefined,
      supplierAddress: String(form.get("supplierAddress") || "").trim() || undefined,
      supplierPhone: String(form.get("supplierPhone") || "").trim() || undefined,
      supplierBankAccount: String(form.get("supplierBankAccount") || "").trim() || undefined,
      supplierBankName: String(form.get("supplierBankName") || "").trim() || undefined,
      status: String(form.get("status") || "active") as Vehicle["status"]
    };

    runCommand("master.create_vehicle", (current) => createVehicleCommand(current, vehicle, audit), `Đã thêm xe ${vehicle.plateNo}.`);
    event.currentTarget.reset();
  }

  function createDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can(currentRole, "manage_master_data")) {
      setMessage(`${roleLabels[currentRole]} không có quyền quản lý master data.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const driver: Driver = {
      id: makeId("driver"),
      fullName: String(form.get("fullName") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      cccd: String(form.get("cccd") || "").trim() || undefined,
      bankAccount: String(form.get("bankAccount") || "").trim() || undefined,
      bankName: String(form.get("bankName") || "").trim() || undefined,
      status: String(form.get("status") || "active") as Driver["status"]
    };

    runCommand("master.create_driver", (current) => createDriverCommand(current, driver, audit), `Đã thêm tài xế ${driver.fullName}.`);
    event.currentTarget.reset();
  }

  function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can(currentRole, "create_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền tạo hồ sơ khách.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") || "").trim();
    if (state.customers.some((customer) => customer.phone === phone)) {
      setMessage("SĐT khách cá nhân đã tồn tại. Hãy chọn hồ sơ có sẵn.");
      return;
    }
    const customer: Customer = {
      id: makeId("customer"),
      fullName: String(form.get("fullName") || "").trim(),
      phone,
      email: String(form.get("email") || "").trim() || undefined,
      address: String(form.get("address") || "").trim() || undefined,
      status: "active"
    };

    runCommand("customer.create", (current) => createCustomerCommand(current, customer, audit), `Đã thêm khách cá nhân ${customer.fullName}.`);
    event.currentTarget.reset();
  }

  function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can(currentRole, "create_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền tạo hồ sơ doanh nghiệp.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const taxCode = String(form.get("taxCode") || "").trim();
    if (state.companies.some((company) => company.taxCode === taxCode)) {
      setMessage("MST doanh nghiệp đã tồn tại. Hãy chọn công ty có sẵn.");
      return;
    }

    const company: Company = {
      id: makeId("company"),
      legalName: String(form.get("legalName") || "").trim(),
      taxCode,
      legalAddress: String(form.get("legalAddress") || "").trim() || undefined,
      billingEmail: String(form.get("billingEmail") || "").trim() || undefined,
      status: "active"
    };
    const contact: CompanyContact = {
      id: makeId("contact"),
      companyId: company.id,
      fullName: String(form.get("contactName") || "").trim(),
      phone: String(form.get("contactPhone") || "").trim(),
      email: String(form.get("contactEmail") || "").trim() || undefined,
      position: String(form.get("position") || "").trim() || undefined,
      isPrimary: true
    };

    runCommand("company.create", (current) => createCompanyCommand(current, company, contact, audit), `Đã thêm doanh nghiệp ${company.legalName}.`);
    event.currentTarget.reset();
  }

  async function cleanTripOperationalData() {
    if (!canCleanTripData) {
      setMessage("Chỉ admin hoặc quản lý mới được dọn dữ liệu chuyến.");
      return;
    }
    if (tripCleanupConfirmText.trim().toUpperCase() !== tripCleanupPhrase) {
      setMessage(`Vui lòng gõ ${tripCleanupPhrase} để xác nhận dọn dữ liệu chuyến.`);
      return;
    }
    const actionKey = "clean-trip-operational-data";
    if (!beginAction(actionKey, "Dọn dữ liệu chuyến")) return;
    try {
      if (supabaseConfigured) {
        const saved = await runSupabaseRpc("clean_trip_operational_data", {}, "Không dọn được dữ liệu chuyến");
        if (!saved) return;
      }
      setState((current) => ({
        ...current,
        orders: [],
        assignments: [],
        payments: [],
        auditEvents: [],
        notifications: []
      }));
      setSelectedOrderId("");
      setShowNotifications(false);
      setShowTripCleanupConfirm(false);
      setTripCleanupConfirmText("");
      setMessage("Đã dọn dữ liệu chuyến. Xe, tài xế, khách hàng, công ty, cấu hình và tài khoản vẫn giữ nguyên.");
    } finally {
      endAction(actionKey);
    }
  }

  if (supabaseConfigured && !authReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-panel p-6">
        <div className="border border-line bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">Đang kiểm tra đăng nhập...</div>
      </main>
    );
  }

  if (supabaseConfigured && authReady && !roleState) {
    return (
      <main className="grid min-h-screen place-items-center bg-panel p-6">
        <div className="w-full max-w-md border border-line bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold text-ink">Cần đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Bạn chưa có phiên đăng nhập hợp lệ. Vui lòng qua màn hình Auth để tiếp tục.</p>
          <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white" href="/auth">
            Mở Auth
          </Link>
        </div>
      </main>
    );
  }

  if (supabaseConfigured && !persistenceReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-panel p-6">
        <div className="border border-line bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">Đang tải dữ liệu vận hành...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-white px-4 py-5 lg:block">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-brand text-white">
            <Route size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Angel One Travel</p>
            <h1 className="text-lg font-semibold text-ink">Ops Control</h1>
          </div>
        </div>
        <nav className="mt-8 space-y-1 text-sm">
          {visibleTabs.map((item) => (
            <button
              className={`flex h-10 w-full items-center rounded-md px-3 text-left font-medium ${activeTab === item ? "bg-teal-50 text-brand" : "text-slate-600 hover:bg-slate-50"}`}
              key={item}
              onClick={() => {
                setShowNotifications(false);
                setTab(item);
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <section className="lg:pl-64">
        <header className="border-b border-line bg-white px-5 py-4 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500">Pilot vận hành local - {vietnamDateTimeLiveLabel(now)}</p>
              <h2 className="text-2xl font-semibold text-ink">{activeTab}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={supabaseConfigured ? "good" : "info"}>{supabaseConfigured ? "Supabase config ready" : "Local demo mode"}</Badge>
              <Badge tone="info">{authLabel}</Badge>
              <Badge tone="good">Audit on</Badge>
              <Badge tone="info">{roleLabels[currentRole]}</Badge>
              <div className="relative" ref={notificationsRef}>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setShowNotifications((open) => !open)}
                  type="button"
                >
                  <Bell size={16} /> {visibleNotifications.length}
                </button>
                {showNotifications && visibleNotifications.length > 0 && (
                  <div className="absolute right-0 z-20 mt-2 w-80 border border-line bg-white p-2 text-sm shadow-lg">
                    {visibleNotifications.map((item) => (
                      <div className="border-b border-line px-2 py-2 last:border-0" key={item.id}>
                        <p className="font-semibold text-ink">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Link className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" href="/auth">Auth</Link>
              {canCleanTripData && (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
                  onClick={() => {
                    setTripCleanupConfirmText("");
                    setShowTripCleanupConfirm(true);
                  }}
                  type="button"
                >
                  <RefreshCw size={16} /> Dọn chuyến
                </button>
              )}
            </div>
          </div>
          <p className="mt-3 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{message}</p>
        </header>
        {showTripCleanupConfirm && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
            <div className="w-full max-w-lg border border-line bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-ink">Dọn dữ liệu chuyến</h3>
              <p className="mt-2 text-sm text-slate-600">
                Thao tác này chỉ xóa lệnh điều xe, phân xe, payment, audit, notification và queue n8n liên quan đến chuyến. Xe, tài xế,
                khách hàng, doanh nghiệp, cấu hình và tài khoản đăng nhập vẫn được giữ nguyên.
              </p>
              <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="trip-cleanup-confirm">
                Gõ {tripCleanupPhrase} để xác nhận
              </label>
              <input
                className="mt-2 h-11 w-full border border-line px-3 text-sm font-semibold uppercase outline-none focus:border-brand"
                id="trip-cleanup-confirm"
                onChange={(event) => setTripCleanupConfirmText(event.target.value)}
                value={tripCleanupConfirmText}
              />
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setShowTripCleanupConfirm(false);
                    setTripCleanupConfirmText("");
                  }}
                  type="button"
                >
                  Hủy
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md bg-amber-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={tripCleanupConfirmText.trim().toUpperCase() !== tripCleanupPhrase || isActionPending("clean-trip-operational-data")}
                  onClick={cleanTripOperationalData}
                  type="button"
                >
                  {isActionPending("clean-trip-operational-data") ? "Đang dọn..." : "Dọn dữ liệu chuyến"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="border-b border-line bg-white px-3 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleTabs.map((item) => (
              <button
                className={`shrink-0 rounded-full border px-3 py-2 text-sm font-medium ${activeTab === item ? "border-teal-600 bg-teal-50 text-brand" : "border-line bg-white text-slate-600"}`}
                key={item}
                onClick={() => {
                  setShowNotifications(false);
                  setTab(item);
                }}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6 p-5 pb-28 lg:p-8">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Chuyến hôm nay" value={String(todayOrders.length)} icon={CalendarClock} detail="Tính theo ngày chạy, không theo ngày tạo." />
            <StatCard label="Chờ duyệt" value={String(pendingDispatchReviewCount)} icon={ClipboardList} detail="Sale đã gửi đề xuất, điều hành cần xét duyệt." />
            <StatCard label="Chờ phân xe" value={String(todayOrders.filter((o) => o.orderStatus === "confirmed" && o.dispatchStatus === "waiting_assignment").length)} icon={Clock3} detail="Đã duyệt, cần phân xe/tài xế." />
            <StatCard label="Doanh thu booked" value={money(revenue)} icon={Banknote} detail={`Đã thu ${money(collected)} hợp lệ.`} />
          </section>

          {activeTab === "Dashboard" && (
            <DashboardPanel
              alerts={alerts}
              calendarMonth={calendarMonth}
              drivers={state.drivers}
              currentRole={currentRole}
              isActionPending={isActionPending}
              notifications={visibleNotifications}
              orders={state.orders}
              reviewDispatchProposal={reviewDispatchProposal}
              vehicles={state.vehicles}
              calendarDay={calendarDay}
              setCalendarMonth={setCalendarMonth}
              setCalendarDay={setCalendarDay}
              setSelectedOrderId={setSelectedOrderId}
              setTab={setTab}
              compact={isMobileViewport}
            />
          )}
          {activeTab === "Lệnh điều xe" && (
            <OrdersPanel
              companies={state.companies}
              companyContacts={state.companyContacts}
              customerKind={customerKind}
              currentRole={currentRole}
              customers={state.customers}
              filteredOrders={filteredOrders}
              auditEvents={state.auditEvents}
              assignments={state.assignments}
              drivers={state.drivers}
              payments={state.payments}
              query={query}
              isActionPending={isActionPending}
              selectedOrderId={selectedOrder?.id}
              selectedOrder={selectedOrder}
              setCustomerKind={setCustomerKind}
              setQuery={setQuery}
              setSelectedOrderId={setSelectedOrderId}
              vehicles={state.vehicles}
              createOrder={createOrder}
              cancelOrder={cancelOrder}
              promoteDriverProposalToDispatch={promoteDriverProposalToDispatch}
              updateOrder={updateOrder}
              updateQuoteStatus={updateQuoteStatus}
            />
          )}
          {activeTab === "Khách hàng" && (
            <CustomersPanel
              companies={state.companies}
              companyContacts={state.companyContacts}
              createCompany={createCompany}
              createCustomer={createCustomer}
              currentRole={currentRole}
              customers={state.customers}
              orders={state.orders}
            />
          )}
          {activeTab === "Điều hành" && selectedOrder && (
            <DispatchPanel
              assignments={state.assignments}
              calendarMonth={calendarMonth}
              calendarDay={calendarDay}
              drivers={state.drivers}
              orders={state.orders}
              payments={state.payments}
              selectedOrder={selectedOrder}
              currentRole={currentRole}
              isActionPending={isActionPending}
              assignOrder={assignOrder}
              auditEvents={state.auditEvents}
              cancelOrder={cancelOrder}
              reviewDispatchProposal={reviewDispatchProposal}
              setCalendarMonth={setCalendarMonth}
              setCalendarDay={setCalendarDay}
              setSelectedOrderId={setSelectedOrderId}
              updateDispatchStatus={updateDispatchStatus}
              updateOrder={updateOrder}
              vehicles={state.vehicles}
              compact={isMobileViewport}
            />
          )}
          {activeTab === "Màn làm việc" && (
            <DriverMobilePanel
              currentRole={currentRole}
              drivers={state.drivers}
              mobileDriverId={mobileDriverId}
              notifications={visibleNotifications}
              orders={state.orders}
              now={now}
              isActionPending={isActionPending}
              selectedOrderId={selectedOrder?.id}
              authDriverId={authDriverId}
              setMobileDriverId={setMobileDriverId}
              setSelectedOrderId={setSelectedOrderId}
              submitDriverProposal={submitDriverProposal}
              submitDriverTripReport={submitDriverTripReport}
              updateOrderDispatchStatus={updateOrderDispatchStatus}
              vehicles={state.vehicles}
            />
          )}
          {activeTab === "Users" && <AdminUsersPanel currentRole={currentRole} />}
          {activeTab === "Master data" && <MasterDataPanel createDriver={createDriver} createVehicle={createVehicle} currentRole={currentRole} drivers={state.drivers} vehicles={state.vehicles} />}
          {activeTab === "Tài chính" && selectedOrder && (
            <FinancePanel
              assignments={state.assignments}
              currentRole={currentRole}
              drivers={state.drivers}
              orders={state.orders}
              payments={state.payments}
              selectedOrder={selectedOrder}
              isActionPending={isActionPending}
              setSelectedOrderId={setSelectedOrderId}
              recordPayment={recordPayment}
              updateActualCosts={updateActualCosts}
              updateInvoiceStatus={updateInvoiceStatus}
              reconcileOrder={reconcileOrder}
              vehicles={state.vehicles}
            />
          )}
          {activeTab === "Audit" && (can(currentRole, "view_audit") ? <AuditPanel events={state.auditEvents} /> : <AccessDenied role={currentRole} />)}
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:hidden">
          <div className="flex gap-2 overflow-x-auto px-3 py-2">
            {visibleTabs.map((item) => {
              const Icon = tabIcon(item);
              return (
                <button
                  className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 text-[11px] font-medium ${activeTab === item ? "border-teal-600 bg-teal-50 text-brand" : "border-line bg-white text-slate-600"}`}
                  key={item}
                  onClick={() => setTab(item)}
                  type="button"
                >
                  <Icon size={16} />
                  <span>{item}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </section>
    </main>
  );
}

function CustomerCell({ order }: { order: DispatchOrder }) {
  if (order.customerKind === "company") {
    return (
      <div>
        <div className="flex items-center gap-2">
          <UsersRound size={15} className="text-brand" />
          <p className="font-medium">{order.companyName || order.customerName}</p>
        </div>
        <p className="mt-1 text-xs text-slate-500">{order.contactName} / {order.contactPhone}</p>
        {(order.taxCode || order.billingEmail) && <p className="mt-1 text-xs text-slate-500">MST {order.taxCode || "-"} / {order.billingEmail || "-"}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <UserRound size={15} className="text-brand" />
        <p className="font-medium">{order.customerName}</p>
      </div>
      <p className="mt-1 text-xs text-slate-500">{order.contactPhone}</p>
    </div>
  );
}

function DispatchBoard({
  assignments,
  compact = false,
  drivers,
  orders,
  selectedOrderId,
  setSelectedOrderId,
  vehicles
}: {
  assignments: Assignment[];
  compact?: boolean;
  drivers: Driver[];
  orders: DispatchOrder[];
  selectedOrderId?: string;
  setSelectedOrderId: (id: string) => void;
  vehicles: Vehicle[];
}) {
  return (
    <div className="border border-line bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold text-ink">Bảng điều hành xe</h3>
          <p className="text-sm text-slate-500">Theo dõi trực quan chuyến, xe, tài xế, giờ chạy và cảnh báo.</p>
        </div>
        <Badge tone="info">{orders.length} chuyến</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse text-sm ${compact ? "min-w-[900px]" : "min-w-[1080px]"}`}>
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Giờ</th>
              <th className="px-4 py-3 font-semibold">Lệnh</th>
              <th className="px-4 py-3 font-semibold">Khách</th>
              <th className="px-4 py-3 font-semibold">Tuyến</th>
              <th className="px-4 py-3 font-semibold">Xe</th>
              <th className="px-4 py-3 font-semibold">Tài xế</th>
              <th className="px-4 py-3 font-semibold">Trạng thái</th>
              {!compact && <th className="px-4 py-3 font-semibold">Cảnh báo</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...orders].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()).map((order) => {
              const assignment = assignments.find((item) => item.dispatchOrderId === order.id && item.status === "active");
              const vehicle = vehicles.find((item) => item.id === (assignment?.vehicleId ?? order.vehicleId));
              const driver = drivers.find((item) => item.id === (assignment?.driverId ?? order.driverId));
              const needsAttention = order.dispatchStatus === "waiting_assignment" || order.changedNearStart;

              return (
                <tr
                  className={`cursor-pointer align-top hover:bg-slate-50 ${selectedOrderId === order.id ? "bg-teal-50/60" : ""}`}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <td className="px-4 py-4 font-semibold text-ink">{timeOnly(order.startAt)}<p className="text-xs font-normal text-slate-500">{timeOnly(order.endAt)}</p></td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-ink">{order.code}</p>
                    <p className="text-xs text-slate-500">{order.serviceLabel}</p>
                  </td>
                  <td className="px-4 py-4"><CustomerCell order={order} /></td>
                  <td className="px-4 py-4">
                    <p className="flex items-center gap-1"><MapPin size={14} /> {order.pickup}</p>
                    <p className="mt-1 text-slate-500">{order.dropoff}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium">{vehicle ? vehicle.plateNo : "Chưa phân"}</p>
                    <p className="text-xs text-slate-500">{vehicle ? `${vehicle.type} / ${vehicle.seats} chỗ` : "waiting"}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium">{driver ? driver.fullName : "Chưa phân"}</p>
                    <p className="text-xs text-slate-500">{driver?.phone || "waiting"}</p>
                  </td>
                  <td className="px-4 py-4"><Badge tone={statusTone(order)}>{dispatchLabels[order.dispatchStatus]}</Badge></td>
                  {!compact && (
                    <td className="px-4 py-4">
                      {needsAttention ? <Badge tone="warn">{order.dispatchStatus === "waiting_assignment" ? "Cần phân xe" : "Đổi sát giờ"}</Badge> : <Badge tone="good">Ổn</Badge>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VehicleCalendar({
  compact = false,
  monthDate,
  orders,
  selectedOrderId,
  setCalendarDay,
  setMonthDate,
  setSelectedOrderId,
  vehicles
}: {
  compact?: boolean;
  monthDate: Date;
  orders: DispatchOrder[];
  selectedOrderId?: string;
  setCalendarDay?: (date: Date) => void;
  setMonthDate: (date: Date) => void;
  setSelectedOrderId: (id: string) => void;
  vehicles: Vehicle[];
}) {
  const cells = getMonthCells(monthDate);
  const month = monthDate.getMonth();
  const todayKey = vietnamDateKey();
  const eventsByDate = orders.reduce<Record<string, DispatchOrder[]>>((acc, order) => {
    const key = orderDateKey(order);
    acc[key] = [...(acc[key] ?? []), order].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return acc;
  }, {});

  function moveMonth(direction: -1 | 1) {
    const next = new Date(monthDate);
    next.setMonth(monthDate.getMonth() + direction);
    setMonthDate(next);
  }

  return (
    <section className="border border-line bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="text-brand" size={20} />
          <div>
            <h3 className="font-semibold text-ink">Lịch xe</h3>
            <p className="text-sm text-slate-500">Click event để chọn chuyến và xử lý điều hành.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="grid size-9 place-items-center rounded-md border border-line bg-white hover:bg-slate-50" onClick={() => moveMonth(-1)} type="button">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-40 text-center text-sm font-semibold text-ink">
            {vietnamMonthLabel(monthDate)}
          </div>
          <button className="grid size-9 place-items-center rounded-md border border-line bg-white hover:bg-slate-50" onClick={() => moveMonth(1)} type="button">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-line bg-slate-50 text-xs font-semibold uppercase text-slate-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div className="px-3 py-2" key={day}>{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date) => {
          const key = dateKey(date);
          const dayOrders = eventsByDate[key] ?? [];
          const visible = dayOrders.slice(0, compact ? 2 : 3);
          const isOutside = date.getMonth() !== month;
          const isSelectedDay = dayOrders.some((order) => order.id === selectedOrderId);

          return (
            <div
              className={`min-h-[118px] border-b border-r border-line p-2 ${compact ? "min-h-[96px]" : ""} ${isOutside ? "bg-slate-50/60 text-slate-400" : "bg-white"} ${isSelectedDay ? "ring-2 ring-inset ring-teal-200" : ""}`}
              key={key}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${key === todayKey ? "bg-brand text-white" : ""}`}>{date.getDate()}</span>
                {dayOrders.length > 0 && <span className="text-[11px] text-slate-400">{dayOrders.length}</span>}
              </div>
              <div className="space-y-1">
                {visible.map((order) => {
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  return (
                    <button
                      className={`block h-7 w-full truncate rounded-sm px-2 text-left text-xs font-semibold shadow-sm ${calendarEventClass(order)} ${order.id === selectedOrderId ? "outline outline-2 outline-offset-1 outline-slate-800" : ""}`}
                      key={order.id}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setCalendarDay?.(new Date(order.startAt));
                      }}
                      title={`${order.code} / ${order.pickup} -> ${order.dropoff}`}
                      type="button"
                    >
                      {timeOnly(order.startAt)} {vehicle?.plateNo ?? "Chưa xe"} · {order.pickup}
                    </button>
                  );
                })}
                {dayOrders.length > visible.length && <p className="px-1 text-xs font-medium text-slate-500">{dayOrders.length - visible.length} more</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 text-xs">
        <Badge tone="warn">Chờ phân xe</Badge>
        <Badge tone="info">Đã phân/đang chạy</Badge>
        <Badge tone="good">Hoàn thành</Badge>
        <Badge tone="danger">Đã hủy</Badge>
      </div>
    </section>
  );
}

function DayTimeline({
  day,
  drivers,
  orders,
  selectedOrderId,
  setDay,
  setSelectedOrderId,
  vehicles
}: {
  day: Date;
  drivers: Driver[];
  orders: DispatchOrder[];
  selectedOrderId?: string;
  setDay: (date: Date) => void;
  setSelectedOrderId: (id: string) => void;
  vehicles: Vehicle[];
}) {
  const dayKey = dateKey(day);
  const dayOrders = orders
    .filter((order) => orderDateKey(order) === dayKey)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const laneHeight = 38;
  const rowTop = 34;
  const timelineHeight = rowTop + Math.max(2, dayOrders.length) * laneHeight + 16;

  function eventLane(order: DispatchOrder, index: number) {
    const previousOverlaps = dayOrders
      .slice(0, index)
      .filter((other) => order.startAt < other.endAt && order.endAt > other.startAt).length;
    return previousOverlaps % 3;
  }

  return (
    <section className="border border-line bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Clock3 className="text-brand" size={20} />
          <div>
            <h3 className="font-semibold text-ink">Lịch ngày 24h</h3>
            <p className="text-sm text-slate-500">Theo dõi chuyến theo từng giờ, dễ thấy khoảng trống và khung giờ bận.</p>
          </div>
        </div>
        <input
          className={`${inputClass()} w-full md:w-44`}
          onChange={(event) => setDay(new Date(`${event.target.value}T00:00:00`))}
          type="date"
          value={inputDateValue(day)}
        />
      </div>
      <div className="overflow-x-auto">
        <div className="relative min-w-[1040px]" style={{ height: timelineHeight }}>
          <div className="absolute left-0 right-0 top-0 h-8 border-b border-line bg-slate-50">
            {Array.from({ length: 25 }, (_, hour) => (
              <div
                className="absolute top-0 h-8 border-l border-line pl-1 pt-2 text-[11px] font-medium text-slate-500"
                key={hour}
                style={{ left: `${(hour / 24) * 100}%` }}
              >
                {String(hour).padStart(2, "0")}
              </div>
            ))}
          </div>
          {Array.from({ length: 25 }, (_, hour) => (
            <div
              className="absolute bottom-0 top-8 border-l border-line/80"
              key={hour}
              style={{ left: `${(hour / 24) * 100}%` }}
            />
          ))}
          {dayOrders.map((order, index) => {
            const vehicle = vehicles.find((item) => item.id === order.vehicleId);
            const driver = drivers.find((item) => item.id === order.driverId);
            const left = `${(hourOffset(order.startAt) / 1440) * 100}%`;
            const width = `${Math.max(4, (durationMinutes(order) / 1440) * 100)}%`;
            const top = rowTop + eventLane(order, index) * laneHeight + Math.floor(index / 3) * laneHeight;

            return (
              <button
                className={`absolute h-8 rounded-md px-2 text-left text-[11px] font-semibold shadow-sm ${calendarEventClass(order)} ${selectedOrderId === order.id ? "outline outline-2 outline-offset-2 outline-slate-900" : ""}`}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                style={{ left, top, width }}
                type="button"
              >
                <span className="block truncate">{timeOnly(order.startAt)}-{timeOnly(order.endAt)} · {vehicle?.plateNo ?? "Chưa xe"} · {order.pickup}</span>
                <span className="block truncate font-medium opacity-90">{driver?.fullName ?? "Chưa tài xế"} / {order.code}</span>
              </button>
            );
          })}
          {dayOrders.length === 0 && (
            <div className="absolute left-4 top-12 rounded-md border border-line bg-panel px-4 py-3 text-sm text-slate-500">
              Ngày này chưa có chuyến.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function VehicleResourceTimeline({
  day,
  drivers,
  orders,
  selectedOrderId,
  setDay,
  setSelectedOrderId,
  vehicles
}: {
  day: Date;
  drivers: Driver[];
  orders: DispatchOrder[];
  selectedOrderId?: string;
  setDay: (date: Date) => void;
  setSelectedOrderId: (id: string) => void;
  vehicles: Vehicle[];
}) {
  const dayKey = dateKey(day);
  const dayOrders = orders.filter((order) => orderDateKey(order) === dayKey);
  const rows = [
    ...vehicles.map((vehicle) => ({
      id: vehicle.id,
      label: vehicle.plateNo,
      detail: `${vehicle.type} / ${vehicle.seats} chỗ / ${vehicle.status}`,
      orders: dayOrders.filter((order) => order.vehicleId === vehicle.id)
    })),
    {
      id: "unassigned",
      label: "Chưa phân xe",
      detail: "Các chuyến đang chờ điều hành",
      orders: dayOrders.filter((order) => !order.vehicleId)
    }
  ];

  return (
    <section className="border border-line bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Car className="text-brand" size={20} />
          <div>
            <h3 className="font-semibold text-ink">Lịch xe theo ngày</h3>
            <p className="text-sm text-slate-500">Mỗi xe là một hàng, 24h chạy ngang để thấy xe bận/rảnh.</p>
          </div>
        </div>
        <input
          className={`${inputClass()} w-full md:w-44`}
          onChange={(event) => setDay(new Date(`${event.target.value}T00:00:00`))}
          type="date"
          value={inputDateValue(day)}
        />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[150px_1fr] border-b border-line bg-slate-50 text-xs font-semibold text-slate-500">
            <div className="border-r border-line px-3 py-2">Xe</div>
            <div className="relative h-8">
              {Array.from({ length: 25 }, (_, hour) => (
                <div
                  className="absolute top-0 h-8 border-l border-line pl-1 pt-2"
                  key={hour}
                  style={{ left: `${(hour / 24) * 100}%` }}
                >
                  {String(hour).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <div className="grid grid-cols-[150px_1fr] border-b border-line" key={row.id}>
              <div className="border-r border-line px-3 py-3">
                <p className="text-sm font-semibold text-ink">{row.label}</p>
                <p className="mt-1 text-xs text-slate-500">{row.detail}</p>
              </div>
              <div className="relative h-16 bg-white">
                {Array.from({ length: 25 }, (_, hour) => (
                  <div
                    className="absolute bottom-0 top-0 border-l border-line/70"
                    key={hour}
                    style={{ left: `${(hour / 24) * 100}%` }}
                  />
                ))}
                {row.orders.map((order, index) => {
                  const driver = drivers.find((item) => item.id === order.driverId);
                  const left = `${(hourOffset(order.startAt) / 1440) * 100}%`;
                  const width = `${Math.max(5, (durationMinutes(order) / 1440) * 100)}%`;
                  const top = row.orders.length > 1 ? 6 + (index % 2) * 28 : 14;

                  return (
                    <button
                      className={`absolute h-7 truncate rounded-md px-2 text-left text-[11px] font-semibold shadow-sm ${calendarEventClass(order)} ${selectedOrderId === order.id ? "outline outline-2 outline-offset-1 outline-slate-900" : ""}`}
                      key={order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                      style={{ left, top, width }}
                      title={`${timeOnly(order.startAt)}-${timeOnly(order.endAt)} ${order.code}`}
                      type="button"
                    >
                      {timeOnly(order.startAt)} {order.code} · {driver?.fullName ?? "Chưa tài xế"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function OrderDetailPanel({
  assignments,
  auditEvents,
  currentRole,
  drivers,
  order,
  payments,
  cancelOrder,
  updateOrder,
  updateQuoteStatus,
  vehicles
}: {
  assignments: Assignment[];
  auditEvents: AuditEvent[];
  currentRole: AppRole;
  drivers: Driver[];
  order: DispatchOrder;
  payments: Payment[];
  cancelOrder?: (event: FormEvent<HTMLFormElement>) => void;
  updateOrder?: (event: FormEvent<HTMLFormElement>) => void;
  updateQuoteStatus?: (nextStatus: QuoteStatus) => void;
  vehicles: Vehicle[];
}) {
  const orderPayments = payments.filter((payment) => payment.orderId === order.id);
  const paid = orderPayments.filter((payment) => payment.status === "valid").reduce((sum, payment) => sum + payment.amount, 0);
  const activeAssignment = assignments.find((assignment) => assignment.dispatchOrderId === order.id && assignment.status === "active");
  const vehicle = vehicles.find((item) => item.id === (activeAssignment?.vehicleId || order.vehicleId));
  const driver = drivers.find((item) => item.id === (activeAssignment?.driverId || order.driverId));
  const transport = resolveOrderTransport(order, assignments, vehicles, drivers);
  const editVehicleOwnership = order.vehicleOwnership ?? (transport.vehicleOwnership === "partner" || transport.vehicleOwnership === "rented" ? "rented" : "company");
  const editSupplierInvoiceRequired = order.supplierInvoiceRequired ?? transport.supplierInvoiceRequired ?? true;
  const orderAudit = auditEvents.filter((event) => event.entityId === order.id || event.entityId === activeAssignment?.id).slice(0, 5);
  const cost = orderCost(order);
  const profit = orderProfit(order);
  const margin = orderMargin(order);
  const salesEditable = can(currentRole, "create_order");
  const dispatchEditable = can(currentRole, "assign_vehicle") || can(currentRole, "record_payment");
  const financeEditable = can(currentRole, "record_payment") || can(currentRole, "update_invoice") || can(currentRole, "close_order");
  const notesEditable = salesEditable || can(currentRole, "assign_vehicle");
  const readiness = orderReadiness(order);

  return (
    <section className="border border-line bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold text-ink">Chi tiết lệnh {order.code}</h3>
          <p className="mt-1 text-sm text-slate-500">{order.customerKind === "company" ? "Khách doanh nghiệp" : "Khách cá nhân"} / {order.salesOwner} / {order.source}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(order)}>{dispatchLabels[order.dispatchStatus]}</Badge>
          <Badge tone={orderStatusTone(order.orderStatus)}>{orderStatusLabels[order.orderStatus]}</Badge>
          <Badge tone={quoteTone(order.quoteStatus)}>{quoteLabels[order.quoteStatus ?? "draft"]}</Badge>
          <Badge tone={order.paymentStatus === "paid" ? "good" : order.paymentStatus === "partial" ? "warn" : "danger"}>{paymentLabels[order.paymentStatus]}</Badge>
          <Badge tone={order.invoiceStatus === "issued" || order.invoiceStatus === "not_required" ? "good" : "warn"}>{invoiceLabels[order.invoiceStatus]}</Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <Badge tone={salesEditable ? "good" : "neutral"}>Sale {salesEditable ? "được sửa" : "chỉ xem"}</Badge>
        <Badge tone={dispatchEditable ? "good" : "neutral"}>Xe/NCC {dispatchEditable ? "được sửa" : "chỉ xem"}</Badge>
        <Badge tone={financeEditable ? "good" : "neutral"}>Kế toán {financeEditable ? "được sửa" : "chỉ xem"}</Badge>
      </div>
      {updateQuoteStatus && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border border-line bg-panel p-3">
          <span className="text-sm font-semibold text-ink">Trạng thái báo giá</span>
          {(["draft", "sent", "approved", "rejected", "expired"] as QuoteStatus[]).map((status) => (
            <button
              className={`h-8 rounded-md border px-3 text-xs font-semibold ${order.quoteStatus === status ? "border-brand bg-teal-50 text-brand" : "border-line bg-white text-slate-600 hover:bg-slate-50"}`}
              key={status}
              onClick={() => updateQuoteStatus(status)}
              type="button"
            >
              {quoteLabels[status]}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4 text-sm lg:grid-cols-4">
        <StatMini label="Khách/Company" value={order.companyName || order.customerName} />
        <StatMini label="Liên hệ" value={`${order.contactName || order.customerName} / ${order.contactPhone}`} />
        <StatMini label="Xe/Tài xế" value={`${vehicle?.plateNo ?? "Chưa xe"} / ${driver?.fullName ?? "Chưa tài xế"}`} />
        <StatMini label="Công nợ" value={money(Math.max(order.amountDue - paid, 0))} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {readiness.map((item) => {
          const ready = item.missing.length === 0;
          return (
            <section className={`border p-3 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} key={item.label}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-semibold ${ready ? "text-emerald-900" : "text-amber-950"}`}>{item.label}</p>
                  <p className={`mt-1 text-xs ${ready ? "text-emerald-700" : "text-amber-800"}`}>{item.description}</p>
                </div>
                <Badge tone={ready ? "good" : "warn"}>{ready ? "Đủ" : `${item.missing.length} thiếu`}</Badge>
              </div>
              {item.missing.length > 0 && (
                <p className="mt-3 text-xs leading-5 text-amber-900">
                  Thiếu: {item.missing.slice(0, 5).join(", ")}{item.missing.length > 5 ? ` +${item.missing.length - 5}` : ""}
                </p>
              )}
            </section>
          );
        })}
      </div>
      <div className="mt-4 grid gap-4 text-sm lg:grid-cols-4">
        <div className="border border-line bg-panel p-3">
          <p className="font-medium text-ink">Hành trình</p>
          <p className="mt-2 text-slate-600">{formatDateTime(order.startAt)} - {formatDateTime(order.endAt)}</p>
          <p className="mt-1 text-slate-600">{routeSummaryForOrder(order)}</p>
        </div>
        <div className="border border-line bg-panel p-3">
          <p className="font-medium text-ink">Báo giá</p>
          <p className="mt-2 text-slate-600">Giá bán: {money(order.amountDue)}</p>
          <p className="mt-1 text-slate-600">Chi phí: {money(cost)}</p>
          <p className={`mt-1 font-semibold ${profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>Lãi dự kiến: {money(profit)}</p>
          <p className="mt-1 text-slate-600">Chi phí thực tế: {money(orderActualCost(order))}</p>
          <p className={`mt-1 font-semibold ${orderActualProfit(order) >= 0 ? "text-emerald-700" : "text-red-700"}`}>Lãi thực tế: {money(orderActualProfit(order))}</p>
          <p className={`mt-1 font-semibold ${margin >= 0.15 ? "text-emerald-700" : "text-red-700"}`}>Biên: {Math.round(margin * 100)}%</p>
          {order.quoteNote && <p className="mt-2 text-xs text-slate-500">{order.quoteNote}</p>}
        </div>
        <div className="border border-line bg-panel p-3">
          <p className="font-medium text-ink">Billing</p>
          <p className="mt-2 text-slate-600">Ngày lệnh: {order.orderDate || "-"}</p>
          <p className="mt-2 text-slate-600">MST: {order.taxCode || "-"}</p>
          <p className="mt-1 text-slate-600">Email HĐ: {order.billingEmail || "-"}</p>
          <p className="mt-1 text-slate-600">Hình thức xe: {order.vehicleOwnership === "rented" ? "Thuê ngoài" : "Công ty"}</p>
          <p className="mt-1 text-slate-600">Thanh toán: {order.paymentMethod || "-"}</p>
          <p className="mt-1 text-slate-600">Thu từ: {order.payer || "-"}</p>
        </div>
        <div className="border border-line bg-panel p-3">
          <p className="font-medium text-ink">Audit gần nhất</p>
          <div className="mt-2 space-y-1">
            {orderAudit.length === 0 && <p className="text-slate-500">Chưa có audit riêng.</p>}
            {orderAudit.map((event) => <p className="truncate text-slate-600" key={event.id}>{event.action} / {event.actor}</p>)}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <StaticPinMap order={order} />
      </div>
      <div className="mt-4">
        <OrderDocumentPreviews assignments={assignments} drivers={drivers} order={order} payments={payments} vehicles={vehicles} />
      </div>
      {updateOrder && cancelOrder && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
          <form className="border border-line bg-panel p-4" key={order.id} onSubmit={updateOrder}>
            <h3 className="font-semibold text-ink">Sửa lệnh</h3>
            <div className="mt-4 grid gap-4">
              <fieldset className="space-y-4" disabled={!salesEditable}>
                <SectionDetails
                  badge={salesEditable ? "Sale" : "Chỉ xem"}
                  description="Sale giữ phần tạo lệnh, khách hàng, hành trình và báo giá."
                  title="1. Thông tin lệnh & khách hàng"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Ngày lệnh"><input className={inputClass()} defaultValue={order.orderDate ?? ""} name="orderDate" placeholder="2026-08-25" /></Field>
                    <Field label="Loại hợp đồng">
                      <select className={inputClass()} defaultValue={order.contractType ?? "simple"} name="contractType">
                        <option value="simple">Hợp đồng giản đơn</option>
                        <option value="template">Hợp đồng mẫu</option>
                        <option value="terms">Hợp đồng điều khoản</option>
                      </select>
                    </Field>
                    <Field label="Loại khách">
                      <select className={inputClass()} defaultValue={order.customerKind} name="customerKind">
                        <option value="individual">Cá nhân</option>
                        <option value="company">Doanh nghiệp</option>
                      </select>
                    </Field>
                    <Field label="Sale phụ trách"><input className={inputClass()} defaultValue={order.salesOwner} name="salesOwner" /></Field>
                    <Field label="Người tạo nguồn"><input className={inputClass()} defaultValue={order.sourceOwnerName ?? ""} name="sourceOwnerName" /></Field>
                    <Field label="Nguồn"><input className={inputClass()} defaultValue={order.source} name="source" /></Field>
                    <Field label="Số lượng khách"><input className={inputClass()} defaultValue={order.guestCount ?? 1} min="0" name="guestCount" type="number" /></Field>
                    <Field label="Dòng khách">
                      <select className={inputClass()} defaultValue={order.guestMarket ?? "domestic"} name="guestMarket">
                        {guestMarketOptions.map((item) => <option key={item.value} value={item.value}>{item.code} - {item.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Nhận biết khách">
                      <select className={inputClass()} defaultValue={order.customerRecognitionCode ?? "DL"} name="customerRecognitionCode">
                        {customerRecognitionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Nguồn khách">
                      <select className={inputClass()} defaultValue={order.customerSourceCode ?? "DDH"} name="customerSourceCode">
                        {customerSourceCodeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Mã tỉnh/thành điểm đi">
                      <select className={inputClass()} defaultValue={order.originProvinceCode ?? "DAD"} name="originProvinceCode">
                        {provinceCodeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Mã tỉnh/thành điểm đến">
                      <select className={inputClass()} defaultValue={order.destinationProvinceCode ?? "QNH"} name="destinationProvinceCode">
                        {provinceCodeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Xuất hóa đơn"><select className={inputClass()} defaultValue={order.invoiceRequired ? "yes" : "no"} name="invoiceRequired"><option value="no">Không</option><option value="yes">Có</option></select></Field>
                  </div>
                </SectionDetails>

                <SectionDetails
                  badge="Sale"
                  description="Thông tin người đi, công ty liên quan và liên hệ."
                  title="2. Thông tin khách hàng"
                >
                  {order.customerKind === "individual" ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Tên khách / người đi"><input className={inputClass()} defaultValue={order.customerName} name="customerName" required /></Field>
                      <Field label="SĐT"><input className={inputClass()} defaultValue={order.contactPhone} name="contactPhone" required /></Field>
                      <Field label="CCCD khách"><input className={inputClass()} defaultValue={order.customerCccd ?? ""} name="customerCccd" /></Field>
                      <Field label="Địa chỉ khách"><input className={inputClass()} defaultValue={order.customerAddress ?? ""} name="customerAddress" /></Field>
                      <Field label="TK ngân hàng KH"><input className={inputClass()} defaultValue={order.customerBankAccount ?? ""} name="customerBankAccount" /></Field>
                      <Field label="Ngân hàng KH"><input className={inputClass()} defaultValue={order.customerBankName ?? ""} name="customerBankName" /></Field>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-3">
                      <input name="customerName" type="hidden" value={order.companyName || order.customerName} />
                      <Field label="Người sử dụng dịch vụ"><input className={inputClass()} defaultValue={order.contactName ?? ""} name="contactName" required /></Field>
                      <Field label="SĐT người sử dụng"><input className={inputClass()} defaultValue={order.contactPhone} name="contactPhone" required /></Field>
                      <Field label="Tên công ty"><input className={inputClass()} defaultValue={order.companyName ?? order.customerName} name="companyName" required /></Field>
                      <Field label="MST"><input className={inputClass()} defaultValue={order.taxCode ?? ""} name="taxCode" /></Field>
                      <Field label="Email HĐ"><input className={inputClass()} defaultValue={order.billingEmail ?? ""} name="billingEmail" type="email" /></Field>
                      <Field label="Địa chỉ công ty"><input className={inputClass()} defaultValue={order.companyAddress ?? ""} name="companyAddress" /></Field>
                      <Field label="TK ngân hàng CTy"><input className={inputClass()} defaultValue={order.companyBankAccount ?? ""} name="companyBankAccount" /></Field>
                      <Field label="Ngân hàng CTy"><input className={inputClass()} defaultValue={order.companyBankName ?? ""} name="companyBankName" /></Field>
                    </div>
                  )}
                </SectionDetails>

                <SectionDetails
                  badge="Sale"
                  description="Đủ để mô tả chuyến, tính giá và ghi chú gửi điều hành."
                  title="3. Hành trình & báo giá"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <ServiceFields initialCode={order.serviceCode} initialLabel={order.serviceLabel} />
                    <Field label="Diễn giải"><input className={inputClass()} defaultValue={order.serviceClarification ?? ""} name="serviceClarification" /></Field>
                    <Field label="Đơn vị tính">
                      <select className={inputClass()} defaultValue={order.unit ?? "Chuyến"} name="unit">
                        <option>Chuyến</option>
                        <option>Ngày</option>
                        <option>Kỳ</option>
                        <option>Tháng</option>
                      </select>
                    </Field>
                    <RouteLegFields initialLegs={order.routeLegs?.length ? order.routeLegs : [{ pickup: order.pickup, dropoff: order.dropoff, startAt: order.startAt, endAt: order.endAt }]} />
                    <Field label="Ưu tiên"><select className={inputClass()} defaultValue={order.priority ?? "normal"} name="priority"><option value="normal">Thường</option><option value="high">Cao</option><option value="urgent">Gấp</option></select></Field>
                    <VatCalculatorFields initialSubtotal={order.subtotalAmount ?? 0} initialVatRate={order.vatRate ?? 0} initialTotal={order.amountDue} />
                    <Field label="Chi phí tài xế"><input className={inputClass()} defaultValue={order.driverCost ?? 0} min="0" name="driverCost" type="number" /></Field>
                    <Field label="Chi phí xe"><input className={inputClass()} defaultValue={order.vehicleCost ?? 0} min="0" name="vehicleCost" type="number" /></Field>
                    <Field label="Phụ phí"><input className={inputClass()} defaultValue={order.otherCost ?? 0} min="0" name="otherCost" type="number" /></Field>
                    <div className="md:col-span-3">
                      <Field label="Ghi chú báo giá"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} defaultValue={order.quoteNote ?? ""} name="quoteNote" placeholder="Bao gồm/chưa gồm phí cầu đường, giờ chờ, VAT..." /></Field>
                    </div>
                    <div className="md:col-span-3">
                      <Field label="Nội dung gửi khách xác nhận"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} defaultValue={order.customerConfirmationNote ?? ""} name="customerConfirmationNote" placeholder="Điều khoản thanh toán, thông tin cần khách kiểm tra, ghi chú xác nhận..." /></Field>
                    </div>
                  </div>
                </SectionDetails>
              </fieldset>

              <fieldset className="space-y-4" disabled={!dispatchEditable}>
                <SectionDetails
                  badge={dispatchEditable ? "Điều hành/Kế toán" : "Chỉ xem"}
                  description="Bổ sung xe, tài xế, nhà cung cấp thuê ngoài và ghi chú vận hành."
                  title="4. Xe / tài xế / nhà cung cấp"
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Field label="Hình thức xe"><select className={inputClass()} defaultValue={editVehicleOwnership} name="vehicleOwnership"><option value="company">Công ty</option><option value="rented">Thuê ngoài/Hợp tác</option></select></Field>
                    <Field label="Biển số xe"><input className={inputClass()} defaultValue={transport.vehiclePlate === "-" ? "" : transport.vehiclePlate} name="vehiclePlateNo" /></Field>
                    <Field label="Họ tên tài xế"><input className={inputClass()} defaultValue={transport.driverName === "-" ? "" : transport.driverName} name="driverFullName" /></Field>
                    <Field label="CCCD tài xế"><input className={inputClass()} defaultValue={transport.driverCccd === "-" ? "" : transport.driverCccd} name="driverCccd" /></Field>
                    <Field label="SĐT tài xế"><input className={inputClass()} defaultValue={transport.driverPhone === "-" ? "" : transport.driverPhone} name="driverPhone" /></Field>
                    <Field label="Tên chủ xe / nhà cung cấp"><input className={inputClass()} defaultValue={order.supplierOwnerName ?? transport.ownerName ?? ""} name="supplierOwnerName" /></Field>
                    <Field label="CCCD / MST NCC"><input className={inputClass()} defaultValue={order.supplierCccd ?? transport.ownerCccd ?? ""} name="supplierCccd" /></Field>
                    <Field label="Xuất HĐ đầu vào"><select className={inputClass()} defaultValue={editSupplierInvoiceRequired ? "yes" : "no"} name="supplierInvoiceRequired"><option value="yes">Có</option><option value="no">Không</option></select></Field>
                    <Field label="Tên đơn vị thuê ngoài"><input className={inputClass()} defaultValue={order.supplierCompanyName ?? transport.supplierCompanyName ?? ""} name="supplierCompanyName" /></Field>
                    <Field label="MST NCC"><input className={inputClass()} defaultValue={order.supplierTaxCode ?? transport.supplierTaxCode ?? ""} name="supplierTaxCode" /></Field>
                    <Field label="Địa chỉ NCC"><input className={inputClass()} defaultValue={order.supplierAddress ?? transport.supplierAddress ?? ""} name="supplierAddress" /></Field>
                    <Field label="SĐT NCC"><input className={inputClass()} defaultValue={order.supplierPhone ?? transport.supplierPhone ?? ""} name="supplierPhone" /></Field>
                    <Field label="Tổng tiền mua gồm VAT"><input className={inputClass()} defaultValue={order.supplierTotalWithVat ?? 0} min="0" name="supplierTotalWithVat" type="number" /></Field>
                    <Field label="TK NCC"><input className={inputClass()} defaultValue={order.supplierBankAccount ?? transport.supplierBankAccount ?? ""} name="supplierBankAccount" /></Field>
                    <Field label="Ngân hàng NCC"><input className={inputClass()} defaultValue={order.supplierBankName ?? transport.supplierBankName ?? ""} name="supplierBankName" /></Field>
                  </div>
                </SectionDetails>
              </fieldset>

              <fieldset className="space-y-4" disabled={!financeEditable}>
                <SectionDetails
                  badge={financeEditable ? "Kế toán" : "Chỉ xem"}
                  description="Phần tiền, đối tượng thu và tài khoản thu."
                  title="5. Thanh toán & hóa đơn"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Hình thức thanh toán">
                      <select className={inputClass()} defaultValue={order.paymentMethod ?? ""} name="paymentMethod">
                        <option value="">Chưa chọn</option>
                        <option value="Tiền mặt">Tiền mặt</option>
                        <option value="Chuyển khoản">Chuyển khoản</option>
                        <option value="Tiền mặt + chuyển khoản">Tiền mặt + chuyển khoản</option>
                        <option value="Đối trừ">Đối trừ</option>
                      </select>
                    </Field>
                    <Field label="Đối tượng thu"><input className={inputClass()} defaultValue={order.payer ?? ""} name="payer" placeholder="Công ty / Khách / Tài xế" /></Field>
                    <Field label="Chủ tài khoản thu"><input className={inputClass()} defaultValue={order.collectionAccountOwner ?? ""} name="collectionAccountOwner" /></Field>
                    <Field label="Số tài khoản thu"><input className={inputClass()} defaultValue={order.collectionBankAccount ?? ""} name="collectionBankAccount" /></Field>
                    <Field label="Ngân hàng thu"><input className={inputClass()} defaultValue={order.collectionBankName ?? ""} name="collectionBankName" /></Field>
                  </div>
                </SectionDetails>
              </fieldset>

              <fieldset className="space-y-4" disabled={!notesEditable}>
                <SectionDetails
                  badge="Ghi chú"
                  defaultOpen={false}
                  description="Ghi chú sale và điều hành, giữ ngắn gọn nhưng đủ đọc."
                  title="6. Ghi chú & phát hành"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Ghi chú cho điều hành"><textarea className={`${textAreaClass()} min-h-20`} defaultValue={order.salesNote ?? ""} name="salesNote" placeholder="Yêu cầu loại xe, khách VIP, cần xác nhận sớm..." /></Field>
                    <Field label="Lý do sửa"><input className={inputClass()} name="editReason" placeholder="Khách đổi giờ, đổi điểm đón..." /></Field>
                  </div>
                </SectionDetails>
              </fieldset>
            </div>
            <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
              <Save size={16} /> Lưu sửa lệnh
            </button>
          </form>

          <form className="border border-rose-200 bg-rose-50 p-4" onSubmit={cancelOrder}>
            <h3 className="font-semibold text-rose-950">Hủy lệnh</h3>
            <p className="mt-2 text-sm text-rose-800">Hủy sẽ chuyển lệnh và assignment active sang trạng thái cancelled, đồng thời ghi audit.</p>
            <div className="mt-4">
              <Field label="Lý do hủy"><textarea className={textAreaClass()} name="cancelReason" placeholder="Bắt buộc nhập lý do hủy" required /></Field>
            </div>
            <button className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-800 hover:bg-rose-100" type="submit">
              Hủy lệnh này
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function DashboardPanel({
  alerts,
  calendarDay,
  calendarMonth,
  drivers,
  currentRole,
  isActionPending,
  notifications,
  orders,
  reviewDispatchProposal,
  setCalendarDay,
  setCalendarMonth,
  setSelectedOrderId,
  setTab,
  vehicles,
  compact = false
}: {
  alerts: DispatchOrder[];
  calendarDay: Date;
  calendarMonth: Date;
  drivers: Driver[];
  currentRole: AppRole;
  isActionPending: (key: string) => boolean;
  notifications: AppNotification[];
  orders: DispatchOrder[];
  reviewDispatchProposal: (orderId: string, decision: "approved" | "rejected", reason: string) => void;
  setCalendarDay: (date: Date) => void;
  setCalendarMonth: (date: Date) => void;
  setSelectedOrderId: (id: string) => void;
  setTab: (tab: Tab) => void;
  vehicles: Vehicle[];
  compact?: boolean;
}) {
  const pendingReviewOrders = orders.filter((order) => order.orderStatus === "pending_dispatch_review");
  if (compact) {
    return (
      <section className="space-y-4">
        <div className="border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">Dashboard gọn cho mobile</h3>
          </div>
          <p className="mt-2 text-sm text-slate-600">Điện thoại chỉ giữ phần quan trọng nhất: duyệt nhanh, xem lệnh đang chờ và chuyển sang màn làm việc khi cần.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50" onClick={() => setTab("Điều hành")} type="button">Mở Điều hành</button>
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50" onClick={() => setTab("Màn làm việc")} type="button">Mở Màn làm việc</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatMini label="Chuyến hôm nay" value={String(orders.filter((order) => orderDateKey(order) === vietnamDateKey()).length)} />
            <StatMini label="Chờ duyệt" value={String(pendingReviewOrders.length)} />
          </div>
        </div>
        <DispatchReviewQueue
          canReview={can(currentRole, "assign_vehicle")}
          isActionPending={isActionPending}
          orders={pendingReviewOrders}
          reviewDispatchProposal={reviewDispatchProposal}
          selectedOrderId=""
          onReviewed={(orderId, decision) => {
            if (decision === "approved") {
              setSelectedOrderId(orderId);
              setTab("Điều hành");
            }
          }}
          setSelectedOrderId={(id) => {
            setSelectedOrderId(id);
            setTab("Điều hành");
          }}
        />
        <section className="border border-line bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-line pb-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold text-ink">Realtime thông báo</h3>
              <p className="text-sm text-slate-500">Hiện thông báo ngắn gọn cho sale, điều hành, tài xế và kế toán.</p>
            </div>
            <Badge tone={notifications.length > 0 ? "info" : "good"}>{notifications.length} gần nhất</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {notifications.length === 0 && <p className="text-sm text-slate-500">Chưa có thông báo mới.</p>}
            {notifications.slice(0, 6).map((notification) => (
              <article className="border border-line bg-panel p-3" key={notification.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{notification.title}</p>
                  <Badge tone={notification.audience === "driver" ? "info" : notification.audience === "accountant" ? "warn" : "neutral"}>{notification.audience}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                <p className="mt-2 text-xs text-slate-500">{formatDateTime(notification.createdAt)}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <DispatchReviewQueue
        canReview={can(currentRole, "assign_vehicle")}
        isActionPending={isActionPending}
        orders={pendingReviewOrders}
        reviewDispatchProposal={reviewDispatchProposal}
        selectedOrderId=""
        onReviewed={(orderId, decision) => {
          if (decision === "approved") {
            setSelectedOrderId(orderId);
            setTab("Điều hành");
          }
        }}
        setSelectedOrderId={(id) => {
          setSelectedOrderId(id);
          setTab("Điều hành");
        }}
      />
      <VehicleCalendar
        monthDate={calendarMonth}
        compact
        orders={orders}
        setCalendarDay={setCalendarDay}
        setMonthDate={setCalendarMonth}
        setSelectedOrderId={(id) => {
          setSelectedOrderId(id);
          setTab("Điều hành");
        }}
        vehicles={vehicles}
      />
      <DayTimeline
        day={calendarDay}
        drivers={drivers}
        orders={orders}
        setDay={setCalendarDay}
        setSelectedOrderId={(id) => {
          setSelectedOrderId(id);
          setTab("Điều hành");
        }}
        vehicles={vehicles}
      />
      <VehicleResourceTimeline
        day={calendarDay}
        drivers={drivers}
        orders={orders}
        setDay={setCalendarDay}
        setSelectedOrderId={(id) => {
          setSelectedOrderId(id);
          setTab("Điều hành");
        }}
        vehicles={vehicles}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">Luồng đã chạy được</h3>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            {["Tạo lệnh theo cá nhân/doanh nghiệp", "Phân xe/tài xế", "Block conflict", "Bảng điều hành", "Ghi nhận payment", "Cập nhật invoice", "Đóng lệnh sau đối soát", "Ghi audit log"].map((item) => (
              <p className="flex items-center gap-2" key={item}><CheckCircle2 size={16} className="text-brand" /> {item}</p>
            ))}
          </div>
        </div>
        <div className="border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-amber" size={20} />
            <h3 className="font-semibold text-ink">Alert queue</h3>
          </div>
          <div className="mt-4 space-y-3">
            {alerts.map((order) => (
              <div className="border border-amber-200 bg-amber-50 p-3" key={order.id}>
                <p className="font-medium text-amber-900">{order.code}</p>
                <p className="mt-1 text-sm text-amber-800">{order.dispatchStatus === "waiting_assignment" ? "Chưa phân xe/tài xế." : "Có thay đổi gần giờ chạy."}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-line pb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-ink">Realtime thông báo</h3>
            <p className="text-sm text-slate-500">Thông báo sale, điều hành, tài xế và kế toán xuất hiện ngay tại dashboard.</p>
          </div>
          <Badge tone={notifications.length > 0 ? "info" : "good"}>{notifications.length} gần nhất</Badge>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {notifications.length === 0 && <p className="text-sm text-slate-500">Chưa có thông báo mới.</p>}
          {notifications.map((notification) => (
            <article className="border border-line bg-panel p-3" key={notification.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{notification.title}</p>
                <Badge tone={notification.audience === "driver" ? "info" : notification.audience === "accountant" ? "warn" : "neutral"}>{notification.audience}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDateTime(notification.createdAt)}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function OrdersPanel({
  assignments,
  auditEvents,
  companies,
  companyContacts,
  customerKind,
  currentRole,
  customers,
  drivers,
  filteredOrders,
  isActionPending,
  payments,
  query,
  selectedOrderId,
  selectedOrder,
  setCustomerKind,
  setQuery,
  setSelectedOrderId,
  createOrder,
  cancelOrder,
  promoteDriverProposalToDispatch,
  updateOrder,
  updateQuoteStatus,
  vehicles
}: {
  assignments: Assignment[];
  auditEvents: AuditEvent[];
  companies: Company[];
  companyContacts: CompanyContact[];
  customerKind: DispatchOrder["customerKind"];
  currentRole: AppRole;
  customers: Customer[];
  drivers: Driver[];
  filteredOrders: DispatchOrder[];
  isActionPending: (key: string) => boolean;
  payments: Payment[];
  query: string;
  selectedOrderId?: string;
  selectedOrder?: DispatchOrder;
  setCustomerKind: (kind: DispatchOrder["customerKind"]) => void;
  setQuery: (query: string) => void;
  setSelectedOrderId: (id: string) => void;
  createOrder: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  cancelOrder: (event: FormEvent<HTMLFormElement>) => void;
  promoteDriverProposalToDispatch: (orderId: string) => Promise<void>;
  updateOrder: (event: FormEvent<HTMLFormElement>) => void;
  updateQuoteStatus: (nextStatus: QuoteStatus) => void;
  vehicles: Vehicle[];
}) {
  const canCreateOrder = can(currentRole, "create_order");
  const canOperate = can(currentRole, "assign_vehicle");
  const canFinance = can(currentRole, "record_payment") || can(currentRole, "update_invoice") || can(currentRole, "close_order");
  const quoteStats = filteredOrders.reduce(
    (acc, order) => {
      const status = order.quoteStatus ?? "draft";
      acc[status] += 1;
      return acc;
    },
    { approved: 0, draft: 0, expired: 0, rejected: 0, sent: 0 } satisfies Record<QuoteStatus, number>
  );
  const lowMarginCount = filteredOrders.filter((order) => orderMargin(order) < 0.15).length;
  const driverDraftProposals = filteredOrders
    .filter((order) => order.source === "Driver" && order.orderStatus === "draft")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  return (
    <section className="space-y-4">
      <form className="border border-line bg-white p-4 shadow-sm" onSubmit={createOrder}>
        <div className="flex flex-col gap-3 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Plus className="text-brand" size={20} />
            <div>
              <h3 className="font-semibold text-ink">Tạo lệnh mới</h3>
              <p className="text-sm text-slate-500">Nhập theo luồng sale: khách hàng, hành trình, báo giá.</p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-80">
            <button
              className={`h-10 rounded-md border px-3 text-sm font-semibold ${customerKind === "individual" ? "border-brand bg-teal-50 text-brand" : "border-line bg-white text-slate-600"}`}
              onClick={() => setCustomerKind("individual")}
              type="button"
            >
              Cá nhân
            </button>
            <button
              className={`h-10 rounded-md border px-3 text-sm font-semibold ${customerKind === "company" ? "border-brand bg-teal-50 text-brand" : "border-line bg-white text-slate-600"}`}
              onClick={() => setCustomerKind("company")}
              type="button"
            >
              Doanh nghiệp
            </button>
          </div>
        </div>
        <input name="customerKind" type="hidden" value={customerKind} />
        <div className="mt-4 space-y-4">
          <SectionDetails
            badge={customerKind === "company" ? "Doanh nghiệp" : "Cá nhân"}
            description="Sale chỉ cần nhập phần tạo đề xuất. Vận hành và tài chính sẽ bổ sung sau."
            title="1. Thông tin lệnh & khách hàng"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Ngày lệnh"><input className={inputClass()} name="orderDate" placeholder="2026-08-25" /></Field>
              <Field label="Loại hợp đồng">
                <select className={inputClass()} name="contractType">
                  <option value="simple">Hợp đồng giản đơn</option>
                  <option value="template">Hợp đồng mẫu</option>
                  <option value="terms">Hợp đồng điều khoản</option>
                </select>
              </Field>
              <Field label="Người tạo nguồn"><input className={inputClass()} name="sourceOwnerName" /></Field>
              <Field label="Xuất hóa đơn"><select className={inputClass()} name="invoiceRequired"><option value="no">Không</option><option value="yes">Có</option></select></Field>
              <Field label="Sale">
                <select className={inputClass()} name="salesOwner">
                  {salesOwnerOptions.map((name) => <option key={name}>{name}</option>)}
                </select>
              </Field>
              <Field label="Nguồn"><select className={inputClass()} name="source"><option>Manual</option><option>Website</option><option>Google Ads</option><option>Referral</option><option>Old customer</option></select></Field>
              <Field label="Số lượng khách"><input className={inputClass()} defaultValue="1" min="0" name="guestCount" type="number" /></Field>
              <Field label="Dòng khách">
                <select className={inputClass()} name="guestMarket">
                  {guestMarketOptions.map((item) => <option key={item.value} value={item.value}>{item.code} - {item.label}</option>)}
                </select>
              </Field>
              <Field label="Nhận biết khách">
                <select className={inputClass()} name="customerRecognitionCode">
                  {customerRecognitionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Nguồn khách">
                <select className={inputClass()} name="customerSourceCode">
                  {customerSourceCodeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Mã tỉnh/thành điểm đi">
                <select className={inputClass()} name="originProvinceCode">
                  {provinceCodeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="Mã tỉnh/thành điểm đến">
                <select className={inputClass()} defaultValue="QNH" name="destinationProvinceCode">
                  {provinceCodeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              {customerKind === "individual" ? (
                <>
                  <Field label="Chọn khách có sẵn">
                    <select className={inputClass()} name="customerId">
                      <option value="">Nhập khách mới</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.fullName} / {customer.phone}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tên khách mới"><input className={inputClass()} name="customerName" /></Field>
                  <Field label="SĐT khách mới"><input className={inputClass()} name="contactPhone" /></Field>
                  <Field label="CCCD khách mới"><input className={inputClass()} name="customerCccd" /></Field>
                  <Field label="Địa chỉ khách mới"><input className={inputClass()} name="customerAddress" /></Field>
                  <Field label="TK ngân hàng khách"><input className={inputClass()} name="customerBankAccount" /></Field>
                  <Field label="Ngân hàng khách"><input className={inputClass()} name="customerBankName" /></Field>
                </>
              ) : (
                <>
                  <Field label="Chọn công ty có sẵn">
                    <select className={inputClass()} name="companyId">
                      <option value="">Nhập công ty mới</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>{company.legalName} / MST {company.taxCode}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Chọn contact">
                    <select className={inputClass()} name="contactId">
                      <option value="">Nhập contact mới</option>
                      {companyContacts.map((contact) => {
                        const company = companies.find((item) => item.id === contact.companyId);
                        return <option key={contact.id} value={contact.id}>{company?.legalName ?? "Company"} / {contact.fullName} / {contact.phone}</option>;
                      })}
                    </select>
                  </Field>
                  <Field label="Tên công ty mới"><input className={inputClass()} name="companyName" /></Field>
                  <Field label="Người liên hệ mới"><input className={inputClass()} name="contactName" /></Field>
                  <Field label="MST"><input className={inputClass()} name="taxCode" /></Field>
                  <Field label="Email nhận HĐ"><input className={inputClass()} name="billingEmail" type="email" /></Field>
                  <Field label="Địa chỉ công ty"><input className={inputClass()} name="companyAddress" /></Field>
                  <Field label="TK ngân hàng công ty"><input className={inputClass()} name="companyBankAccount" /></Field>
                  <Field label="Ngân hàng công ty"><input className={inputClass()} name="companyBankName" /></Field>
                </>
              )}
            </div>
          </SectionDetails>

          <SectionDetails
            badge="Sale"
            description="Chỉ cần đủ để mô tả chuyến và gửi đề xuất."
            title="2. Hành trình & giá bán"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <ServiceFields />
              <Field label="Diễn giải"><input className={inputClass()} name="serviceClarification" /></Field>
              <Field label="Đơn vị tính">
                <select className={inputClass()} defaultValue="Chuyến" name="unit">
                  <option>Chuyến</option>
                  <option>Ngày</option>
                  <option>Kỳ</option>
                  <option>Tháng</option>
                </select>
              </Field>
              <RouteLegFields />
              <Field label="Ưu tiên"><select className={inputClass()} name="priority"><option value="normal">Thường</option><option value="high">Cao</option><option value="urgent">Gấp</option></select></Field>
              <VatCalculatorFields initialTotal={1200000} />
              <Field label="Chi phí tài xế"><input className={inputClass()} defaultValue="350000" min="0" name="driverCost" type="number" /></Field>
              <Field label="Chi phí xe"><input className={inputClass()} defaultValue="350000" min="0" name="vehicleCost" type="number" /></Field>
              <Field label="Phụ phí"><input className={inputClass()} defaultValue="0" min="0" name="otherCost" type="number" /></Field>
              <div className="md:col-span-2">
                <Field label="Ghi chú báo giá"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} name="quoteNote" placeholder="Bao gồm/chưa gồm phí cầu đường, giờ chờ, VAT..." /></Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Nội dung gửi khách xác nhận"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} name="customerConfirmationNote" placeholder="Điều khoản thanh toán, thông tin cần khách kiểm tra, ghi chú xác nhận..." /></Field>
              </div>
            </div>
          </SectionDetails>

          {canOperate && (
            <SectionDetails
              badge="Điều hành"
              defaultOpen={false}
              description="Mở khi cần bổ sung xe, tài xế hoặc nhà cung cấp thuê ngoài."
              title="3. Xe / tài xế / nhà cung cấp"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Hình thức xe"><select className={inputClass()} name="vehicleOwnership"><option value="company">Công ty</option><option value="rented">Thuê ngoài</option></select></Field>
                <Field label="Biển số xe"><input className={inputClass()} name="vehiclePlateNo" /></Field>
                <Field label="Họ tên tài xế"><input className={inputClass()} name="driverFullName" /></Field>
                <Field label="CCCD tài xế"><input className={inputClass()} name="driverCccd" /></Field>
                <Field label="SĐT tài xế"><input className={inputClass()} name="driverPhone" /></Field>
                <Field label="Chủ xe / NCC"><input className={inputClass()} name="supplierOwnerName" /></Field>
                <Field label="CCCD / MST NCC"><input className={inputClass()} name="supplierCccd" /></Field>
                <Field label="Xuất HĐ đầu vào"><select className={inputClass()} defaultValue="yes" name="supplierInvoiceRequired"><option value="yes">Có</option><option value="no">Không</option></select></Field>
                <Field label="Tên đơn vị thuê ngoài"><input className={inputClass()} name="supplierCompanyName" /></Field>
                <Field label="MST NCC"><input className={inputClass()} name="supplierTaxCode" /></Field>
                <Field label="Địa chỉ NCC"><input className={inputClass()} name="supplierAddress" /></Field>
                <Field label="SĐT NCC"><input className={inputClass()} name="supplierPhone" /></Field>
                <Field label="Tổng tiền mua gồm VAT"><input className={inputClass()} defaultValue={0} min="0" name="supplierTotalWithVat" type="number" /></Field>
                <Field label="TK NCC"><input className={inputClass()} name="supplierBankAccount" /></Field>
                <Field label="Ngân hàng NCC"><input className={inputClass()} name="supplierBankName" /></Field>
              </div>
            </SectionDetails>
          )}

          {canFinance && (
            <SectionDetails
              badge="Kế toán"
              defaultOpen={false}
              description="Mở cho phần hóa đơn, thu/chi, tài khoản và trạng thái thanh toán."
              title="4. Thanh toán & hóa đơn"
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Hình thức thanh toán">
                  <select className={inputClass()} name="paymentMethod">
                    <option value="">Chưa chọn</option>
                    <option value="Tiền mặt">Tiền mặt</option>
                    <option value="Chuyển khoản">Chuyển khoản</option>
                    <option value="Tiền mặt + chuyển khoản">Tiền mặt + chuyển khoản</option>
                    <option value="Đối trừ">Đối trừ</option>
                  </select>
                </Field>
                <Field label="Đối tượng thu"><input className={inputClass()} name="payer" placeholder="Công ty / Khách / Tài xế" /></Field>
                <Field label="Chủ tài khoản thu"><input className={inputClass()} name="collectionAccountOwner" /></Field>
                <Field label="Số tài khoản thu"><input className={inputClass()} name="collectionBankAccount" /></Field>
                <Field label="Ngân hàng thu"><input className={inputClass()} name="collectionBankName" /></Field>
              </div>
            </SectionDetails>
          )}

          <SectionDetails
            badge="Ghi chú"
            defaultOpen={false}
            description="Ghi chú sale và điều hành, giữ ngắn gọn nhưng đủ đọc."
            title="5. Ghi chú & phát hành"
          >
            <Field label="Ghi chú cho điều hành"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} name="salesNote" placeholder="Yêu cầu loại xe, khách VIP, cần xác nhận sớm..." /></Field>
          </SectionDetails>

          <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canCreateOrder || isActionPending("order:create")} type="submit">
            <Save size={16} /> {isActionPending("order:create") ? "Đang tạo..." : "Tạo lệnh"}
          </button>
        </div>
      </form>

      {canCreateOrder && driverDraftProposals.length > 0 && (
        <section className="border border-amber-200 bg-amber-50 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-amber-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold text-amber-950">Đề xuất tài xế chờ Sales</h3>
              <p className="text-sm text-amber-800">Cuốc thường từ tài xế về Sales trước. Sales kiểm tra thông tin rồi chuyển sang điều hành.</p>
            </div>
            <Badge tone="warn">{driverDraftProposals.length} chờ Sales</Badge>
          </div>
          <div className="divide-y divide-amber-200">
            {driverDraftProposals.map((order) => (
              <article className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_220px]" key={order.id}>
                <button className="text-left" onClick={() => setSelectedOrderId(order.id)} type="button">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{order.code}</p>
                    <Badge tone="info">Từ tài xế</Badge>
                    <Badge tone="neutral">Chờ Sales</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{order.customerName} / {order.contactPhone}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatDateTime(order.startAt)} - {routeSummaryForOrder(order)}</p>
                  <p className="mt-1 text-xs text-slate-500">Tài xế báo: {order.sourceOwnerName ?? order.salesOwner}</p>
                  {order.quoteNote && <p className="mt-1 text-sm text-amber-800">Ghi chú: {order.quoteNote}</p>}
                </button>
                <button
                  className="h-10 self-center rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isActionPending(`driver-proposal:promote:${order.id}`)}
                  onClick={() => void promoteDriverProposalToDispatch(order.id)}
                  type="button"
                >
                  {isActionPending(`driver-proposal:promote:${order.id}`) ? "Đang chuyển..." : "Chuyển điều hành"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <StatMini label="Báo giá nháp" value={String(quoteStats.draft)} />
        <StatMini label="Đã gửi khách" value={String(quoteStats.sent)} />
        <StatMini label="Khách duyệt" value={String(quoteStats.approved)} />
        <StatMini label="Biên thấp < 15%" value={String(lowMarginCount)} />
      </div>

      <div>
        <div className="border border-line bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-ink">Lệnh điều xe</h3>
            <p className="text-sm text-slate-500">Click một lệnh để thao tác ở tab Điều hành/Tài chính.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input className={`${inputClass()} pl-9`} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm số lệnh, khách, SĐT..." value={query} />
          </div>
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {filteredOrders.map((order) => (
            <button
              className={`w-full rounded-lg border px-3 py-3 text-left shadow-sm ${selectedOrderId === order.id ? "border-teal-600 bg-teal-50/70" : "border-line bg-white"}`}
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{order.code}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.salesOwner} / {order.source}</p>
                </div>
                <Badge tone={orderStatusTone(order.orderStatus)}>{orderStatusLabels[order.orderStatus]}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <p className="font-medium text-slate-800">{order.customerName}</p>
                <p className="text-slate-600">{routeSummaryForOrder(order)}</p>
                <p className="text-xs text-slate-500">{formatDateTime(order.startAt)} - {formatDateTime(order.endAt)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={order.customerKind === "company" ? "info" : "neutral"}>{order.customerKind === "company" ? "Doanh nghiệp" : "Cá nhân"}</Badge>
                <Badge tone={quoteTone(order.quoteStatus)}>{quoteLabels[order.quoteStatus ?? "draft"]}</Badge>
                <Badge tone={statusTone(order)}>{dispatchLabels[order.dispatchStatus]}</Badge>
                <Badge tone={order.paymentStatus === "paid" ? "good" : order.paymentStatus === "partial" ? "warn" : "danger"}>{paymentLabels[order.paymentStatus]}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-ink">{money(order.amountDue)}</span>
                <span className={`font-semibold ${orderProfit(order) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{money(orderProfit(order))}</span>
              </div>
            </button>
          ))}
          {filteredOrders.length === 0 && <p className="px-1 py-3 text-sm text-slate-500">Không có lệnh phù hợp bộ lọc.</p>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1160px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Lệnh</th>
                <th className="px-4 py-3 font-semibold">Loại khách</th>
                <th className="px-4 py-3 font-semibold">Khách / liên hệ</th>
                <th className="px-4 py-3 font-semibold">Hành trình</th>
                <th className="px-4 py-3 font-semibold">Thời gian</th>
                <th className="px-4 py-3 font-semibold">Duyệt</th>
                <th className="px-4 py-3 font-semibold">Báo giá</th>
                <th className="px-4 py-3 font-semibold">Điều hành</th>
                <th className="px-4 py-3 font-semibold">Thanh toán</th>
                <th className="px-4 py-3 font-semibold">Hóa đơn</th>
                <th className="px-4 py-3 font-semibold">Giá trị</th>
                <th className="px-4 py-3 font-semibold">Lãi dự kiến</th>
                <th className="px-4 py-3 font-semibold">Biên</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredOrders.map((order) => (
                <tr key={order.id} className={`cursor-pointer align-top hover:bg-slate-50 ${selectedOrderId === order.id ? "bg-teal-50/60" : ""}`} onClick={() => setSelectedOrderId(order.id)}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-ink">{order.code}</p>
                    <p className="text-xs text-slate-500">{order.salesOwner} / {order.source}</p>
                  </td>
                  <td className="px-4 py-4"><Badge tone={order.customerKind === "company" ? "info" : "neutral"}>{order.customerKind === "company" ? "Doanh nghiệp" : "Cá nhân"}</Badge></td>
                  <td className="px-4 py-4"><CustomerCell order={order} /></td>
                  <td className="px-4 py-4">
                    <p className="flex items-center gap-1"><MapPin size={14} /> {order.pickup}</p>
                    <p className="mt-1 text-slate-500">{order.dropoff}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{formatDateTime(order.startAt)} - {formatDateTime(order.endAt)}</td>
                  <td className="px-4 py-4"><Badge tone={orderStatusTone(order.orderStatus)}>{orderStatusLabels[order.orderStatus]}</Badge></td>
                  <td className="px-4 py-4"><Badge tone={quoteTone(order.quoteStatus)}>{quoteLabels[order.quoteStatus ?? "draft"]}</Badge></td>
                  <td className="px-4 py-4"><Badge tone={statusTone(order)}>{dispatchLabels[order.dispatchStatus]}</Badge></td>
                  <td className="px-4 py-4"><Badge tone={order.paymentStatus === "paid" ? "good" : order.paymentStatus === "partial" ? "warn" : "danger"}>{paymentLabels[order.paymentStatus]}</Badge></td>
                  <td className="px-4 py-4"><Badge tone={order.invoiceStatus === "issued" || order.invoiceStatus === "not_required" ? "good" : "warn"}>{invoiceLabels[order.invoiceStatus]}</Badge></td>
                  <td className="px-4 py-4 font-semibold">{money(order.amountDue)}</td>
                  <td className={`px-4 py-4 font-semibold ${orderProfit(order) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{money(orderProfit(order))}</td>
                  <td className="px-4 py-4">
                    <Badge tone={orderMargin(order) >= 0.25 ? "good" : orderMargin(order) >= 0.15 ? "warn" : "danger"}>
                      {Math.round(orderMargin(order) * 100)}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>
      {selectedOrder && (
        <OrderDetailPanel
          assignments={assignments}
          auditEvents={auditEvents}
          currentRole={currentRole}
          drivers={drivers}
          order={selectedOrder}
          payments={payments}
          cancelOrder={cancelOrder}
          updateOrder={updateOrder}
          updateQuoteStatus={updateQuoteStatus}
          vehicles={vehicles}
        />
      )}
    </section>
  );
}

function DispatchPanel({
  assignments,
  auditEvents,
  calendarDay,
  calendarMonth,
  currentRole,
  drivers,
  isActionPending,
  orders,
  payments,
  selectedOrder,
  assignOrder,
  cancelOrder,
  reviewDispatchProposal,
  setCalendarDay,
  setCalendarMonth,
  setSelectedOrderId,
  updateDispatchStatus,
  updateOrder,
  compact,
  vehicles
}: {
  assignments: Assignment[];
  auditEvents: AuditEvent[];
  calendarDay: Date;
  calendarMonth: Date;
  currentRole: AppRole;
  drivers: Driver[];
  isActionPending: (key: string) => boolean;
  orders: DispatchOrder[];
  payments: Payment[];
  selectedOrder: DispatchOrder;
  assignOrder: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  cancelOrder: (event: FormEvent<HTMLFormElement>) => void;
  reviewDispatchProposal: (orderId: string, decision: "approved" | "rejected", reason: string) => void;
  setCalendarDay: (date: Date) => void;
  setCalendarMonth: (date: Date) => void;
  setSelectedOrderId: (id: string) => void;
  updateDispatchStatus: (nextStatus: DispatchStatus, reason: string) => void;
  updateOrder: (event: FormEvent<HTMLFormElement>) => void;
  compact: boolean;
  vehicles: Vehicle[];
}) {
  const activeAssignment = assignments.find((assignment) => assignment.dispatchOrderId === selectedOrder.id && assignment.status === "active");
  const vehicle = vehicles.find((item) => item.id === selectedOrder.vehicleId);
  const driver = drivers.find((item) => item.id === selectedOrder.driverId);
  const canAssignVehicle = can(currentRole, "assign_vehicle");
  const canUpdateDispatchStatus = can(currentRole, "update_dispatch_status");
  const pendingReviewOrders = orders.filter((order) => order.orderStatus === "pending_dispatch_review");
  const canAssignSelectedOrder = canAssignVehicle && selectedOrder.orderStatus === "confirmed";
  const canMarkDriverAccepted = canUpdateDispatchStatus && canMoveDispatchStatus(selectedOrder.dispatchStatus, "driver_accepted");
  const canMarkInProgress = canUpdateDispatchStatus && canMoveDispatchStatus(selectedOrder.dispatchStatus, "in_progress");
  const canMarkCompleted = canUpdateDispatchStatus && canMoveDispatchStatus(selectedOrder.dispatchStatus, "completed");
  const canMarkCancelled = canUpdateDispatchStatus && canMoveDispatchStatus(selectedOrder.dispatchStatus, "cancelled");
  const [assignmentModeState, setAssignmentModeState] = useState<{ orderId: string; mode: NonNullable<DispatchOrder["vehicleOwnership"]> }>(() => ({
    orderId: selectedOrder.id,
    mode: selectedOrder.vehicleOwnership ?? "company"
  }));
  const assignmentMode = assignmentModeState.orderId === selectedOrder.id ? assignmentModeState.mode : selectedOrder.vehicleOwnership ?? "company";
  const [assignmentChoice, setAssignmentChoice] = useState<{ orderId: string; vehicleId: string; driverId: string }>(() => ({
    orderId: selectedOrder.id,
    vehicleId: selectedOrder.vehicleId ?? vehicles[0]?.id ?? "",
    driverId: selectedOrder.driverId ?? drivers[0]?.id ?? ""
  }));
  const selectedAssignmentChoice = assignmentChoice.orderId === selectedOrder.id
    ? assignmentChoice
    : {
        orderId: selectedOrder.id,
        vehicleId: selectedOrder.vehicleId ?? vehicles[0]?.id ?? "",
        driverId: selectedOrder.driverId ?? drivers[0]?.id ?? ""
      };
  const draftVehicle = vehicles.find((item) => item.id === selectedAssignmentChoice.vehicleId);
  const draftDriver = drivers.find((item) => item.id === selectedAssignmentChoice.driverId);
  const assignmentIssues = assignmentMode === "company"
    ? assignmentIssueLines({
        assignments,
        driver: draftDriver,
        drivers,
        ignoreAssignmentId: activeAssignment?.id,
        order: selectedOrder,
        orders,
        vehicle: draftVehicle,
        vehicles
      })
    : [];
  const blockingAssignmentIssues = assignmentIssues.filter((issue) => issue.tone === "block");
  const externalTripLink = tripAccessUrl(selectedOrder.tripAccessToken);
  const driverAckLabel = selectedOrder.driverAckStatus === "accepted"
    ? "Tài xế đã nhận"
    : selectedOrder.driverAckStatus === "escalated"
      ? "Quá 3 lần nhắc"
      : selectedOrder.driverAckStatus === "pending"
        ? `Chờ tài xế nhận (${selectedOrder.driverAckCount ?? 0}/3)`
        : "Chưa cần nhắc";

  return (
    <section className="space-y-4">
      <DispatchReviewQueue
        canReview={canAssignVehicle}
        isActionPending={isActionPending}
        orders={pendingReviewOrders}
        reviewDispatchProposal={reviewDispatchProposal}
        selectedOrderId={selectedOrder.id}
        onReviewed={(orderId, decision) => {
          if (decision === "approved") {
            setSelectedOrderId(orderId);
          }
        }}
        setSelectedOrderId={setSelectedOrderId}
      />
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.2fr]">
        <div className="border border-line bg-white p-4 shadow-sm lg:order-none">
          <div className="flex items-center gap-2">
            <ClipboardList className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">{selectedOrder.code}</h3>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <p className="font-medium">{selectedOrder.customerName}</p>
            <p className="text-slate-600">{routeSummaryForOrder(selectedOrder)}</p>
            <p className="text-slate-600">{formatDateTime(selectedOrder.startAt)} - {formatDateTime(selectedOrder.endAt)}</p>
            <div className="flex flex-wrap gap-2">
              <Badge tone={orderStatusTone(selectedOrder.orderStatus)}>{orderStatusLabels[selectedOrder.orderStatus]}</Badge>
              <Badge tone={statusTone(selectedOrder)}>{dispatchLabels[selectedOrder.dispatchStatus]}</Badge>
              <Badge tone={selectedOrder.paymentStatus === "paid" ? "good" : "warn"}>{paymentLabels[selectedOrder.paymentStatus]}</Badge>
              <Badge tone="info">{money(selectedOrder.amountDue)}</Badge>
            </div>
            <div className="border border-line bg-panel p-3">
              <p className="font-medium">Assignment hiện tại</p>
              <p className="mt-1 text-slate-600">Nguồn xe: {selectedOrder.vehicleOwnership === "rented" ? "Thuê ngoài" : "Xe công ty"}</p>
              <p className="text-slate-600">{selectedOrder.vehicleOwnership === "rented" ? `${selectedOrder.externalVehiclePlate || selectedOrder.vehiclePlateNo || "Chưa có biển số"} / ${selectedOrder.externalVehicleType || "Chưa rõ loại xe"}` : vehicle ? `${vehicle.plateNo} / ${vehicle.type}` : "Chưa có xe"}</p>
              <p className="text-slate-600">{selectedOrder.vehicleOwnership === "rented" ? `${selectedOrder.externalDriverName || selectedOrder.driverFullName || "Chưa có tài xế"} / ${selectedOrder.externalDriverPhone || selectedOrder.driverPhone || "Chưa có SĐT"}` : driver ? `${driver.fullName} / ${driver.phone}` : "Chưa có tài xế"}</p>
              <p className="text-slate-600">Xác nhận tài xế: {driverAckLabel}</p>
              {activeAssignment && <p className="mt-1 text-xs text-slate-500">Assignment ID: {activeAssignment.id}</p>}
              {selectedOrder.vehicleOwnership === "rented" && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <p className="font-semibold">Hồ sơ NCC: {selectedOrder.supplierTaxCode || selectedOrder.supplierBankAccount ? "Đang bổ sung" : "Chưa hoàn thiện"}</p>
                  <p>Kế toán sẽ hoàn thiện NCC trước khi thanh toán/đóng hồ sơ.</p>
                </div>
              )}
              {externalTripLink && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-500">Trip Link tài xế ngoài</p>
                  <input className={`${inputClass()} mt-1 text-xs`} readOnly value={externalTripLink} />
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canMarkDriverAccepted || isActionPending(`dispatch:status:${selectedOrder.id}:driver_accepted`)} onClick={() => updateDispatchStatus("driver_accepted", "Driver confirmed by dispatcher")} type="button">Tài xế nhận</button>
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canMarkInProgress || isActionPending(`dispatch:status:${selectedOrder.id}:in_progress`)} onClick={() => updateDispatchStatus("in_progress", "Trip started")} type="button">Bắt đầu chạy</button>
            <button className="h-10 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canMarkCompleted || isActionPending(`dispatch:status:${selectedOrder.id}:completed`)} onClick={() => updateDispatchStatus("completed", "Trip completed")} type="button">Hoàn thành</button>
            <button className="h-10 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400" disabled={!canMarkCancelled} onClick={() => updateDispatchStatus("cancelled", "Cancelled with required reason")} type="button">Hủy lệnh</button>
          </div>
        </div>

        <form className="border border-line bg-white p-4 shadow-sm" onSubmit={assignOrder}>
          <div className="flex items-center gap-2">
            <Car className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">Phân xe/tài xế</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {selectedOrder.orderStatus !== "confirmed" && (
              <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2">Lệnh này chưa được điều hành duyệt nên chưa thể phân xe/tài xế.</p>
            )}
            <Field label="Nguồn xe">
              <select className={inputClass()} name="assignmentMode" onChange={(event) => setAssignmentModeState({ orderId: selectedOrder.id, mode: event.target.value as NonNullable<DispatchOrder["vehicleOwnership"]> })} value={assignmentMode}>
                <option value="company">Xe công ty</option>
                <option value="rented">Thuê ngoài</option>
              </select>
            </Field>
            {assignmentMode === "company" ? (
              <>
                <Field label="Tài xế">
                  <select
                    className={inputClass()}
                    name="driverId"
                    onChange={(event) => {
                      const nextDriverId = event.target.value;
                      const defaultVehicle = vehicles.find((item) => item.defaultDriverId === nextDriverId);
                      setAssignmentChoice({
                        orderId: selectedOrder.id,
                        driverId: nextDriverId,
                        vehicleId: defaultVehicle?.id ?? selectedAssignmentChoice.vehicleId
                      });
                    }}
                    required
                    value={selectedAssignmentChoice.driverId}
                  >
                    {drivers.map((item) => <option disabled={item.status !== "active"} key={item.id} value={item.id}>{driverOptionLabel(item, vehicles)}</option>)}
                  </select>
                </Field>
                <Field label="Xe">
                  <select
                    className={inputClass()}
                    name="vehicleId"
                    onChange={(event) => setAssignmentChoice({ ...selectedAssignmentChoice, orderId: selectedOrder.id, vehicleId: event.target.value })}
                    required
                    value={selectedAssignmentChoice.vehicleId}
                  >
                    {vehicles.map((item) => <option disabled={item.status !== "active"} key={item.id} value={item.id}>{vehicleOptionLabel(item)}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <div className="grid gap-3 rounded-md border border-line bg-panel p-3 text-sm md:grid-cols-2">
                    <div>
                      <p className="font-semibold text-ink">Tài xế đang chọn</p>
                      <p className="mt-1 text-slate-600">{draftDriver ? `${draftDriver.fullName} / ${draftDriver.phone}` : "Chưa chọn tài xế"}</p>
                      <p className="text-xs text-slate-500">CCCD: {draftDriver?.cccd || "-"} / STK: {draftDriver?.bankAccount ? `${draftDriver.bankAccount} / ${draftDriver.bankName || "-"}` : "-"}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-ink">Xe đang chọn</p>
                      <p className="mt-1 text-slate-600">{draftVehicle ? `${draftVehicle.plateNo} - ${draftVehicle.seats} chỗ / ${draftVehicle.type}` : "Chưa chọn xe"}</p>
                      <p className="text-xs text-slate-500">NCC: {draftVehicle?.supplierCompanyName || draftVehicle?.ownerName || "-"} / {draftVehicle?.ownershipType ? vehicleOwnershipLabels[draftVehicle.ownershipType] : "-"}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="font-semibold text-ink">Lý do có thể/chưa thể phân</p>
                      {assignmentIssues.length === 0 ? (
                        <p className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">Có thể phân. Xe và tài xế không trùng lịch trong khung giờ này.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {assignmentIssues.map((issue) => (
                            <p className={`rounded-md border px-3 py-2 ${issue.tone === "block" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} key={issue.text}>
                              {issue.text}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Field label="Biển số xe ngoài *"><input className={inputClass()} defaultValue={selectedOrder.externalVehiclePlate || selectedOrder.vehiclePlateNo || ""} name="externalVehiclePlate" required /></Field>
                <Field label="Loại xe / số chỗ *"><input className={inputClass()} defaultValue={selectedOrder.externalVehicleType || ""} name="externalVehicleType" placeholder="7 chỗ, Limousine 9 chỗ..." required /></Field>
                <Field label="Tên tài xế ngoài *"><input className={inputClass()} defaultValue={selectedOrder.externalDriverName || selectedOrder.driverFullName || ""} name="externalDriverName" required /></Field>
                <Field label="SĐT tài xế ngoài *"><input className={inputClass()} defaultValue={selectedOrder.externalDriverPhone || selectedOrder.driverPhone || ""} name="externalDriverPhone" required /></Field>
                <Field label="Giá mua dự kiến *"><input className={inputClass()} defaultValue={selectedOrder.supplierTotalWithVat ?? selectedOrder.vehicleCost ?? 0} min="0" name="externalPurchaseAmount" required type="number" /></Field>
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Không cần tạo account cho tài xế ngoài. Hệ thống sẽ tạo Trip Link tạm thời để gửi cho tài xế cập nhật chuyến.</p>
              </>
            )}
            <div className="md:col-span-2">
              <Field label="Lý do khi đổi/ghi chú phân công"><textarea className={textAreaClass()} name="reason" placeholder="Ví dụ: xe cũ bận, khách đổi giờ, ưu tiên tài xế quen tuyến..." /></Field>
            </div>
          </div>
          <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canAssignSelectedOrder || blockingAssignmentIssues.length > 0 || isActionPending(`dispatch:assign:${selectedOrder.id}`)} type="submit">
            <Save size={16} /> {isActionPending(`dispatch:assign:${selectedOrder.id}`) ? "Đang lưu..." : "Lưu phân công"}
          </button>
          <div className="mt-4 border border-line bg-panel p-3 text-sm">
            <p className="font-medium">Assignment history</p>
            <div className="mt-2 space-y-2">
              {assignments.filter((item) => item.dispatchOrderId === selectedOrder.id).map((item) => {
                const assignedVehicle = vehicles.find((vehicleItem) => vehicleItem.id === item.vehicleId);
                const assignedDriver = drivers.find((driverItem) => driverItem.id === item.driverId);
                return (
                  <p className="text-slate-600" key={item.id}>{assignedVehicle?.plateNo} / {assignedDriver?.fullName} / {item.status}</p>
                );
              })}
            </div>
          </div>
        </form>
      </div>
      {compact ? (
        <div className="space-y-4">
          <section className="border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarClock className="text-brand" size={20} />
              <h3 className="font-semibold text-ink">Màn điều hành gọn</h3>
            </div>
            <p className="mt-2 text-sm text-slate-500">Điện thoại chỉ giữ phần cốt lõi của lệnh đang chọn. Bảng lịch và timeline chi tiết chỉ mở trên màn rộng.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50" onClick={() => setSelectedOrderId(selectedOrder.id)} type="button">Giữ lệnh này</button>
              <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50" onClick={() => setCalendarDay(new Date(selectedOrder.startAt))} type="button">Xem ngày chạy</button>
            </div>
          </section>
        </div>
      ) : (
        <div className="hidden space-y-4 lg:block">
          <VehicleCalendar monthDate={calendarMonth} orders={orders} selectedOrderId={selectedOrder.id} setCalendarDay={setCalendarDay} setMonthDate={setCalendarMonth} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
          <DayTimeline day={calendarDay} drivers={drivers} orders={orders} selectedOrderId={selectedOrder.id} setDay={setCalendarDay} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
          <VehicleResourceTimeline day={calendarDay} drivers={drivers} orders={orders} selectedOrderId={selectedOrder.id} setDay={setCalendarDay} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
          <DispatchBoard assignments={assignments} drivers={drivers} orders={orders} selectedOrderId={selectedOrder.id} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
          <OrderDetailPanel assignments={assignments} auditEvents={auditEvents} currentRole={currentRole} drivers={drivers} order={selectedOrder} payments={payments} cancelOrder={cancelOrder} updateOrder={updateOrder} vehicles={vehicles} />
        </div>
      )}
    </section>
  );
}

function DispatchReviewQueue({
  canReview,
  isActionPending,
  onReviewed,
  orders,
  reviewDispatchProposal,
  selectedOrderId,
  setSelectedOrderId
}: {
  canReview: boolean;
  isActionPending: (key: string) => boolean;
  onReviewed?: (orderId: string, decision: "approved" | "rejected") => void;
  orders: DispatchOrder[];
  reviewDispatchProposal: (orderId: string, decision: "approved" | "rejected", reason: string) => void;
  selectedOrderId?: string;
  setSelectedOrderId: (id: string) => void;
}) {
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [priorityFilter, setPriorityFilter] = useState<"all" | DispatchPriority>("all");
  const [kindFilter, setKindFilter] = useState<"all" | DispatchOrder["customerKind"]>("all");
  const visibleOrders = orders.filter((order) =>
    (priorityFilter === "all" || (order.priority ?? "normal") === priorityFilter) &&
    (kindFilter === "all" || order.customerKind === kindFilter)
  );

  return (
    <section className="border border-line bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold text-ink">Hàng chờ đề xuất điều xe</h3>
          <p className="text-sm text-slate-500">Sale gửi đề xuất vào đây, điều hành duyệt rồi mới phân xe/tài xế.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={`${inputClass()} w-32`} onChange={(event) => setPriorityFilter(event.target.value as "all" | DispatchPriority)} value={priorityFilter}>
            <option value="all">Tất cả ưu tiên</option><option value="urgent">Gấp</option><option value="high">Cao</option><option value="normal">Thường</option>
          </select>
          <select className={`${inputClass()} w-32`} onChange={(event) => setKindFilter(event.target.value as "all" | DispatchOrder["customerKind"])} value={kindFilter}>
            <option value="all">Tất cả khách</option><option value="individual">Cá nhân</option><option value="company">Doanh nghiệp</option>
          </select>
          <Badge tone={orders.length > 0 ? "warn" : "good"}>{orders.length} chờ duyệt</Badge>
        </div>
      </div>
      <div className="divide-y divide-line">
        {visibleOrders.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Không có đề xuất phù hợp bộ lọc.</p>}
        {visibleOrders.map((order) => (
          <div className={`grid gap-3 px-4 py-4 lg:grid-cols-[1fr_360px] ${selectedOrderId === order.id ? "bg-teal-50/60" : ""}`} key={order.id}>
            <button className="text-left" onClick={() => setSelectedOrderId(order.id)} type="button">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{order.code}</p>
                <Badge tone={orderStatusTone(order.orderStatus)}>{orderStatusLabels[order.orderStatus]}</Badge>
                <Badge tone={quoteTone(order.quoteStatus)}>{quoteLabels[order.quoteStatus ?? "draft"]}</Badge>
                <Badge tone={(order.priority ?? "normal") === "urgent" ? "danger" : (order.priority ?? "normal") === "high" ? "warn" : "neutral"}>{priorityLabels[order.priority ?? "normal"]}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-700">{order.customerName} / {order.contactPhone}</p>
              <p className="mt-1 text-sm text-slate-600">{formatDateTime(order.startAt)} - {routeSummaryForOrder(order)}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{money(order.amountDue)} / lãi dự kiến {money(orderProfit(order))}</p>
              {order.salesNote && <p className="mt-1 text-sm text-amber-800">Sale note: {order.salesNote}</p>}
            </button>
            <div className="space-y-2">
              <input
                className={inputClass()}
                onChange={(event) => setRejectReasons((current) => ({ ...current, [order.id]: event.target.value }))}
                placeholder="Lý do nếu từ chối hoặc ghi chú duyệt"
                value={rejectReasons[order.id] ?? ""}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="h-10 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canReview || isActionPending(`dispatch:review:${order.id}:approved`)}
                  onClick={() => {
                    reviewDispatchProposal(order.id, "approved", rejectReasons[order.id] ?? "");
                    onReviewed?.(order.id, "approved");
                  }}
                  type="button"
                >
                  {isActionPending(`dispatch:review:${order.id}:approved`) ? "Đang duyệt..." : "Duyệt"}
                </button>
                <button
                  className="h-10 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={!canReview || isActionPending(`dispatch:review:${order.id}:rejected`)}
                  onClick={() => {
                    reviewDispatchProposal(order.id, "rejected", rejectReasons[order.id] ?? "");
                    onReviewed?.(order.id, "rejected");
                  }}
                  type="button"
                >
                  {isActionPending(`dispatch:review:${order.id}:rejected`) ? "Đang từ chối..." : "Từ chối"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomersPanel({
  companies,
  companyContacts,
  createCompany,
  createCustomer,
  currentRole,
  customers,
  orders
}: {
  companies: Company[];
  companyContacts: CompanyContact[];
  createCompany: (event: FormEvent<HTMLFormElement>) => void;
  createCustomer: (event: FormEvent<HTMLFormElement>) => void;
  currentRole: AppRole;
  customers: Customer[];
  orders: DispatchOrder[];
}) {
  const canCreateProfile = can(currentRole, "create_order");

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <form className="border border-line bg-white p-4 shadow-sm" onSubmit={createCustomer}>
          <div className="flex items-center gap-2">
            <UserRound className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">Khách cá nhân</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Họ tên"><input className={inputClass()} name="fullName" required /></Field>
            <Field label="SĐT"><input className={inputClass()} name="phone" required /></Field>
            <Field label="Email"><input className={inputClass()} name="email" type="email" /></Field>
            <Field label="Địa chỉ"><input className={inputClass()} name="address" /></Field>
          </div>
          <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canCreateProfile} type="submit">
            <Save size={16} /> Lưu khách cá nhân
          </button>
        </form>

        <form className="border border-line bg-white p-4 shadow-sm" onSubmit={createCompany}>
          <div className="flex items-center gap-2">
            <UsersRound className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">Doanh nghiệp + contact</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Tên công ty"><input className={inputClass()} name="legalName" required /></Field>
            <Field label="MST"><input className={inputClass()} name="taxCode" required /></Field>
            <Field label="Địa chỉ HĐ"><input className={inputClass()} name="legalAddress" /></Field>
            <Field label="Email nhận HĐ"><input className={inputClass()} name="billingEmail" type="email" /></Field>
            <Field label="Người liên hệ"><input className={inputClass()} name="contactName" required /></Field>
            <Field label="SĐT contact"><input className={inputClass()} name="contactPhone" required /></Field>
            <Field label="Email contact"><input className={inputClass()} name="contactEmail" type="email" /></Field>
            <Field label="Chức vụ"><input className={inputClass()} name="position" /></Field>
          </div>
          <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canCreateProfile} type="submit">
            <Save size={16} /> Lưu doanh nghiệp
          </button>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="border border-line bg-white shadow-sm">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-semibold text-ink">Danh sách khách cá nhân</h3>
          </div>
          <div className="divide-y divide-line">
            {customers.map((customer) => {
              const tripCount = orders.filter((order) => order.customerKind === "individual" && order.contactPhone === customer.phone).length;
              return (
                <div className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_130px_90px]" key={customer.id}>
                  <div>
                    <p className="font-semibold text-ink">{customer.fullName}</p>
                    <p className="text-xs text-slate-500">{customer.phone} / {customer.email || "no email"}</p>
                  </div>
                  <p className="text-slate-600">{tripCount} lệnh</p>
                  <Badge tone={customer.status === "active" ? "good" : "warn"}>{customer.status}</Badge>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border border-line bg-white shadow-sm">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-semibold text-ink">Danh sách doanh nghiệp</h3>
          </div>
          <div className="divide-y divide-line">
            {companies.map((company) => {
              const contacts = companyContacts.filter((contact) => contact.companyId === company.id);
              const tripCount = orders.filter((order) => order.companyName === company.legalName).length;
              return (
                <div className="px-4 py-3 text-sm" key={company.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{company.legalName}</p>
                      <p className="text-xs text-slate-500">MST {company.taxCode} / {company.billingEmail || "no billing email"}</p>
                    </div>
                    <Badge tone="info">{tripCount} lệnh</Badge>
                  </div>
                  <div className="mt-2 space-y-1">
                    {contacts.map((contact) => (
                      <p className="text-xs text-slate-600" key={contact.id}>{contact.fullName} / {contact.phone} / {contact.position || "-"}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function DriverTripBrief({ driver, order, vehicle }: { driver?: Driver; order: DispatchOrder; vehicle?: Vehicle }) {
  const expenseFuel = order.driverExpenseFuel ?? 0;
  const expenseToll = order.driverExpenseToll ?? 0;
  const expenseParking = order.driverExpenseParking ?? 0;
  const expenseWater = order.driverExpenseWater ?? 0;
  const expenseOther = order.driverExpenseOther ?? 0;
  const expenseTotal = expenseFuel + expenseToll + expenseParking + expenseWater + expenseOther;
  const collectedAmount = order.driverCollectedAmount ?? 0;

  return (
    <section className="mt-4 rounded-md border border-line bg-panel p-3 text-sm">
      <p className="font-semibold uppercase text-ink">Thông tin chuyến xe</p>
      <div className="mt-3 space-y-2 text-slate-700">
        <p><span className="font-semibold text-ink">Khách hàng:</span> {order.companyName || ownerCompanyProfile.legalName}</p>
        <p><span className="font-semibold text-ink">Người sử dụng:</span> {order.contactName || order.customerName}</p>
        <p><span className="font-semibold text-ink">SĐT:</span> {order.contactPhone}</p>
        <p><span className="font-semibold text-ink">Hành trình:</span> {routeSummaryForOrder(order)}</p>
        <p><span className="font-semibold text-ink">Có mặt tại điểm đón:</span> {timeOnly(order.startAt)} - {dateOnly(order.startAt)}</p>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <p className="font-semibold text-ink">Thông tin xe</p>
        <div className="mt-2 space-y-1 text-slate-700">
          <p>Biển số: <span className="font-medium text-ink">{order.externalVehiclePlate || order.vehiclePlateNo || vehicle?.plateNo || "-"}</span></p>
          <p>Tài xế: <span className="font-medium text-ink">{order.externalDriverName || order.driverFullName || driver?.fullName || "-"}</span></p>
          <p>SĐT tài xế: <span className="font-medium text-ink">{order.externalDriverPhone || order.driverPhone || driver?.phone || "-"}</span></p>
        </div>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <p className="font-semibold text-ink">Lưu ý</p>
        <div className="mt-2 whitespace-pre-wrap text-slate-700">
          {order.salesNote || order.customerConfirmationNote || "Xe sạch, có mặt trước giờ đón 15 phút.\nTài xế chủ động gọi khách trước khi đến.\nĐón đúng vị trí đã xác nhận."}
        </div>
      </div>
      <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
        <div>
          <p className="font-semibold text-ink">Thông báo thu hộ</p>
          <p className="mt-2 text-slate-700">Thu hộ khách: <span className="font-medium text-ink">{money(collectedAmount)}</span></p>
          <p className="text-slate-700">Thu thêm: <span className="font-medium text-ink">{money(Math.max(order.amountDue - collectedAmount, 0))}</span></p>
          <p className="text-slate-700">Tổng cần thu hộ: <span className="font-medium text-ink">{money(order.amountDue)}</span></p>
        </div>
        <div>
          <p className="font-semibold text-ink">Chi phí</p>
          <p className="mt-2 text-slate-700">Cầu đường: <span className="font-medium text-ink">{money(expenseToll)}</span></p>
          <p className="text-slate-700">Bãi xe: <span className="font-medium text-ink">{money(expenseParking)}</span></p>
          <p className="text-slate-700">Xăng/dầu: <span className="font-medium text-ink">{money(expenseFuel)}</span></p>
          <p className="text-slate-700">Chi phí khác: <span className="font-medium text-ink">{money(expenseWater + expenseOther)}</span></p>
          <p className="text-slate-700">Tổng chi phí: <span className="font-medium text-ink">{money(expenseTotal)}</span></p>
        </div>
      </div>
    </section>
  );
}

function DriverMobilePanel({
  authDriverId,
  currentRole,
  drivers,
  isActionPending,
  mobileDriverId,
  notifications,
  orders,
  now,
  selectedOrderId,
  setMobileDriverId,
  setSelectedOrderId,
  submitDriverProposal,
  submitDriverTripReport,
  updateOrderDispatchStatus,
  vehicles
}: {
  authDriverId?: string;
  currentRole: AppRole;
  drivers: Driver[];
  isActionPending: (key: string) => boolean;
  mobileDriverId: string;
  notifications: AppNotification[];
  orders: DispatchOrder[];
  now: Date;
  selectedOrderId?: string;
  setMobileDriverId: (id: string) => void;
  setSelectedOrderId: (id: string) => void;
  submitDriverProposal: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  submitDriverTripReport: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
  updateOrderDispatchStatus: (orderId: string, nextStatus: DispatchStatus, reason: string, actor?: string) => void;
  vehicles: Vehicle[];
}) {
  const [urgent, setUrgent] = useState(false);
  const lockedDriverId = currentRole === "driver" ? authDriverId : undefined;
  const selectedDriver = drivers.find((driver) => driver.id === (lockedDriverId ?? mobileDriverId)) ?? drivers[0];
  const nowMs = now.getTime();
  const todayKey = vietnamDateKey(now);
  const driverOrders = orders
    .filter((order) => order.driverId === selectedDriver?.id && order.dispatchStatus !== "cancelled")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const todayDriverOrders = driverOrders.filter((order) => orderDateKey(order) === todayKey);
  const activeOrder = driverOrders.find((order) => order.dispatchStatus === "in_progress") ?? driverOrders.find((order) => order.dispatchStatus === "driver_accepted");
  const upcomingTrips = driverOrders
    .filter((order) => !["completed", "cancelled", "in_progress", "driver_accepted"].includes(order.dispatchStatus) && new Date(order.startAt).getTime() >= nowMs)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const driverProposals = orders
    .filter((order) => order.source === "Driver" && order.sourceOwnerName === selectedDriver?.fullName && ["draft", "pending_dispatch_review"].includes(order.orderStatus))
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const driverEntityIds = new Set([...driverOrders.map((order) => order.id), ...driverProposals.map((order) => order.id)]);
  const assignedFallbackNotifications: AppNotification[] = upcomingTrips.slice(0, 3).map((order) => ({
    id: `driver-assigned-${order.id}`,
    audience: "driver",
    title: "Bạn có chuyến được phân",
    body: `${order.code} / ${timeOnly(order.startAt)} / ${routeSummaryForOrder(order)}`,
    entityId: order.id,
    createdAt: order.startAt,
    read: false
  }));
  const driverNotifications = [
    ...notifications.filter((item) => item.audience === "driver" && (!item.entityId || driverEntityIds.has(item.entityId))),
    ...assignedFallbackNotifications.filter((item) => !notifications.some((notification) => notification.entityId === item.entityId && notification.audience === "driver"))
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const selectedTrip = driverOrders.find((order) => order.id === selectedOrderId) ?? activeOrder ?? upcomingTrips[0] ?? driverOrders[0];
  const completedTripsToday = todayDriverOrders.filter((order) => order.dispatchStatus === "completed");
  const completedTrips = driverOrders.filter((order) => order.dispatchStatus === "completed");
  const reportTrip = selectedTrip?.dispatchStatus === "completed" ? selectedTrip : completedTripsToday[completedTripsToday.length - 1] ?? completedTrips[completedTrips.length - 1];
  const reportTripExpenseTotal = reportTrip
    ? (reportTrip.driverExpenseFuel ?? 0) + (reportTrip.driverExpenseToll ?? 0) + (reportTrip.driverExpenseParking ?? 0) + (reportTrip.driverExpenseWater ?? 0) + (reportTrip.driverExpenseOther ?? 0)
    : 0;
  const reportTripCollectedAmount = reportTrip?.driverCollectedAmount ?? 0;
  const nextDriverStatus = selectedTrip ? driverNextDispatchStatus(selectedTrip) : null;
  const nextTrip = activeOrder ?? upcomingTrips[0] ?? driverOrders[0];
  const nextTripVehicle = nextTrip ? vehicles.find((item) => item.id === nextTrip.vehicleId) : undefined;
  const canUpdate = can(currentRole, "update_dispatch_status");

  return (
    <section className="mx-auto max-w-[520px] space-y-4">
      <div className="border border-line bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-md bg-teal-50 text-brand">
              <Smartphone size={20} />
            </span>
            <div>
              <p className="text-sm text-slate-500">Màn tài xế cá nhân</p>
              <h3 className="text-lg font-semibold text-ink">{selectedDriver?.fullName ?? "Chưa chọn tài xế"}</h3>
              <p className="text-xs text-slate-500">{selectedDriver?.phone ?? "Chưa có số điện thoại"}</p>
            </div>
          </div>
          <Badge tone={canUpdate ? "good" : "warn"}>{roleLabels[currentRole]}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatMini label="Hôm nay" value={String(todayDriverOrders.length)} />
          <StatMini label="Sắp tới" value={String(upcomingTrips.length)} />
        </div>
        {currentRole !== "driver" ? (
          <div className="mt-4">
            <Field label="Tài xế">
              <select className={inputClass()} onChange={(event) => setMobileDriverId(event.target.value)} value={selectedDriver?.id ?? ""}>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName} / {driver.phone}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-line bg-panel px-3 py-2 text-xs text-slate-500">Tài khoản driver chỉ xem chuyến đã gắn với hồ sơ của mình.</p>
        )}
      </div>

      <section className="border border-line bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Đề xuất từ tài xế</p>
            <h4 className="font-semibold text-ink">Báo cuốc nhanh</h4>
          </div>
          <Badge tone={urgent ? "warn" : "info"}>{urgent ? "Khẩn" : "Ngắn"}</Badge>
        </div>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            void submitDriverProposal(event).then((ok) => {
              if (ok) setUrgent(false);
            });
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tên khách"><input className={inputClass()} name="customerName" required /></Field>
            <Field label="SĐT"><input className={inputClass()} name="contactPhone" required /></Field>
            <Field label="Giờ bắt đầu"><input className={inputClass()} defaultValue={vietnamDateTimeLocalValue(new Date(now.getTime() + 60 * 60 * 1000))} name="startAt" required type="datetime-local" /></Field>
            <Field label="Giờ kết thúc dự kiến"><input className={inputClass()} defaultValue={vietnamDateTimeLocalValue(new Date(now.getTime() + 3 * 60 * 60 * 1000))} name="endAt" required type="datetime-local" /></Field>
            <div className="md:col-span-2">
              <Field label="Điểm đón"><input className={inputClass()} name="pickup" required /></Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Điểm đến"><input className={inputClass()} name="dropoff" required /></Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Loại xe / số khách"><input className={inputClass()} name="serviceLabel" placeholder="Ví dụ: 4 chỗ / 2 khách / airport transfer" required /></Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Ghi chú"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} name="note" placeholder="Khách gọi gấp, cần đón sớm, chờ ngắn..." /></Field>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input checked={urgent} className="size-4 accent-brand" name="urgent" onChange={(event) => setUrgent(event.target.checked)} type="checkbox" value="yes" />
              Chuyến gấp
            </label>
            <p className="text-xs text-slate-500">Gấp sẽ đẩy lên đầu hàng chờ cho điều hành.</p>
          </div>
          {urgent && (
            <Field label="Lý do gấp">
              <input className={inputClass()} name="urgentReason" placeholder="Ví dụ: khách vừa báo lên xe ngay, chờ sân bay..." />
            </Field>
          )}
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!can(currentRole, "submit_driver_proposal") || isActionPending("driver:proposal")} type="submit">
              <Save size={16} /> {isActionPending("driver:proposal") ? "Đang gửi..." : "Gửi đề xuất"}
          </button>
        </form>
      </section>

      {nextTrip && (
        <section className="border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Chuyến tiếp theo</p>
              <h3 className="font-semibold text-ink">{nextTrip.code}</h3>
            </div>
            <Badge tone={statusTone(nextTrip)}>{dispatchLabels[nextTrip.dispatchStatus]}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {timeOnly(nextTrip.startAt)} - {timeOnly(nextTrip.endAt)} · {routeSummaryForOrder(nextTrip)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{driverActionDetail(nextTrip)}</p>
          <DriverTripBrief driver={selectedDriver} order={nextTrip} vehicle={nextTripVehicle} />
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`tel:${nextTrip.contactPhone}`}>
              <PhoneCall size={16} /> Gọi khách
            </a>
            <a
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              href={mapsRouteUrlForOrder(nextTrip)}
              rel="noreferrer"
              target="_blank"
            >
              <Route size={16} /> Mở Google Maps
            </a>
          </div>
          {selectedTrip === nextTrip && nextDriverStatus && (
            <button
              className="mt-3 h-10 w-full rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canUpdate || isActionPending(`dispatch:status:${selectedTrip.id}:${nextDriverStatus}`)}
              onClick={() => updateOrderDispatchStatus(selectedTrip.id, nextDriverStatus, driverActionLabel(selectedTrip), "Driver")}
              type="button"
            >
              {isActionPending(`dispatch:status:${selectedTrip.id}:${nextDriverStatus}`) ? "Đang cập nhật..." : driverActionLabel(selectedTrip)}
            </button>
          )}
        </section>
      )}

      {driverProposals.length > 0 && (
        <section className="border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-ink">Đề xuất của tôi</h4>
            <Badge tone="warn">{driverProposals.length} chờ xử lý</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {driverProposals.slice(0, 3).map((order) => (
              <article className="rounded-md border border-line bg-panel p-3" key={order.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">{order.code}</p>
                    <p className="mt-1 font-semibold text-ink">{order.customerName}</p>
                  </div>
                  <Badge tone={order.priority === "urgent" ? "warn" : "info"}>{order.priority === "urgent" ? "Khẩn" : "Ngắn"}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{routeSummaryForOrder(order)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {timeOnly(order.startAt)} · {order.orderStatus === "draft" ? "Chờ Sales tiếp nhận" : order.dispatchStatus === "waiting_assignment" ? "Chờ điều hành" : dispatchLabels[order.dispatchStatus]}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {todayDriverOrders.length > 0 && (
        <section className="border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-ink">Lịch hôm nay</h4>
            <Badge tone="info">{todayDriverOrders.length} chuyến</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {todayDriverOrders.map((order) => {
              const vehicle = vehicles.find((item) => item.id === order.vehicleId);
              return (
                <button
                  className={`w-full rounded-md border p-3 text-left ${order.id === selectedTrip?.id ? "border-brand bg-teal-50" : "border-line bg-panel"}`}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">{order.code}</p>
                      <p className="mt-1 font-semibold text-ink">
                        {timeOnly(order.startAt)} · {order.serviceLabel}
                      </p>
                    </div>
                    <Badge tone={statusTone(order)}>{dispatchLabels[order.dispatchStatus]}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {routeSummaryForOrder(order)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {vehicle?.plateNo ?? "Chưa xe"} · {driverActionDetail(order)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {reportTrip ? (
        <section className="border border-line bg-white p-4 shadow-sm" key={reportTrip.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Báo cáo sau chuyến</p>
              <h4 className="font-semibold text-ink">{reportTrip.code}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {routeSummaryForOrder(reportTrip)}
              </p>
            </div>
            <Badge tone={reportTrip.driverReportStatus === "reported" ? "good" : "warn"}>{reportTrip.driverReportStatus === "reported" ? "Đã báo" : "Cần báo"}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600">Tài xế nhập tiền thu hộ và tick các khoản chi phí thực tế. Kế toán nhìn ngay trong hồ sơ lệnh.</p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              void submitDriverTripReport(event);
            }}
          >
            <input name="orderId" type="hidden" value={reportTrip.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tiền thu hộ">
                <input className={inputClass()} defaultValue={reportTripCollectedAmount} min="0" name="driverCollectedAmount" type="number" />
              </Field>
              <Field label="Ghi chú báo cáo">
                <textarea className={`${inputClass()} min-h-20 resize-none py-2`} name="driverExpenseNote" placeholder="Ví dụ: khách trả tiền mặt, gửi xe 30k, nước 20k..." defaultValue={reportTrip.driverExpenseNote ?? ""} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: "fuel", label: "Xăng", name: "driverExpenseFuel", checked: (reportTrip.driverExpenseFuel ?? 0) > 0, value: reportTrip.driverExpenseFuel ?? 0 },
                { key: "toll", label: "Cầu đường", name: "driverExpenseToll", checked: (reportTrip.driverExpenseToll ?? 0) > 0, value: reportTrip.driverExpenseToll ?? 0 },
                { key: "parking", label: "Gửi xe", name: "driverExpenseParking", checked: (reportTrip.driverExpenseParking ?? 0) > 0, value: reportTrip.driverExpenseParking ?? 0 },
                { key: "water", label: "Nước / ăn uống", name: "driverExpenseWater", checked: (reportTrip.driverExpenseWater ?? 0) > 0, value: reportTrip.driverExpenseWater ?? 0 },
                { key: "other", label: "Khác", name: "driverExpenseOther", checked: (reportTrip.driverExpenseOther ?? 0) > 0, value: reportTrip.driverExpenseOther ?? 0 }
              ].map((expense) => (
                <div className="rounded-md border border-line bg-panel p-3" key={expense.key}>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input defaultChecked={expense.checked} name={`use${expense.key.charAt(0).toUpperCase()}${expense.key.slice(1)}`} type="checkbox" value="yes" />
                    {expense.label}
                  </label>
                  <input className={`${inputClass()} mt-2`} defaultValue={expense.value} min="0" name={expense.name} placeholder="0" type="number" />
                </div>
              ))}
            </div>
            <div className="grid gap-2 rounded-md border border-dashed border-line bg-panel px-3 py-2 text-sm text-slate-600 sm:grid-cols-3">
              <p>Thu hộ: <span className="font-semibold text-ink">{money(reportTripCollectedAmount)}</span></p>
              <p>Chi phí: <span className="font-semibold text-ink">{money(reportTripExpenseTotal)}</span></p>
              <p>Cần nộp/đối soát: <span className="font-semibold text-ink">{money(Math.max(reportTripCollectedAmount - reportTripExpenseTotal, 0))}</span></p>
            </div>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!can(currentRole, "submit_driver_report") || isActionPending(`driver:report:${reportTrip.id}`)} type="submit">
              <Save size={16} /> {isActionPending(`driver:report:${reportTrip.id}`) ? "Đang gửi..." : "Gửi báo cáo"}
            </button>
          </form>
        </section>
      ) : (
        <section className="border border-line bg-white p-4 shadow-sm">
          <h4 className="font-semibold text-ink">Báo cáo sau chuyến</h4>
          <p className="mt-2 text-sm text-slate-500">Chỉ hiện khi tài xế có chuyến đã hoàn thành để nhập thu hộ và chi phí phát sinh.</p>
        </section>
      )}

      <section className="border border-line bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-semibold text-ink">Thông báo từ điều hành</h4>
          <Badge tone={driverNotifications.length > 0 ? "info" : "good"}>{driverNotifications.length} gần nhất</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {driverNotifications.length === 0 && <p className="text-sm text-slate-500">Chưa có thông báo dành cho tài xế.</p>}
          {driverNotifications.map((notification) => (
            <article className="rounded-md border border-line bg-panel p-3" key={notification.id}>
              <p className="font-semibold text-ink">{notification.title}</p>
              <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDateTime(notification.createdAt)}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function MasterDataPanel({
  createDriver,
  createVehicle,
  currentRole,
  drivers,
  vehicles
}: {
  createDriver: (event: FormEvent<HTMLFormElement>) => void;
  createVehicle: (event: FormEvent<HTMLFormElement>) => void;
  currentRole: AppRole;
  drivers: Driver[];
  vehicles: Vehicle[];
}) {
  const canManageMasterData = can(currentRole, "manage_master_data");

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <form className="border border-line bg-white p-4 shadow-sm" onSubmit={createVehicle}>
          <div className="flex items-center gap-2">
            <Car className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">Thêm xe</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Biển số"><input className={inputClass()} name="plateNo" required /></Field>
            <Field label="Loại xe"><input className={inputClass()} defaultValue="Xe du lịch" name="type" required /></Field>
            <Field label="Số chỗ"><input className={inputClass()} defaultValue="16" min="1" name="seats" required type="number" /></Field>
            <Field label="Nhiên liệu"><input className={inputClass()} defaultValue="Dầu" name="fuelType" /></Field>
            <Field label="Hình thức xe">
              <select className={inputClass()} name="ownershipType">
                <option value="company">Chính chủ công ty</option>
                <option value="partner">Xe hợp tác</option>
                <option value="rented">Xe thuê ngoài</option>
              </select>
            </Field>
            <Field label="Tài xế mặc định">
              <select className={inputClass()} name="defaultDriverId">
                <option value="">Chưa gán</option>
                {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName} / {driver.phone}</option>)}
              </select>
            </Field>
            <Field label="Trạng thái">
              <select className={inputClass()} name="status">
                <option value="active">active</option>
                <option value="maintenance">maintenance</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
            <Field label="Chủ sở hữu xe"><input className={inputClass()} name="ownerName" placeholder="Công ty hoặc cá nhân đứng tên xe" /></Field>
            <Field label="CCCD chủ xe"><input className={inputClass()} name="ownerCccd" /></Field>
            <Field label="Có HĐ đầu vào">
              <select className={inputClass()} name="supplierInvoiceRequired">
                <option value="no">Không</option>
                <option value="yes">Có</option>
              </select>
            </Field>
            <Field label="Tên NCC/HTX"><input className={inputClass()} name="supplierCompanyName" /></Field>
            <Field label="MST NCC"><input className={inputClass()} name="supplierTaxCode" /></Field>
            <Field label="SĐT NCC"><input className={inputClass()} name="supplierPhone" /></Field>
            <div className="md:col-span-2">
              <Field label="Địa chỉ NCC"><input className={inputClass()} name="supplierAddress" /></Field>
            </div>
            <Field label="STK NCC"><input className={inputClass()} name="supplierBankAccount" /></Field>
            <Field label="Ngân hàng NCC"><input className={inputClass()} name="supplierBankName" /></Field>
          </div>
          <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canManageMasterData} type="submit">
            <Save size={16} /> Lưu xe
          </button>
        </form>
        <div className="border border-line bg-white shadow-sm">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-semibold text-ink">Danh sách xe</h3>
          </div>
          <div className="divide-y divide-line">
            {vehicles.map((vehicle) => {
              const defaultDriver = drivers.find((driver) => driver.id === vehicle.defaultDriverId);
              const ownershipLabel = vehicle.ownershipType === "partner" ? "Hợp tác" : vehicle.ownershipType === "rented" ? "Thuê ngoài" : "Chính chủ";
              return (
              <div className="grid grid-cols-[1fr_90px_100px] gap-3 px-4 py-3 text-sm" key={vehicle.id}>
                <div>
                  <p className="font-semibold text-ink">{vehicle.plateNo}</p>
                  <p className="text-xs text-slate-500">{vehicle.type} / {vehicle.seats} chỗ / {vehicle.fuelType || "-"}</p>
                  <p className="text-xs text-slate-500">Tài xế mặc định: {defaultDriver?.fullName || "-"}</p>
                  <p className="text-xs text-slate-500">NCC: {vehicle.supplierCompanyName || vehicle.ownerName || "-"}</p>
                </div>
                <p className="text-slate-600">{ownershipLabel}</p>
                <Badge tone={vehicle.status === "active" ? "good" : "warn"}>{vehicle.status}</Badge>
              </div>
            );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <form className="border border-line bg-white p-4 shadow-sm" onSubmit={createDriver}>
          <div className="flex items-center gap-2">
            <UserPlus className="text-brand" size={20} />
            <h3 className="font-semibold text-ink">Thêm tài xế</h3>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Họ tên"><input className={inputClass()} name="fullName" required /></Field>
            <Field label="SĐT"><input className={inputClass()} name="phone" required /></Field>
            <Field label="CCCD"><input className={inputClass()} name="cccd" /></Field>
            <Field label="STK tài xế"><input className={inputClass()} name="bankAccount" /></Field>
            <Field label="Ngân hàng tài xế"><input className={inputClass()} name="bankName" /></Field>
            <Field label="Trạng thái">
              <select className={inputClass()} name="status">
                <option value="active">active</option>
                <option value="leave">leave</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
          </div>
          <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canManageMasterData} type="submit">
            <Save size={16} /> Lưu tài xế
          </button>
        </form>
        <div className="border border-line bg-white shadow-sm">
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-semibold text-ink">Danh sách tài xế</h3>
          </div>
          <div className="divide-y divide-line">
            {drivers.map((driver) => (
              <div className="grid grid-cols-[1fr_130px_100px] gap-3 px-4 py-3 text-sm" key={driver.id}>
                <div>
                  <p className="font-semibold text-ink">{driver.fullName}</p>
                  <p className="text-xs text-slate-500">{driver.phone} / CCCD: {driver.cccd || "-"}</p>
                  <p className="text-xs text-slate-500">{driver.bankAccount ? `${driver.bankAccount} / ${driver.bankName || "-"}` : "Chưa có STK"}</p>
                </div>
                <p className="text-slate-600">{driver.phone}</p>
                <Badge tone={driver.status === "active" ? "good" : "warn"}>{driver.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinancePanel({
  assignments,
  currentRole,
  drivers,
  isActionPending,
  orders,
  payments,
  selectedOrder,
  setSelectedOrderId,
  recordPayment,
  updateActualCosts,
  updateInvoiceStatus,
  reconcileOrder,
  vehicles
}: {
  assignments: Assignment[];
  currentRole: AppRole;
  drivers: Driver[];
  isActionPending: (key: string) => boolean;
  orders: DispatchOrder[];
  payments: Payment[];
  selectedOrder: DispatchOrder;
  setSelectedOrderId: (id: string) => void;
  recordPayment: (event: FormEvent<HTMLFormElement>) => void;
  updateActualCosts: (event: FormEvent<HTMLFormElement>) => void;
  updateInvoiceStatus: (nextStatus: InvoiceStatus) => void;
  reconcileOrder: () => void;
  vehicles: Vehicle[];
}) {
  const activeOrders = orders.filter((order) => order.orderStatus !== "cancelled");
  const selectedPayments = payments
    .filter((payment) => payment.orderId === selectedOrder.id)
    .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
  const paid = selectedPayments.filter((payment) => payment.status === "valid").reduce((sum, payment) => sum + payment.amount, 0);
  const debt = Math.max(selectedOrder.amountDue - paid, 0);
  const totalReceivable = activeOrders.reduce((sum, order) => sum + order.amountDue, 0);
  const totalCollected = payments
    .filter((payment) => payment.status === "valid" && activeOrders.some((order) => order.id === payment.orderId))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalDebt = Math.max(totalReceivable - totalCollected, 0);
  const totalActualProfit = activeOrders.reduce((sum, order) => sum + orderActualProfit(order), 0);
  const totalSupplierPayable = activeOrders
    .filter((order) => order.vehicleOwnership === "rented")
    .reduce((sum, order) => sum + (order.supplierTotalWithVat ?? orderCost(order)), 0);
  const driverHeldAmount = activeOrders
    .filter((order) => order.driverReportStatus === "reported" && (order.driverCollectedAmount ?? 0) > 0)
    .reduce((sum, order) => sum + (order.driverCollectedAmount ?? 0), 0);
  const profileIssues = (order: DispatchOrder) => {
    const orderPaid = payments.filter((payment) => payment.orderId === order.id && payment.status === "valid").reduce((sum, payment) => sum + payment.amount, 0);
    const orderDebt = Math.max(order.amountDue - orderPaid, 0);
    const issues: string[] = [];
    if (order.dispatchStatus === "completed" && order.reconciliationStatus !== "closed") issues.push("Chờ đối soát");
    if (orderDebt > 0) issues.push(`Còn nợ khách ${money(orderDebt)}`);
    if (order.driverReportStatus === "reported" && (order.driverCollectedAmount ?? 0) > 0) issues.push("Có thu hộ tài xế");
    if (order.driverReportStatus === "reported" && order.reconciliationStatus !== "closed") issues.push("Chờ duyệt báo cáo tài xế");
    if (order.vehicleOwnership === "rented" && (order.supplierTotalWithVat ?? 0) > 0) issues.push(`Theo dõi NCC ${money(order.supplierTotalWithVat ?? 0)}`);
    if (order.invoiceStatus !== "issued" && order.invoiceStatus !== "not_required") issues.push("Thiếu hóa đơn đầu ra");
    if (order.vehicleOwnership === "rented" && order.supplierInvoiceRequired && !order.supplierTaxCode) issues.push("Thiếu chứng từ đầu vào");
    if (order.reconciliationStatus !== "closed") issues.push("Hồ sơ chưa đóng");
    return issues;
  };
  const financeQueue = activeOrders
    .filter((order) => profileIssues(order).length > 0)
    .sort((a, b) => {
      const priority = (order: DispatchOrder) => {
        if (order.dispatchStatus === "completed" && order.reconciliationStatus !== "closed") return 1;
        if (order.paymentStatus !== "paid") return 2;
        if (order.invoiceStatus !== "issued" && order.invoiceStatus !== "not_required") return 3;
        return 4;
      };
      return priority(a) - priority(b) || new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });
  const canRecordPayment = can(currentRole, "record_payment");
  const canUpdateInvoice = can(currentRole, "update_invoice");
  const canCloseOrder = can(currentRole, "close_order");
  const canUpdateActualCosts = can(currentRole, "record_payment");
  const invoiceReady = selectedOrder.invoiceStatus === "issued" || selectedOrder.invoiceStatus === "not_required";
  const selectedDriverReportCollectedAmount = selectedOrder.driverReportStatus === "reported" || selectedOrder.driverReportStatus === "reviewed" ? (selectedOrder.driverCollectedAmount ?? 0) : 0;
  const selectedDriverReportExpenseTotal =
    (selectedOrder.driverExpenseFuel ?? 0) +
    (selectedOrder.driverExpenseToll ?? 0) +
    (selectedOrder.driverExpenseParking ?? 0) +
    (selectedOrder.driverExpenseWater ?? 0) +
    (selectedOrder.driverExpenseOther ?? 0);
  const selectedIssues = profileIssues(selectedOrder);
  const selectedSupplierPayable = selectedOrder.vehicleOwnership === "rented" ? selectedOrder.supplierTotalWithVat ?? orderCost(selectedOrder) : 0;
  const selectedDriverHeldAmount = selectedDriverReportCollectedAmount;
  const closeBlockers = [
    selectedOrder.dispatchStatus !== "completed" ? "Chuyến chưa hoàn thành" : "",
    !invoiceReady ? "Hóa đơn/chứng từ chưa xong" : ""
  ].filter(Boolean);
  const canCloseSelectedOrder = canCloseOrder && closeBlockers.length === 0;

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Phải thu khách" value={money(totalReceivable)} detail="Tổng giá trị lệnh chưa hủy." icon={ReceiptText} />
        <StatCard label="Đã thu" value={money(totalCollected)} detail="Tổng payment hợp lệ." icon={Banknote} />
        <StatCard label="Còn nợ khách" value={money(totalDebt)} detail="Phần khách/công ty chưa thanh toán." icon={AlertTriangle} />
        <StatCard label="Phải trả NCC" value={money(totalSupplierPayable)} detail="Tạm tính cho xe thuê ngoài." icon={Car} />
        <StatCard label="Thu hộ chưa nộp" value={money(driverHeldAmount)} detail="Khách trả qua tài xế cần đối soát." icon={UserRound} />
        <StatCard label="Hồ sơ chưa đối soát" value={String(activeOrders.filter((order) => order.reconciliationStatus !== "closed").length)} detail="Lệnh còn việc tài chính." icon={ClipboardList} />
        <StatCard label="Lãi thực tế" value={money(totalActualProfit)} detail="Dựa trên chi phí thực tế nếu có." icon={TrendingUp} />
      </div>

      <section className="border border-line bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Banknote className="text-brand" size={20} />
          <h3 className="font-semibold text-ink">Việc kế toán cần xử lý</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">Ưu tiên lệnh đã hoàn thành, còn nợ, thiếu hóa đơn hoặc chưa đóng hồ sơ.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Lệnh</th>
                <th className="px-3 py-2">Khách</th>
                <th className="px-3 py-2">Phải thu</th>
                <th className="px-3 py-2">Còn nợ</th>
                <th className="px-3 py-2">Việc cần xử lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {financeQueue.length === 0 && (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>Không có hồ sơ tài chính cần xử lý.</td></tr>
              )}
              {financeQueue.map((order) => {
                const orderPaid = payments.filter((payment) => payment.orderId === order.id && payment.status === "valid").reduce((sum, payment) => sum + payment.amount, 0);
                const orderDebt = Math.max(order.amountDue - orderPaid, 0);
                const issues = profileIssues(order);
                const selected = order.id === selectedOrder.id;
                return (
                  <tr className={selected ? "bg-teal-50" : "hover:bg-panel"} key={order.id}>
                    <td className="px-3 py-3">
                      <button className="font-semibold text-brand hover:underline" onClick={() => setSelectedOrderId(order.id)} type="button">{order.code}</button>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(order.startAt)}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{order.customerName}</td>
                    <td className="px-3 py-3 font-semibold text-ink">{money(order.amountDue)}</td>
                    <td className="px-3 py-3 font-semibold text-rose-800">{money(orderDebt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {issues.slice(0, 3).map((issue) => <Badge key={issue} tone={issue.includes("nợ") || issue.includes("Thiếu") ? "warn" : "info"}>{issue}</Badge>)}
                        {issues.length > 3 && <Badge tone="neutral">+{issues.length - 3}</Badge>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <section className="border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Banknote className="text-brand" size={20} />
              <h3 className="font-semibold text-ink">Hồ sơ đang chọn</h3>
            </div>
            <p className="mt-2 text-lg font-semibold text-ink">{selectedOrder.code}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p className="font-medium text-ink">{selectedOrder.customerName}</p>
              <p>{routeSummaryForOrder(selectedOrder)}</p>
              <p>{formatDateTime(selectedOrder.startAt)} - {formatDateTime(selectedOrder.endAt)}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatMini label="Phải thu" value={money(selectedOrder.amountDue)} />
              <StatMini label="Đã thu" value={money(paid)} />
              <StatMini label="Còn nợ" value={money(debt)} />
              <StatMini label="Trạng thái chuyến" value={dispatchLabels[selectedOrder.dispatchStatus]} />
            </div>
          {selectedIssues.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {selectedIssues.slice(0, 6).map((issue) => <Badge key={issue} tone={issue.includes("nợ") || issue.includes("Thiếu") ? "warn" : "info"}>{issue}</Badge>)}
            </div>
          )}
        </section>

          <section className="border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">Báo cáo từ tài xế</h3>
              <Badge tone={selectedOrder.driverReportStatus === "reviewed" ? "good" : selectedOrder.driverReportStatus === "reported" ? "info" : "warn"}>{selectedOrder.driverReportStatus === "reviewed" ? "Đã duyệt" : selectedOrder.driverReportStatus === "reported" ? "Đã báo" : "Chưa báo"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">Dữ liệu này do tài xế gửi sau chuyến, kế toán dùng để đối chiếu hồ sơ.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <StatMini label="Thu hộ báo" value={money(selectedDriverReportCollectedAmount)} />
              <StatMini label="Tổng chi phí báo" value={money(selectedDriverReportExpenseTotal)} />
              <StatMini label="Cần nộp về" value={money(Math.max(selectedDriverReportCollectedAmount - selectedDriverReportExpenseTotal, 0))} />
              <StatMini label="Đã báo lúc" value={selectedOrder.driverReportedAt ? formatDateTime(selectedOrder.driverReportedAt) : "-"} />
            </div>
            <p className="mt-3 rounded-md border border-dashed border-line bg-panel px-3 py-2 text-xs text-slate-500">
              {selectedOrder.driverExpenseNote ?? "Chưa có ghi chú báo cáo từ tài xế."}
            </p>
          </section>

          <form className="border border-line bg-white p-4 shadow-sm" onSubmit={recordPayment}>
            <div className="flex items-center gap-2">
              <ReceiptText className="text-brand" size={20} />
              <h3 className="font-semibold text-ink">1. Thu tiền khách</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">Một lệnh có thể ghi nhiều lần thanh toán. App tự tính còn nợ.</p>
            <div className="mt-4 grid gap-3">
              <Field label="Lệnh"><input className={inputClass()} readOnly value={`${selectedOrder.code} / ${selectedOrder.customerName}`} /></Field>
              <Field label="Số tiền"><input className={inputClass()} defaultValue={debt || selectedOrder.amountDue} min="1" name="amount" required type="number" /></Field>
              <Field label="Ngày thu"><input className={inputClass()} defaultValue={vietnamDateTimeLocalValue()} name="paidAt" type="datetime-local" /></Field>
              <Field label="Phương thức"><select className={inputClass()} name="method"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="card">Thẻ</option><option value="other">Khác</option></select></Field>
              <Field label="Đối tượng thu tiền"><input className={inputClass()} defaultValue={selectedOrder.collectionAccountOwner ?? "Công ty thu"} name="collector" placeholder="Công ty thu / Tài xế thu / Ban điều hành" /></Field>
              <Field label="Số tài khoản thu"><input className={inputClass()} defaultValue={selectedOrder.collectionBankAccount ?? ""} name="bankAccount" placeholder="STK nhận tiền của lần thu này" /></Field>
              <Field label="Ngân hàng thu"><input className={inputClass()} defaultValue={selectedOrder.collectionBankName ?? ""} name="bankName" placeholder="MB / Techcombank / tiền mặt..." /></Field>
              <Field label="Thời gian nhập"><input className={inputClass()} name="reference" placeholder="Nhập thủ công thời gian ghi nhận nếu cần" /></Field>
              <Field label="Ghi chú thanh toán"><textarea className={textAreaClass()} name="note" placeholder="Thu lần 1, khách chuyển thiếu, tài xế thu hộ..." /></Field>
            </div>
            <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canRecordPayment || isActionPending(`finance:payment:${selectedOrder.id}`)} type="submit">
              <Banknote size={16} /> {isActionPending(`finance:payment:${selectedOrder.id}`) ? "Đang ghi..." : "Ghi payment"}
            </button>
          </form>
        </div>
        <div className="space-y-4">
        <section className="border border-line bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-ink">2. Thu hộ tài xế</h3>
          <p className="mt-1 text-sm text-slate-500">Khách đã trả cho tài xế chưa đồng nghĩa công ty đã nhận tiền.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatMini label="Khách trả qua" value={selectedDriverHeldAmount > 0 ? selectedOrder.payer ?? "Tài xế" : "Không ghi nhận"} />
            <StatMini label="Tạm tính thu hộ" value={money(selectedDriverHeldAmount)} />
            <StatMini label="Cần đối soát" value={selectedDriverHeldAmount > 0 && selectedOrder.reconciliationStatus !== "closed" ? "Có" : "Không"} />
          </div>
          {selectedDriverHeldAmount > 0 && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Cần xác nhận tài xế đã nộp tiền về công ty trước khi đóng hồ sơ.
            </p>
          )}
        </section>

        <section className="border border-line bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-ink">3. Công nợ NCC / xe ngoài</h3>
          <p className="mt-1 text-sm text-slate-500">Chỉ phát sinh khi lệnh dùng xe thuê ngoài hoặc có nhà cung cấp.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatMini label="Hình thức xe" value={selectedOrder.vehicleOwnership === "rented" ? "Thuê ngoài" : "Xe công ty"} />
            <StatMini label="Giá mua/NCC" value={money(selectedSupplierPayable)} />
            <StatMini label="NCC" value={selectedOrder.supplierCompanyName || selectedOrder.supplierOwnerName || "-"} />
          </div>
          {selectedOrder.vehicleOwnership === "rented" && (
            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <p>Tài khoản NCC: <span className="font-medium text-ink">{selectedOrder.supplierBankAccount || "-"}</span></p>
              <p>Ngân hàng NCC: <span className="font-medium text-ink">{selectedOrder.supplierBankName || "-"}</span></p>
              <p>Hóa đơn đầu vào: <span className="font-medium text-ink">{selectedOrder.supplierInvoiceRequired ? "Có yêu cầu" : "Không yêu cầu"}</span></p>
              <p>MST NCC: <span className="font-medium text-ink">{selectedOrder.supplierTaxCode || "-"}</span></p>
            </div>
          )}
        </section>

        <section className="border border-line bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-ink">4. Hóa đơn & tổng hợp công nợ</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatMini label="Phải thu" value={money(selectedOrder.amountDue)} />
            <StatMini label="Đã thu" value={money(paid)} />
            <StatMini label="Còn nợ" value={money(debt)} />
            <StatMini label="Lãi dự kiến" value={money(orderProfit(selectedOrder))} />
            <StatMini label="Lãi thực tế" value={money(orderActualProfit(selectedOrder))} />
            <StatMini label="Chi phí thực tế" value={money(orderActualCost(selectedOrder))} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={selectedOrder.paymentStatus === "paid" ? "good" : selectedOrder.paymentStatus === "partial" ? "warn" : "danger"}>{paymentLabels[selectedOrder.paymentStatus]}</Badge>
            <Badge tone={selectedOrder.invoiceStatus === "issued" || selectedOrder.invoiceStatus === "not_required" ? "good" : "warn"}>{invoiceLabels[selectedOrder.invoiceStatus]}</Badge>
            <Badge tone={selectedOrder.reconciliationStatus === "closed" ? "good" : "info"}>{selectedOrder.reconciliationStatus}</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canUpdateInvoice || isActionPending(`finance:invoice:${selectedOrder.id}:ready_to_issue`)} onClick={() => updateInvoiceStatus("ready_to_issue")} type="button">Sẵn sàng HĐ</button>
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canUpdateInvoice || isActionPending(`finance:invoice:${selectedOrder.id}:issued`)} onClick={() => updateInvoiceStatus("issued")} type="button">Đã xuất HĐ</button>
          </div>
        </section>
        <form className="border border-line bg-white p-4 shadow-sm" onSubmit={updateActualCosts}>
          <h3 className="font-semibold text-ink">5. Chi phí thực tế sau chuyến</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="Tài xế thực tế"><input className={inputClass()} defaultValue={selectedOrder.actualDriverCost ?? selectedOrder.driverCost ?? 0} min="0" name="actualDriverCost" type="number" /></Field>
            <Field label="Xe/nhiên liệu thực tế"><input className={inputClass()} defaultValue={selectedOrder.actualVehicleCost ?? selectedOrder.vehicleCost ?? 0} min="0" name="actualVehicleCost" type="number" /></Field>
            <Field label="Phụ phí thực tế"><input className={inputClass()} defaultValue={selectedOrder.actualOtherCost ?? selectedOrder.otherCost ?? 0} min="0" name="actualOtherCost" type="number" /></Field>
            <div className="md:col-span-3">
              <Field label="Ghi chú chi phí"><textarea className={textAreaClass()} defaultValue={selectedOrder.actualCostNote ?? ""} name="actualCostNote" placeholder="Cầu đường, gửi xe, phát sinh, tài xế ứng..." /></Field>
            </div>
          </div>
          <button className="mt-4 h-10 w-full rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canUpdateActualCosts || isActionPending(`finance:actual-costs:${selectedOrder.id}`)} type="submit">{isActionPending(`finance:actual-costs:${selectedOrder.id}`) ? "Đang lưu..." : "Lưu chi phí thực tế"}</button>
        </form>
        <section className="border border-line bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-ink">Các lần thanh toán</h3>
          <div className="mt-3 space-y-2 text-sm">
            {selectedPayments.length === 0 && <p className="text-slate-500">Chưa có thanh toán.</p>}
            {selectedPayments.map((payment) => (
              <div className="flex items-center justify-between border border-line bg-panel p-3" key={payment.id}>
                <div>
                  <p className="font-medium">{money(payment.amount)}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(payment.paidAt)} / {paymentMethodLabels[payment.method]} / {payment.collector || "chưa ghi người thu"}</p>
                  <p className="text-xs text-slate-500">STK/NH: {payment.bankAccount || selectedOrder.collectionBankAccount || "-"} / {payment.bankName || selectedOrder.collectionBankName || "-"}</p>
                  <p className="text-xs text-slate-500">{payment.reference || "không mã GD"}{payment.note ? ` / ${payment.note}` : ""}</p>
                </div>
                <Badge tone="good">{payment.status}</Badge>
              </div>
            ))}
          </div>
        </section>
        <section className="border border-line bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-ink">6. Đối soát & đóng hồ sơ</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {[
              ["Chuyến đã hoàn thành", selectedOrder.dispatchStatus === "completed"],
              ["Dòng tiền đã ghi nhận trạng thái", selectedOrder.paymentStatus !== "refunded"],
              ["Thu hộ đã nộp/không phát sinh", selectedDriverHeldAmount === 0 || selectedOrder.reconciliationStatus === "closed"],
              ["NCC đã xử lý/không phát sinh", selectedOrder.vehicleOwnership !== "rented" || selectedSupplierPayable >= 0],
              ["Hóa đơn/chứng từ đã xử lý", invoiceReady],
              ["Báo cáo tài xế không bắt buộc", true]
            ].map(([label, ok]) => (
              <p className="flex items-center gap-2" key={String(label)}>
                <CheckCircle2 className={ok ? "text-brand" : "text-slate-300"} size={16} />
                <span className={ok ? "text-slate-700" : "text-slate-500"}>{label}</span>
              </p>
            ))}
          </div>
          {closeBlockers.length > 0 ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Chưa thể đóng: {closeBlockers.join(", ")}.
            </p>
          ) : debt > 0 ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Hồ sơ đủ điều kiện đóng và còn công nợ {money(debt)} để kế toán theo dõi.
            </p>
          ) : (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Hồ sơ đủ điều kiện đóng.</p>
          )}
          <button className="mt-4 h-10 w-full rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canCloseSelectedOrder || isActionPending(`finance:close:${selectedOrder.id}`)} onClick={reconcileOrder} type="button">{isActionPending(`finance:close:${selectedOrder.id}`) ? "Đang đóng..." : "Đóng hồ sơ"}</button>
        </section>
        <FinalDispatchOrderSheet assignments={assignments} drivers={drivers} order={selectedOrder} payments={selectedPayments} vehicles={vehicles} />
      </div>
      </section>
    </section>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
  );
}

function AccessDenied({ role }: { role: AppRole }) {
  return (
    <section className="border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-amber" size={20} />
        <h3 className="font-semibold text-amber-950">Không đủ quyền</h3>
      </div>
      <p className="mt-2 text-sm text-amber-900">Vai trò hiện tại: {roleLabels[role]}. Chọn Manager hoặc Admin để xem audit log.</p>
    </section>
  );
}

function AuditPanel({ events }: { events: AuditEvent[] }) {
  return (
    <section className="border border-line bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <FileText className="text-brand" size={20} />
        <h3 className="font-semibold text-ink">Audit timeline</h3>
      </div>
      <div className="divide-y divide-line">
        {events.map((event) => (
          <div className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[170px_150px_1fr_160px]" key={event.id}>
            <p className="font-medium text-ink">{event.action}</p>
            <p className="text-slate-600">{event.actor}</p>
            <p className="text-slate-600">{event.entityType} / {event.entityId}{event.reason ? ` / ${event.reason}` : ""}</p>
            <p className="text-slate-500">{formatDateTime(event.createdAt)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
