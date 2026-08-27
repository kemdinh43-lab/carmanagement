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
import { calculatePaymentStatus, findAssignmentConflict, getOperationalAlerts, money } from "@/lib/domain";
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

const tabs = ["Dashboard", "Lệnh điều xe", "Điều hành", "Tài xế mobile", "Users", "Khách hàng", "Tài chính", "Master data", "Audit"] as const;
type Tab = (typeof tabs)[number];

function canViewTab(tab: Tab, role: AppRole) {
  if (tab === "Dashboard") return true;
  if (tab === "Lệnh điều xe") return role !== "driver";
  if (tab === "Điều hành") return can(role, "assign_vehicle");
  if (tab === "Tài xế mobile") return true;
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

function normalizeState(state: OpsState): OpsState {
  return {
    ...state,
    vehicles: state.vehicles ?? seedVehicles,
    drivers: state.drivers ?? seedDrivers,
    customers: state.customers ?? seedCustomers,
    companies: state.companies ?? seedCompanies,
    companyContacts: state.companyContacts ?? seedCompanyContacts,
    notifications: state.notifications ?? [],
    orders: state.orders.map((order) => ({
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
  if (tab === "Tài xế mobile") return Smartphone;
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

function allowedDispatchNextStatuses(currentStatus: DispatchStatus): DispatchStatus[] {
  if (currentStatus === "waiting_assignment") return ["assigned", "cancelled"];
  if (currentStatus === "assigned") return ["driver_accepted", "cancelled"];
  if (currentStatus === "driver_accepted") return ["in_progress", "cancelled"];
  if (currentStatus === "in_progress") return ["completed", "cancelled"];
  return [];
}

function canMoveDispatchStatus(currentStatus: DispatchStatus, nextStatus: DispatchStatus) {
  return allowedDispatchNextStatuses(currentStatus).includes(nextStatus);
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
  const routeUrl = useMemo(
    () =>
      `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(order.pickup)}&destination=${encodeURIComponent(order.dropoff)}&travelmode=driving`,
    [order.dropoff, order.pickup]
  );
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

function buildCode(index: number) {
  return `AOT-260825-${String(index).padStart(4, "0")}`;
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

function toAppNotification(row: unknown): AppNotification {
  const item = row as Record<string, unknown>;
  return {
    id: String(item.id),
    audience: String(item.audience) as AppNotification["audience"],
    title: String(item.title),
    body: String(item.body),
    entityId: typeof item.entity_id === "string" ? item.entity_id : undefined,
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
  const [state, setState] = useState<OpsState>(initialState);
  const [selectedOrderId, setSelectedOrderId] = useState(seedOrders[2]?.id ?? seedOrders[0]?.id);
  const [query, setQuery] = useState("");
  const [customerKind, setCustomerKind] = useState<DispatchOrder["customerKind"]>("individual");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(2026, 7, 1));
  const [calendarDay, setCalendarDay] = useState(() => new Date(2026, 7, 25));
  const [mobileDriverId, setMobileDriverId] = useState(seedDrivers[0]?.id ?? "");
  const [roleState, setRoleState] = useState<AppRole | null>(supabaseConfigured ? null : "manager");
  const [authLabel, setAuthLabel] = useState(supabaseConfigured ? "Đang kiểm tra đăng nhập..." : "Local demo");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authDriverId, setAuthDriverId] = useState<string | undefined>();
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [message, setMessage] = useState(supabaseConfigured ? "Đang kết nối Supabase..." : "Dữ liệu pilot lưu trên trình duyệt máy này.");
  const [now, setNow] = useState(() => new Date());
  const currentRole = roleState ?? "manager";
  const visibleTabs = useMemo(() => tabs.filter((item) => canViewTab(item, currentRole)), [currentRole]);
  const activeTab = visibleTabs.includes(tab) ? tab : "Dashboard";
  const visibleNotifications = (state.notifications ?? []).filter((item) => item.audience === currentRole || item.audience === "admin").slice(0, 5);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
        persistedStateRef.current = normalized;
        setState(normalized);
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

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!data.user) {
          setRoleState(null);
          setAuthUserId(null);
          setAuthLabel("Chưa đăng nhập");
          startupTiming("auth_get_user", authStartedAt, { signedIn: false });
          return;
        }
        setAuthUserId(data.user.id);
        startupTiming("auth_get_user", authStartedAt, { signedIn: true });
        const profileStartedAt = performance.now();
        const { data: profile } = await supabase
          .from("app_user_profiles" as never)
          .select("role,full_name,driver_id" as never)
          .eq("user_id" as never, data.user.id as never)
          .maybeSingle();
        const typedProfile = profile as { role?: AppRole; full_name?: string; driver_id?: string } | null;
        const nextRole = typedProfile?.role ?? "sale";
        if (!typedProfile) {
          await supabase.from("app_user_profiles" as never).upsert({
            user_id: data.user.id,
            full_name: data.user.email || "",
            phone: null,
            role: nextRole,
            driver_id: null
          } as never);
        }
        setRoleState(nextRole);
        if (typedProfile?.driver_id) {
          setAuthDriverId(typedProfile.driver_id);
          setMobileDriverId(typedProfile.driver_id);
          setTab("Tài xế mobile");
        }
        setAuthLabel(typedProfile?.full_name || data.user.email || "Signed in");
        startupTiming("profile_load", profileStartedAt, { role: nextRole });
      } catch (error) {
        if (cancelled) return;
        setRoleState(null);
        setAuthUserId(null);
        setAuthLabel(error instanceof Error ? error.message : "Auth load failed");
      } finally {
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
    if (!supabaseConfigured) return;
    const supabase = createSupabaseBrowserClient();
    const notificationStartedAt = performance.now();
    supabase
      .from("app_notifications" as never)
      .select("*" as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(20 as never)
      .then(({ data }) => {
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
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !persistenceReady) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let inFlight = false;
    let pendingReload = false;
    let timeout: number | null = null;

    const reloadTables = [
      "app_customers",
      "app_companies",
      "app_company_contacts",
      "app_vehicles",
      "app_drivers",
      "app_dispatch_orders",
      "app_dispatch_assignments",
      "app_payments",
      "app_audit_events"
    ] as const;

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
  }, [persistenceReady, repository]);

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
          .then(
            () => undefined,
            (error: unknown) => {
              if (process.env.NODE_ENV !== "production") console.warn("[command-rpc]", error);
            }
          );
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
    createSupabaseBrowserClient()
      .from("app_notifications" as never)
      .upsert({
        id: notification.id,
        audience: notification.audience,
        title: notification.title,
        body: notification.body,
        entity_id: notification.entityId ?? null,
        is_read: notification.read ?? false,
        created_at: notification.createdAt
      } as never)
      .then(() => undefined);
  }

  function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can(currentRole, "create_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền tạo lệnh.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const startAt = String(form.get("startAt"));
    const endAt = String(form.get("endAt"));
    const amountDue = Number(form.get("amountDue"));
    const driverCost = Number(form.get("driverCost") || 0);
    const vehicleCost = Number(form.get("vehicleCost") || 0);
    const otherCost = Number(form.get("otherCost") || 0);
    const kind = String(form.get("customerKind")) as DispatchOrder["customerKind"];
    const customerId = String(form.get("customerId") || "");
    const companyId = String(form.get("companyId") || "");
    const contactId = String(form.get("contactId") || "");
    const contactName = String(form.get("contactName") || "").trim();
    const companyName = String(form.get("companyName") || "").trim();
    const taxCode = String(form.get("taxCode") || "").trim();
    const billingEmail = String(form.get("billingEmail") || "").trim();
    const selectedCustomerProfile = state.customers.find((customer) => customer.id === customerId);
    const selectedCompanyProfile = state.companies.find((company) => company.id === companyId);
    const selectedContactProfile = state.companyContacts.find((contact) => contact.id === contactId);

    if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) {
      setMessage("Giờ kết thúc phải sau giờ bắt đầu.");
      return;
    }

    if (amountDue < 0 || driverCost < 0 || vehicleCost < 0 || otherCost < 0) {
      setMessage("Giá bán và chi phí không được âm.");
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

    const order: DispatchOrder = {
      id: makeId("order"),
      code: buildCode(state.orders.length + 1),
      customerKind: kind,
      customerName: kind === "company" ? selectedCompanyProfile?.legalName ?? companyName : selectedCustomerProfile?.fullName ?? String(form.get("customerName") || "").trim(),
      companyName: kind === "company" ? selectedCompanyProfile?.legalName ?? companyName : undefined,
      contactName: kind === "company" ? selectedContactProfile?.fullName ?? contactName : undefined,
      contactPhone: kind === "company" ? selectedContactProfile?.phone ?? String(form.get("contactPhone") || "").trim() : selectedCustomerProfile?.phone ?? String(form.get("contactPhone") || "").trim(),
      taxCode: kind === "company" ? ((selectedCompanyProfile?.taxCode ?? taxCode) || undefined) : undefined,
      billingEmail: kind === "company" ? ((selectedCompanyProfile?.billingEmail ?? billingEmail) || undefined) : undefined,
      pickup: String(form.get("pickup") || "").trim(),
      dropoff: String(form.get("dropoff") || "").trim(),
      serviceLabel: String(form.get("serviceLabel") || "Private transfer").trim(),
      salesOwner: String(form.get("salesOwner") || "Sale A"),
      source: String(form.get("source") || "Manual"),
      startAt: toIsoFromInput(startAt),
      endAt: toIsoFromInput(endAt),
      amountDue,
      driverCost,
      vehicleCost,
      otherCost,
      quoteNote: String(form.get("quoteNote") || "").trim() || undefined,
      priority: String(form.get("priority") || "normal") as DispatchPriority,
      salesNote: String(form.get("salesNote") || "").trim() || undefined,
      quoteStatus: "draft",
      orderStatus: "pending_dispatch_review",
      dispatchStatus: "waiting_assignment",
      paymentStatus: "unpaid",
      invoiceStatus: form.get("invoiceRequired") === "yes" ? (kind === "company" && (selectedCompanyProfile?.taxCode ?? taxCode) && (selectedCompanyProfile?.billingEmail ?? billingEmail) ? "ready_to_issue" : "pending_info") : "not_required",
      reconciliationStatus: "open"
    };

    runCommand("order.submit_proposal", (current) => submitDispatchProposal(current, order, audit), `Đã gửi đề xuất điều xe ${order.code} vào hàng chờ điều hành xét duyệt.`);
    setSelectedOrderId(order.id);
    setTab("Lệnh điều xe");
    notify({ audience: "dispatcher", title: "Đề xuất điều xe mới", body: `${order.code} / ${order.customerName}`, entityId: order.id });
    event.currentTarget.reset();
  }

  function updateQuoteStatus(nextStatus: QuoteStatus) {
    if (!selectedOrder) return;
    if (!can(currentRole, "create_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền cập nhật báo giá.`);
      return;
    }

    runCommand("order.update_quote", (current) => updateQuoteStatusCommand(current, selectedOrder.id, nextStatus, audit), `Đã cập nhật báo giá ${selectedOrder.code}: ${quoteLabels[nextStatus]}.`);
  }

  function assignOrder(event: FormEvent<HTMLFormElement>) {
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
    const vehicleId = String(form.get("vehicleId"));
    const driverId = String(form.get("driverId"));
    const reason = String(form.get("reason") || "Assign resource").trim();
    const currentAssignment = state.assignments.find((assignment) => assignment.dispatchOrderId === selectedOrder.id && assignment.status === "active");

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
      setMessage(`Không thể phân: trùng xe hoặc tài xế với ${conflictOrder?.code ?? conflict.dispatchOrderId}.`);
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

    runCommand(
      "dispatch.assign_vehicle_driver",
      (current) => assignVehicleDriver(current, selectedOrder.id, assignment, currentAssignment?.id, reason, audit, false),
      currentAssignment ? `Đã đổi xe/tài xế cho ${selectedOrder.code}.` : `Đã phân xe/tài xế cho ${selectedOrder.code}.`,
      {
        name: "assign_vehicle_driver",
        args: {
          p_order_id: selectedOrder.id,
          p_assignment_id: assignment.id,
          p_vehicle_id: vehicleId,
          p_driver_id: driverId,
          p_start_at: selectedOrder.startAt,
          p_end_at: selectedOrder.endAt,
          p_replace_assignment_id: currentAssignment?.id ?? null,
          p_replace_reason: currentAssignment ? reason : null
        }
      }
    );
    notify({ audience: "driver", title: "Bạn có chuyến mới", body: `${selectedOrder.code} / ${formatDateTime(selectedOrder.startAt)}`, entityId: selectedOrder.id });
    notify({
      audience: "dispatcher",
      title: currentAssignment ? "Đã đổi phân xe" : "Đã phân xe/tài xế",
      body: `${selectedOrder.code} / ${vehicleId} / ${driverId}`,
      entityId: selectedOrder.id
    });
    notify({
      audience: "sale",
      title: "Đề xuất đã được triển khai",
      body: `${selectedOrder.code} đã có xe và tài xế.`,
      entityId: selectedOrder.id
    });
  }

  function reviewDispatchProposal(orderId: string, decision: "approved" | "rejected", reason: string) {
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

    runCommand(
      "dispatch.review_proposal",
      (current) => reviewDispatchProposalCommand(current, orderId, decision, cleanReason || "Dispatcher approved for assignment", audit, false),
      decision === "approved" ? `Đã duyệt ${targetOrder.code}. Có thể phân xe/tài xế.` : `Đã từ chối đề xuất ${targetOrder.code}.`,
      {
        name: "review_dispatch_proposal",
        args: {
          p_order_id: orderId,
          p_decision: decision,
          p_reason: cleanReason || "Dispatcher approved for assignment"
        }
      }
    );
    notify({
      audience: "sale",
      title: decision === "approved" ? "Đề xuất đã duyệt" : "Đề xuất bị từ chối",
      body: decision === "approved" ? `${targetOrder.code} chuyển sang chờ phân xe/tài xế.` : `${targetOrder.code} / ${cleanReason}`,
      entityId: orderId
    });
  }

  function updateOrderDispatchStatus(orderId: string, nextStatus: DispatchStatus, reason: string, actor = "Dispatcher") {
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
    runCommand(
      "dispatch.update_status",
      (current) => updateDispatchStatusCommand(current, orderId, nextStatus, reason, actor, audit, false),
      `Đã cập nhật ${targetOrder.code}: ${dispatchLabels[nextStatus]}.`,
      {
        name: "update_dispatch_status",
        args: {
          p_order_id: orderId,
          p_next_status: nextStatus,
          p_reason: reason,
          p_actor: actor
        }
      }
    );
    if (nextStatus === "completed") {
      notify({ audience: "accountant", title: "Chuyến đã hoàn thành", body: `${targetOrder.code} sẵn sàng đối soát.`, entityId: orderId });
      notify({ audience: "dispatcher", title: "Chuyến hoàn thành", body: `${targetOrder.code} đã xong chuyến.`, entityId: orderId });
    } else if (nextStatus === "driver_accepted") {
      notify({ audience: "dispatcher", title: "Tài xế đã nhận chuyến", body: `${targetOrder.code} chờ xuất phát.`, entityId: orderId });
    } else if (nextStatus === "in_progress") {
      notify({ audience: "dispatcher", title: "Chuyến đang chạy", body: `${targetOrder.code} đang trên đường.`, entityId: orderId });
    }
  }

  function updateDispatchStatus(nextStatus: DispatchStatus, reason: string) {
    if (!selectedOrder) return;
    updateOrderDispatchStatus(selectedOrder.id, nextStatus, reason);
  }

  function updateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!can(currentRole, "create_order") && !can(currentRole, "assign_vehicle")) {
      setMessage(`${roleLabels[currentRole]} không có quyền sửa lệnh.`);
      return;
    }

    const form = new FormData(event.currentTarget);
    const startAt = String(form.get("startAt"));
    const endAt = String(form.get("endAt"));
    const nextStartAt = toIsoFromInput(startAt);
    const nextEndAt = toIsoFromInput(endAt);
    const amountDue = Number(form.get("amountDue"));
    const driverCost = Number(form.get("driverCost") || 0);
    const vehicleCost = Number(form.get("vehicleCost") || 0);
    const otherCost = Number(form.get("otherCost") || 0);
    const kind = String(form.get("customerKind") || selectedOrder.customerKind) as DispatchOrder["customerKind"];
    const customerName = String(form.get("customerName") || "").trim();
    const companyName = String(form.get("companyName") || "").trim();
    const taxCode = String(form.get("taxCode") || "").trim();
    const billingEmail = String(form.get("billingEmail") || "").trim();
    const salesOwner = String(form.get("salesOwner") || selectedOrder.salesOwner).trim();
    const source = String(form.get("source") || selectedOrder.source).trim();

    if (!startAt || !endAt || new Date(nextEndAt) <= new Date(nextStartAt)) {
      setMessage("Giờ kết thúc phải sau giờ bắt đầu.");
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
          startAt: nextStartAt,
          endAt: nextEndAt,
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
    runCommand(
      "order.update_details",
      (current) =>
        updateOrderDetails(
          current,
          selectedOrder.id,
          {
            customerKind: kind,
            customerName,
            contactName: String(form.get("contactName") || "").trim() || undefined,
            contactPhone: String(form.get("contactPhone") || "").trim(),
            companyName: kind === "company" ? companyName || customerName : undefined,
            taxCode: kind === "company" ? taxCode || undefined : undefined,
            billingEmail: kind === "company" ? billingEmail || undefined : undefined,
            pickup: String(form.get("pickup") || "").trim(),
            dropoff: String(form.get("dropoff") || "").trim(),
            serviceLabel: String(form.get("serviceLabel") || "").trim(),
            salesOwner,
            source,
            startAt: nextStartAt,
            endAt: nextEndAt,
            amountDue,
            driverCost,
            vehicleCost,
            otherCost,
            quoteNote: String(form.get("quoteNote") || "").trim() || undefined,
            priority: String(form.get("priority") || "normal") as DispatchPriority,
            salesNote: String(form.get("salesNote") || "").trim() || undefined
          },
          activeAssignment?.id,
          reason,
          audit,
          false
        ),
      `Đã cập nhật lệnh ${selectedOrder.code}.`,
      {
        name: "update_dispatch_order",
        args: {
          p_order_id: selectedOrder.id,
          p_customer_kind: kind,
          p_customer_name: customerName,
          p_contact_name: String(form.get("contactName") || "").trim() || null,
          p_contact_phone: String(form.get("contactPhone") || "").trim(),
          p_company_name: kind === "company" ? companyName || customerName : null,
          p_tax_code: kind === "company" ? taxCode || null : null,
          p_billing_email: kind === "company" ? billingEmail || null : null,
          p_pickup: String(form.get("pickup") || "").trim(),
          p_dropoff: String(form.get("dropoff") || "").trim(),
          p_service_label: String(form.get("serviceLabel") || "").trim(),
          p_sales_owner: salesOwner,
          p_source: source,
          p_start_at: nextStartAt,
          p_end_at: nextEndAt,
          p_amount_due: amountDue,
          p_driver_cost: driverCost,
          p_vehicle_cost: vehicleCost,
          p_other_cost: otherCost,
          p_quote_note: String(form.get("quoteNote") || "").trim() || null,
          p_priority: String(form.get("priority") || "normal"),
          p_sales_note: String(form.get("salesNote") || "").trim() || null,
          p_active_assignment_id: activeAssignment?.id ?? null,
          p_replacement_reason: reason
        }
      }
    );
  }

  function cancelOrder(event: FormEvent<HTMLFormElement>) {
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

    runCommand(
      "order.cancel",
      (current) => cancelOrderCommand(current, selectedOrder.id, reason, roleLabels[currentRole], audit, false),
      `Đã hủy lệnh ${selectedOrder.code}.`,
      {
        name: "cancel_dispatch_order",
        args: {
          p_order_id: selectedOrder.id,
          p_reason: reason
        }
      }
    );
    event.currentTarget.reset();
  }

  function updateActualCosts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!can(currentRole, "record_payment") && !can(currentRole, "update_dispatch_status")) {
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
    runCommand(
      "finance.update_actual_costs",
      (current) => updateActualCostsCommand(current, selectedOrder.id, { actualDriverCost, actualVehicleCost, actualOtherCost, actualCostNote: String(form.get("actualCostNote") || "").trim() || undefined }, audit, false),
      `Đã cập nhật chi phí thực tế cho ${selectedOrder.code}.`,
      {
        name: "update_actual_costs",
        args: {
          p_order_id: selectedOrder.id,
          p_actual_driver_cost: actualDriverCost,
          p_actual_vehicle_cost: actualVehicleCost,
          p_actual_other_cost: actualOtherCost,
          p_actual_cost_note: String(form.get("actualCostNote") || "").trim() || null
        }
      }
    );
  }

  function recordPayment(event: FormEvent<HTMLFormElement>) {
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
    const payment: Payment = {
      id: makeId("pay"),
      orderId: selectedOrder.id,
      amount,
      status: "valid",
      paidAt: new Date().toISOString(),
      method: String(form.get("method")) as Payment["method"],
      reference: String(form.get("reference") || "").trim() || undefined
    };
    const nextPayments = [payment, ...state.payments];
    const orderPayments = nextPayments.filter((item) => item.orderId === selectedOrder.id);
    const paymentStatus = calculatePaymentStatus(selectedOrder.amountDue, orderPayments);

    runCommand(
      "finance.record_payment",
      (current) => recordPaymentCommand(current, payment, selectedOrder.id, paymentStatus, audit, false),
      `Đã ghi nhận ${money(amount)} cho ${selectedOrder.code}.`,
      {
        name: "record_payment",
        args: {
          p_payment_id: payment.id,
          p_order_id: selectedOrder.id,
          p_amount: amount,
          p_method: payment.method,
          p_reference: payment.reference ?? null,
          p_paid_at: payment.paidAt,
          p_payment_status: paymentStatus
        }
      }
    );
    event.currentTarget.reset();
  }

  function updateInvoiceStatus(nextStatus: InvoiceStatus) {
    if (!selectedOrder) return;
    if (!can(currentRole, "update_invoice")) {
      setMessage(`${roleLabels[currentRole]} không có quyền cập nhật hóa đơn.`);
      return;
    }
    runCommand(
      "finance.update_invoice",
      (current) => updateInvoiceStatusCommand(current, selectedOrder.id, nextStatus, audit, false),
      `Đã cập nhật hóa đơn ${selectedOrder.code}: ${invoiceLabels[nextStatus]}.`,
      {
        name: "update_invoice_status",
        args: {
          p_order_id: selectedOrder.id,
          p_invoice_status: nextStatus
        }
      }
    );
  }

  function reconcileOrder() {
    if (!selectedOrder) return;
    if (!can(currentRole, "close_order")) {
      setMessage(`${roleLabels[currentRole]} không có quyền đóng lệnh.`);
      return;
    }
    if (selectedOrder.dispatchStatus !== "completed") {
      setMessage("Chỉ đối soát/đóng lệnh sau khi chuyến hoàn thành.");
      return;
    }
    if (selectedOrder.paymentStatus !== "paid") {
      setMessage("Lệnh còn công nợ. Cần thanh toán đủ hoặc thêm luồng close_with_debt có duyệt.");
      return;
    }
    runCommand(
      "finance.close_order",
      (current) => closeOrder(current, selectedOrder.id, audit, false),
      `Đã đối soát và đóng ${selectedOrder.code}.`,
      {
        name: "close_dispatch_order",
        args: {
          p_order_id: selectedOrder.id
        }
      }
    );
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

  function resetPilot() {
    setState(initialState);
    setSelectedOrderId(seedOrders[2]?.id ?? seedOrders[0]?.id);
    setMessage(repository.mode === "supabase" ? "Đã reset dữ liệu Supabase về seed ban đầu." : "Đã reset dữ liệu pilot về seed ban đầu.");
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
              onClick={() => setTab(item)}
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
              <div className="relative">
                <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700" type="button"><Bell size={16} /> {visibleNotifications.length}</button>
                {visibleNotifications.length > 0 && (
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
              <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={resetPilot} type="button">
                <RefreshCw size={16} /> Reset
              </button>
            </div>
          </div>
          <p className="mt-3 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{message}</p>
        </header>
        <div className="border-b border-line bg-white px-3 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleTabs.map((item) => (
              <button
                className={`shrink-0 rounded-full border px-3 py-2 text-sm font-medium ${activeTab === item ? "border-teal-600 bg-teal-50 text-brand" : "border-line bg-white text-slate-600"}`}
                key={item}
                onClick={() => setTab(item)}
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
              notifications={visibleNotifications}
              orders={state.orders}
              reviewDispatchProposal={reviewDispatchProposal}
              vehicles={state.vehicles}
              calendarDay={calendarDay}
              setCalendarMonth={setCalendarMonth}
              setCalendarDay={setCalendarDay}
              setSelectedOrderId={setSelectedOrderId}
              setTab={setTab}
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
              selectedOrderId={selectedOrder?.id}
              selectedOrder={selectedOrder}
              setCustomerKind={setCustomerKind}
              setQuery={setQuery}
              setSelectedOrderId={setSelectedOrderId}
              vehicles={state.vehicles}
              createOrder={createOrder}
              cancelOrder={cancelOrder}
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
            />
          )}
          {activeTab === "Tài xế mobile" && (
            <DriverMobilePanel
              currentRole={currentRole}
              drivers={state.drivers}
              mobileDriverId={mobileDriverId}
              orders={state.orders}
              selectedOrderId={selectedOrder?.id}
              authDriverId={authDriverId}
              setMobileDriverId={setMobileDriverId}
              setSelectedOrderId={setSelectedOrderId}
              updateOrderDispatchStatus={updateOrderDispatchStatus}
              vehicles={state.vehicles}
            />
          )}
          {activeTab === "Users" && <AdminUsersPanel currentRole={currentRole} />}
          {activeTab === "Master data" && <MasterDataPanel createDriver={createDriver} createVehicle={createVehicle} currentRole={currentRole} drivers={state.drivers} vehicles={state.vehicles} />}
          {activeTab === "Tài chính" && selectedOrder && (
            <FinancePanel
              currentRole={currentRole}
              payments={state.payments.filter((payment) => payment.orderId === selectedOrder.id)}
              selectedOrder={selectedOrder}
              recordPayment={recordPayment}
              updateActualCosts={updateActualCosts}
              updateInvoiceStatus={updateInvoiceStatus}
              reconcileOrder={reconcileOrder}
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
  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
  const driver = drivers.find((item) => item.id === order.driverId);
  const orderAudit = auditEvents.filter((event) => event.entityId === order.id || event.entityId === activeAssignment?.id).slice(0, 5);
  const cost = orderCost(order);
  const profit = orderProfit(order);
  const margin = orderMargin(order);

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
      <div className="mt-4 grid gap-4 text-sm lg:grid-cols-4">
        <div className="border border-line bg-panel p-3">
          <p className="font-medium text-ink">Hành trình</p>
          <p className="mt-2 text-slate-600">{formatDateTime(order.startAt)} - {formatDateTime(order.endAt)}</p>
          <p className="mt-1 text-slate-600">{order.pickup} → {order.dropoff}</p>
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
          <p className="mt-2 text-slate-600">MST: {order.taxCode || "-"}</p>
          <p className="mt-1 text-slate-600">Email HĐ: {order.billingEmail || "-"}</p>
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
      {updateOrder && cancelOrder && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
          <form className="border border-line bg-panel p-4" onSubmit={updateOrder}>
            <h3 className="font-semibold text-ink">Sửa lệnh</h3>
            <div className="mt-4 grid gap-4">
              <section className="border border-line bg-white p-3">
                <h4 className="font-semibold text-ink">Quản lý lệnh</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="Loại khách">
                    <select className={inputClass()} defaultValue={order.customerKind} name="customerKind">
                      <option value="individual">Cá nhân</option>
                      <option value="company">Doanh nghiệp</option>
                    </select>
                  </Field>
                  <Field label="Sale phụ trách"><input className={inputClass()} defaultValue={order.salesOwner} name="salesOwner" /></Field>
                  <Field label="Nguồn"><input className={inputClass()} defaultValue={order.source} name="source" /></Field>
                </div>
              </section>

              <section className="border border-line bg-white p-3">
                <h4 className="font-semibold text-ink">Thông tin khách hàng</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="Tên khách / người đi"><input className={inputClass()} defaultValue={order.customerName} name="customerName" required /></Field>
                  <Field label="Người liên hệ"><input className={inputClass()} defaultValue={order.contactName ?? ""} name="contactName" /></Field>
                  <Field label="SĐT"><input className={inputClass()} defaultValue={order.contactPhone} name="contactPhone" required /></Field>
                  <Field label="Tên công ty"><input className={inputClass()} defaultValue={order.companyName ?? ""} name="companyName" /></Field>
                  <Field label="MST"><input className={inputClass()} defaultValue={order.taxCode ?? ""} name="taxCode" /></Field>
                  <Field label="Email HĐ"><input className={inputClass()} defaultValue={order.billingEmail ?? ""} name="billingEmail" type="email" /></Field>
                </div>
              </section>

              <section className="border border-line bg-white p-3">
                <h4 className="font-semibold text-ink">Hành trình</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="Dịch vụ"><input className={inputClass()} defaultValue={order.serviceLabel} name="serviceLabel" required /></Field>
                  <Field label="Điểm đón"><input className={inputClass()} defaultValue={order.pickup} name="pickup" required /></Field>
                  <Field label="Điểm trả"><input className={inputClass()} defaultValue={order.dropoff} name="dropoff" required /></Field>
                  <Field label="Bắt đầu"><input className={inputClass()} defaultValue={toDateTimeInput(order.startAt)} name="startAt" required type="datetime-local" /></Field>
                  <Field label="Kết thúc"><input className={inputClass()} defaultValue={toDateTimeInput(order.endAt)} name="endAt" required type="datetime-local" /></Field>
                  <Field label="Ưu tiên"><select className={inputClass()} defaultValue={order.priority ?? "normal"} name="priority"><option value="normal">Thường</option><option value="high">Cao</option><option value="urgent">Gấp</option></select></Field>
                </div>
              </section>

              <section className="border border-line bg-white p-3">
                <h4 className="font-semibold text-ink">Báo giá</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <Field label="Giá bán"><input className={inputClass()} defaultValue={order.amountDue} min="0" name="amountDue" required type="number" /></Field>
                  <Field label="Chi phí tài xế"><input className={inputClass()} defaultValue={order.driverCost ?? 0} min="0" name="driverCost" type="number" /></Field>
                  <Field label="Chi phí xe"><input className={inputClass()} defaultValue={order.vehicleCost ?? 0} min="0" name="vehicleCost" type="number" /></Field>
                  <Field label="Phụ phí"><input className={inputClass()} defaultValue={order.otherCost ?? 0} min="0" name="otherCost" type="number" /></Field>
                  <div className="md:col-span-3">
                    <Field label="Ghi chú báo giá"><textarea className={textAreaClass()} defaultValue={order.quoteNote ?? ""} name="quoteNote" /></Field>
                  </div>
                  <div className="md:col-span-3">
                    <Field label="Ghi chú cho điều hành"><textarea className={textAreaClass()} defaultValue={order.salesNote ?? ""} name="salesNote" /></Field>
                  </div>
                  <Field label="Lý do sửa"><input className={inputClass()} name="editReason" placeholder="Khách đổi giờ, đổi điểm đón..." /></Field>
                </div>
              </section>
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
  notifications,
  orders,
  reviewDispatchProposal,
  setCalendarDay,
  setCalendarMonth,
  setSelectedOrderId,
  setTab,
  vehicles
}: {
  alerts: DispatchOrder[];
  calendarDay: Date;
  calendarMonth: Date;
  drivers: Driver[];
  currentRole: AppRole;
  notifications: AppNotification[];
  orders: DispatchOrder[];
  reviewDispatchProposal: (orderId: string, decision: "approved" | "rejected", reason: string) => void;
  setCalendarDay: (date: Date) => void;
  setCalendarMonth: (date: Date) => void;
  setSelectedOrderId: (id: string) => void;
  setTab: (tab: Tab) => void;
  vehicles: Vehicle[];
}) {
  const pendingReviewOrders = orders.filter((order) => order.orderStatus === "pending_dispatch_review");
  return (
    <section className="space-y-4">
      <DispatchReviewQueue
        canReview={can(currentRole, "assign_vehicle")}
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
  payments,
  query,
  selectedOrderId,
  selectedOrder,
  setCustomerKind,
  setQuery,
  setSelectedOrderId,
  createOrder,
  cancelOrder,
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
  payments: Payment[];
  query: string;
  selectedOrderId?: string;
  selectedOrder?: DispatchOrder;
  setCustomerKind: (kind: DispatchOrder["customerKind"]) => void;
  setQuery: (query: string) => void;
  setSelectedOrderId: (id: string) => void;
  createOrder: (event: FormEvent<HTMLFormElement>) => void;
  cancelOrder: (event: FormEvent<HTMLFormElement>) => void;
  updateOrder: (event: FormEvent<HTMLFormElement>) => void;
  updateQuoteStatus: (nextStatus: QuoteStatus) => void;
  vehicles: Vehicle[];
}) {
  const canCreateOrder = can(currentRole, "create_order");
  const quoteStats = filteredOrders.reduce(
    (acc, order) => {
      const status = order.quoteStatus ?? "draft";
      acc[status] += 1;
      return acc;
    },
    { approved: 0, draft: 0, expired: 0, rejected: 0, sent: 0 } satisfies Record<QuoteStatus, number>
  );
  const lowMarginCount = filteredOrders.filter((order) => orderMargin(order) < 0.15).length;

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
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr_0.9fr]">
          <div className="space-y-3 border border-line bg-panel p-3">
            <p className="text-sm font-semibold text-ink">Khách hàng</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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
                </>
              )}
              <Field label={customerKind === "company" ? "SĐT contact mới" : "SĐT khách mới"}><input className={inputClass()} name="contactPhone" /></Field>
              <Field label="Sale"><select className={inputClass()} name="salesOwner"><option>Sale A</option><option>Sale B</option><option>Sale C</option></select></Field>
              <Field label="Nguồn"><select className={inputClass()} name="source"><option>Manual</option><option>Website</option><option>Google Ads</option><option>Referral</option><option>Old customer</option></select></Field>
            </div>
          </div>

          <div className="space-y-3 border border-line bg-panel p-3">
            <p className="text-sm font-semibold text-ink">Hành trình</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Dịch vụ"><input className={inputClass()} defaultValue="Private transfer" name="serviceLabel" required /></Field>
              <Field label="Hóa đơn"><select className={inputClass()} name="invoiceRequired"><option value="no">Không yêu cầu</option><option value="yes">Có yêu cầu</option></select></Field>
              <Field label="Ưu tiên"><select className={inputClass()} name="priority"><option value="normal">Thường</option><option value="high">Cao</option><option value="urgent">Gấp</option></select></Field>
              <Field label="Điểm đón"><input className={inputClass()} name="pickup" required /></Field>
              <Field label="Điểm trả"><input className={inputClass()} name="dropoff" required /></Field>
              <Field label="Bắt đầu"><input className={inputClass()} defaultValue={defaultOrderTimes.startAt} name="startAt" required type="datetime-local" /></Field>
              <Field label="Kết thúc"><input className={inputClass()} defaultValue={defaultOrderTimes.endAt} name="endAt" required type="datetime-local" /></Field>
            </div>
          </div>

          <div className="space-y-3 border border-line bg-panel p-3">
            <p className="text-sm font-semibold text-ink">Báo giá & chi phí</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Giá bán"><input className={inputClass()} defaultValue="1200000" min="0" name="amountDue" required type="number" /></Field>
              <Field label="Chi phí tài xế"><input className={inputClass()} defaultValue="350000" min="0" name="driverCost" type="number" /></Field>
              <Field label="Chi phí xe"><input className={inputClass()} defaultValue="350000" min="0" name="vehicleCost" type="number" /></Field>
              <Field label="Phụ phí"><input className={inputClass()} defaultValue="0" min="0" name="otherCost" type="number" /></Field>
            </div>
            <Field label="Ghi chú báo giá"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} name="quoteNote" placeholder="Bao gồm/chưa gồm phí cầu đường, giờ chờ, VAT..." /></Field>
            <Field label="Ghi chú cho điều hành"><textarea className={`${inputClass()} min-h-20 resize-none py-2`} name="salesNote" placeholder="Yêu cầu loại xe, khách VIP, cần xác nhận sớm..." /></Field>
            <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canCreateOrder} type="submit">
              <Save size={16} /> Tạo lệnh
            </button>
          </div>
        </div>
      </form>

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
                <p className="text-slate-600">{order.pickup} → {order.dropoff}</p>
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
  vehicles
}: {
  assignments: Assignment[];
  auditEvents: AuditEvent[];
  calendarDay: Date;
  calendarMonth: Date;
  currentRole: AppRole;
  drivers: Driver[];
  orders: DispatchOrder[];
  payments: Payment[];
  selectedOrder: DispatchOrder;
  assignOrder: (event: FormEvent<HTMLFormElement>) => void;
  cancelOrder: (event: FormEvent<HTMLFormElement>) => void;
  reviewDispatchProposal: (orderId: string, decision: "approved" | "rejected", reason: string) => void;
  setCalendarDay: (date: Date) => void;
  setCalendarMonth: (date: Date) => void;
  setSelectedOrderId: (id: string) => void;
  updateDispatchStatus: (nextStatus: DispatchStatus, reason: string) => void;
  updateOrder: (event: FormEvent<HTMLFormElement>) => void;
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

  return (
    <section className="space-y-4">
      <DispatchReviewQueue
        canReview={canAssignVehicle}
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
            <p className="text-slate-600">{selectedOrder.pickup} → {selectedOrder.dropoff}</p>
            <p className="text-slate-600">{formatDateTime(selectedOrder.startAt)} - {formatDateTime(selectedOrder.endAt)}</p>
            <div className="flex flex-wrap gap-2">
              <Badge tone={orderStatusTone(selectedOrder.orderStatus)}>{orderStatusLabels[selectedOrder.orderStatus]}</Badge>
              <Badge tone={statusTone(selectedOrder)}>{dispatchLabels[selectedOrder.dispatchStatus]}</Badge>
              <Badge tone={selectedOrder.paymentStatus === "paid" ? "good" : "warn"}>{paymentLabels[selectedOrder.paymentStatus]}</Badge>
              <Badge tone="info">{money(selectedOrder.amountDue)}</Badge>
            </div>
            <div className="border border-line bg-panel p-3">
              <p className="font-medium">Assignment hiện tại</p>
              <p className="mt-1 text-slate-600">{vehicle ? `${vehicle.plateNo} / ${vehicle.type}` : "Chưa có xe"}</p>
              <p className="text-slate-600">{driver ? `${driver.fullName} / ${driver.phone}` : "Chưa có tài xế"}</p>
              {activeAssignment && <p className="mt-1 text-xs text-slate-500">Assignment ID: {activeAssignment.id}</p>}
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canMarkDriverAccepted} onClick={() => updateDispatchStatus("driver_accepted", "Driver confirmed by dispatcher")} type="button">Tài xế nhận</button>
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canMarkInProgress} onClick={() => updateDispatchStatus("in_progress", "Trip started")} type="button">Bắt đầu chạy</button>
            <button className="h-10 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canMarkCompleted} onClick={() => updateDispatchStatus("completed", "Trip completed")} type="button">Hoàn thành</button>
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
            <Field label="Xe">
              <select className={inputClass()} defaultValue={selectedOrder.vehicleId} name="vehicleId" required>
                {vehicles.map((item) => <option disabled={item.status !== "active"} key={item.id} value={item.id}>{item.plateNo} / {item.type} / {item.status}</option>)}
              </select>
            </Field>
            <Field label="Tài xế">
              <select className={inputClass()} defaultValue={selectedOrder.driverId} name="driverId" required>
                {drivers.map((item) => <option disabled={item.status !== "active"} key={item.id} value={item.id}>{item.fullName} / {item.status}</option>)}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Lý do khi đổi/ghi chú phân công"><textarea className={textAreaClass()} name="reason" placeholder="Ví dụ: xe cũ bận, khách đổi giờ, ưu tiên tài xế quen tuyến..." /></Field>
            </div>
          </div>
          <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canAssignSelectedOrder} type="submit">
            <Save size={16} /> Lưu phân công
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
      <div className="hidden space-y-4 lg:block">
        <VehicleCalendar monthDate={calendarMonth} orders={orders} selectedOrderId={selectedOrder.id} setCalendarDay={setCalendarDay} setMonthDate={setCalendarMonth} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
        <DayTimeline day={calendarDay} drivers={drivers} orders={orders} selectedOrderId={selectedOrder.id} setDay={setCalendarDay} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
        <VehicleResourceTimeline day={calendarDay} drivers={drivers} orders={orders} selectedOrderId={selectedOrder.id} setDay={setCalendarDay} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
        <DispatchBoard assignments={assignments} drivers={drivers} orders={orders} selectedOrderId={selectedOrder.id} setSelectedOrderId={setSelectedOrderId} vehicles={vehicles} />
        <OrderDetailPanel assignments={assignments} auditEvents={auditEvents} drivers={drivers} order={selectedOrder} payments={payments} cancelOrder={cancelOrder} updateOrder={updateOrder} vehicles={vehicles} />
      </div>
    </section>
  );
}

function DispatchReviewQueue({
  canReview,
  onReviewed,
  orders,
  reviewDispatchProposal,
  selectedOrderId,
  setSelectedOrderId
}: {
  canReview: boolean;
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
              <p className="mt-1 text-sm text-slate-600">{formatDateTime(order.startAt)} - {order.pickup} → {order.dropoff}</p>
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
                  disabled={!canReview}
                  onClick={() => {
                    reviewDispatchProposal(order.id, "approved", rejectReasons[order.id] ?? "");
                    onReviewed?.(order.id, "approved");
                  }}
                  type="button"
                >
                  Duyệt
                </button>
                <button
                  className="h-10 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  disabled={!canReview}
                  onClick={() => {
                    reviewDispatchProposal(order.id, "rejected", rejectReasons[order.id] ?? "");
                    onReviewed?.(order.id, "rejected");
                  }}
                  type="button"
                >
                  Từ chối
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

function DriverMobilePanel({
  authDriverId,
  currentRole,
  drivers,
  mobileDriverId,
  orders,
  selectedOrderId,
  setMobileDriverId,
  setSelectedOrderId,
  updateOrderDispatchStatus,
  vehicles
}: {
  authDriverId?: string;
  currentRole: AppRole;
  drivers: Driver[];
  mobileDriverId: string;
  orders: DispatchOrder[];
  selectedOrderId?: string;
  setMobileDriverId: (id: string) => void;
  setSelectedOrderId: (id: string) => void;
  updateOrderDispatchStatus: (orderId: string, nextStatus: DispatchStatus, reason: string, actor?: string) => void;
  vehicles: Vehicle[];
}) {
  const lockedDriverId = currentRole === "driver" ? authDriverId : undefined;
  const selectedDriver = drivers.find((driver) => driver.id === (lockedDriverId ?? mobileDriverId)) ?? drivers[0];
  const todayKey = vietnamDateKey();
  const driverOrders = orders
    .filter((order) => order.driverId === selectedDriver?.id && order.dispatchStatus !== "cancelled")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const todayDriverOrders = driverOrders.filter((order) => orderDateKey(order) === todayKey);
  const activeOrder = driverOrders.find((order) => order.dispatchStatus === "in_progress") ?? driverOrders.find((order) => order.dispatchStatus === "driver_accepted");
  const nextOrder = driverOrders.find((order) => !["completed", "cancelled", "in_progress", "driver_accepted"].includes(order.dispatchStatus));
  const completedCount = driverOrders.filter((order) => order.dispatchStatus === "completed").length;
  const awaitingCount = driverOrders.filter((order) => ["assigned", "waiting_assignment"].includes(order.dispatchStatus)).length;
  const canUpdate = can(currentRole, "update_dispatch_status");
  const selectedTrip = driverOrders.find((order) => order.id === selectedOrderId) ?? activeOrder ?? nextOrder ?? driverOrders[0];
  const nextDriverStatus = selectedTrip ? driverNextDispatchStatus(selectedTrip) : null;
  const activeTrips = driverOrders.filter((order) => ["driver_accepted", "in_progress"].includes(order.dispatchStatus));
  const upcomingTrips = driverOrders.filter((order) => ["assigned", "waiting_assignment"].includes(order.dispatchStatus));
  const finishedTrips = driverOrders.filter((order) => order.dispatchStatus === "completed");

  return (
    <section className="mx-auto max-w-[520px] space-y-4">
      <div className="border border-line bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-md bg-teal-50 text-brand">
              <Smartphone size={20} />
            </span>
            <div>
              <p className="text-sm text-slate-500">Màn tài xế</p>
              <h3 className="text-lg font-semibold text-ink">{selectedDriver?.fullName ?? "Chưa chọn tài xế"}</h3>
            </div>
          </div>
          <Badge tone={canUpdate ? "good" : "warn"}>{roleLabels[currentRole]}</Badge>
        </div>
        <div className="mt-4">
          <Field label="Tài xế">
            <select className={inputClass()} disabled={Boolean(lockedDriverId)} onChange={(event) => setMobileDriverId(event.target.value)} value={selectedDriver?.id ?? ""}>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.fullName} / {driver.phone}</option>
              ))}
            </select>
          </Field>
          {lockedDriverId && <p className="mt-2 text-xs text-slate-500">Tài khoản driver chỉ xem chuyến của hồ sơ đã gắn.</p>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatMini label="Hôm nay" value={String(todayDriverOrders.length)} />
          <StatMini label="Đang chạy" value={String(activeTrips.length)} />
          <StatMini label="Chờ nhận" value={String(awaitingCount)} />
        </div>
        {selectedTrip ? <div className="mt-4"><StaticPinMap compact order={selectedTrip} /></div> : null}
        {selectedTrip && (
          <div className="mt-4 rounded-md border border-line bg-panel p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{selectedTrip.code}</p>
                <p className="text-xs text-slate-500">{driverActionDetail(selectedTrip)}</p>
              </div>
              <Badge tone={statusTone(selectedTrip)}>{dispatchLabels[selectedTrip.dispatchStatus]}</Badge>
            </div>
            <button
              className="mt-3 h-10 w-full rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canUpdate || !nextDriverStatus}
              onClick={() => {
                if (!nextDriverStatus) return;
                updateOrderDispatchStatus(selectedTrip.id, nextDriverStatus, driverActionLabel(selectedTrip), "Driver");
              }}
              type="button"
            >
              {nextDriverStatus ? driverActionLabel(selectedTrip) : "Không còn thao tác"}
            </button>
          </div>
        )}
      </div>

      {activeOrder && (
        <section className="border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Hành động tiếp theo</p>
              <h3 className="font-semibold text-ink">{driverActionLabel(activeOrder)}</h3>
            </div>
            <Badge tone={statusTone(activeOrder)}>{dispatchLabels[activeOrder.dispatchStatus]}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600">{activeOrder.code} / {driverActionDetail(activeOrder)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`tel:${activeOrder.contactPhone}`}>
              <PhoneCall size={16} /> Gọi khách
            </a>
            <a className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(activeOrder.pickup)}&destination=${encodeURIComponent(activeOrder.dropoff)}&travelmode=driving`} rel="noreferrer" target="_blank">
              <Route size={16} /> Mở tuyến
            </a>
          </div>
        </section>
      )}

      <div className="space-y-3">
        {driverOrders.length === 0 && (
          <div className="border border-line bg-white p-4 text-sm text-slate-500 shadow-sm">Chưa có chuyến được phân cho tài xế này.</div>
        )}
        {upcomingTrips.length > 0 && (
          <section className="border border-line bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-ink">Sắp tới</h4>
            <div className="mt-3 space-y-3">
              {upcomingTrips.map((order) => {
                const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                return (
                  <button className="w-full rounded-md border border-line bg-panel p-3 text-left" key={order.id} onClick={() => setSelectedOrderId(order.id)} type="button">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">{order.code}</p>
                        <p className="mt-1 font-semibold text-ink">{timeOnly(order.startAt)} - {order.serviceLabel}</p>
                      </div>
                      <Badge tone={statusTone(order)}>{dispatchLabels[order.dispatchStatus]}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{order.pickup} → {order.dropoff}</p>
                    <p className="mt-1 text-xs text-slate-500">{vehicle?.plateNo ?? "Chưa xe"} / {timeOnly(order.startAt)} - {timeOnly(order.endAt)}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {activeTrips.length > 0 && (
          <section className="border border-line bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-ink">Đang chạy / đã nhận</h4>
            <div className="mt-3 space-y-3">
              {activeTrips.map((order) => {
                const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                return (
                  <button className="w-full rounded-md border border-brand bg-teal-50 p-3 text-left" key={order.id} onClick={() => setSelectedOrderId(order.id)} type="button">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">{order.code}</p>
                        <p className="mt-1 font-semibold text-ink">{driverActionLabel(order)}</p>
                      </div>
                      <Badge tone="good">{dispatchLabels[order.dispatchStatus]}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{order.contactName || order.customerName} / {order.contactPhone}</p>
                    <p className="mt-1 text-sm text-slate-600">{order.pickup} → {order.dropoff}</p>
                    <p className="mt-1 text-xs text-slate-500">{vehicle?.plateNo ?? "Chưa xe"} / {timeOnly(order.startAt)} - {timeOnly(order.endAt)}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {finishedTrips.length > 0 && (
          <section className="border border-line bg-white p-4 shadow-sm">
            <h4 className="font-semibold text-ink">Đã hoàn thành</h4>
            <div className="mt-3 space-y-2">
              {finishedTrips.slice(0, 3).map((order) => (
                <button className="w-full rounded-md border border-line bg-white p-3 text-left" key={order.id} onClick={() => setSelectedOrderId(order.id)} type="button">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{order.code}</p>
                    <Badge tone="good">Hoàn thành</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{order.pickup} → {order.dropoff}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
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
            <Field label="Loại xe"><input className={inputClass()} defaultValue="Sedan" name="type" required /></Field>
            <Field label="Số chỗ"><input className={inputClass()} defaultValue="4" min="1" name="seats" required type="number" /></Field>
            <Field label="Trạng thái">
              <select className={inputClass()} name="status">
                <option value="active">active</option>
                <option value="maintenance">maintenance</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
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
            {vehicles.map((vehicle) => (
              <div className="grid grid-cols-[1fr_90px_100px] gap-3 px-4 py-3 text-sm" key={vehicle.id}>
                <div>
                  <p className="font-semibold text-ink">{vehicle.plateNo}</p>
                  <p className="text-xs text-slate-500">{vehicle.type} / {vehicle.seats} chỗ</p>
                </div>
                <p className="text-slate-600">{vehicle.seats} chỗ</p>
                <Badge tone={vehicle.status === "active" ? "good" : "warn"}>{vehicle.status}</Badge>
              </div>
            ))}
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
                  <p className="text-xs text-slate-500">{driver.phone}</p>
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
  currentRole,
  payments,
  selectedOrder,
  recordPayment,
  updateActualCosts,
  updateInvoiceStatus,
  reconcileOrder
}: {
  currentRole: AppRole;
  payments: Payment[];
  selectedOrder: DispatchOrder;
  recordPayment: (event: FormEvent<HTMLFormElement>) => void;
  updateActualCosts: (event: FormEvent<HTMLFormElement>) => void;
  updateInvoiceStatus: (nextStatus: InvoiceStatus) => void;
  reconcileOrder: () => void;
}) {
  const paid = payments.filter((payment) => payment.status === "valid").reduce((sum, payment) => sum + payment.amount, 0);
  const debt = Math.max(selectedOrder.amountDue - paid, 0);
  const canRecordPayment = can(currentRole, "record_payment");
  const canUpdateInvoice = can(currentRole, "update_invoice");
  const canCloseOrder = can(currentRole, "close_order");
  const canUpdateActualCosts = can(currentRole, "record_payment") || can(currentRole, "update_dispatch_status");

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="border border-line bg-white p-4 shadow-sm xl:hidden">
        <div className="flex items-center gap-2">
          <Banknote className="text-brand" size={20} />
          <h3 className="font-semibold text-ink">{selectedOrder.code}</h3>
        </div>
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          <p className="font-medium text-ink">{selectedOrder.customerName}</p>
          <p>{selectedOrder.pickup} → {selectedOrder.dropoff}</p>
          <p>{formatDateTime(selectedOrder.startAt)} - {formatDateTime(selectedOrder.endAt)}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatMini label="Phải thu" value={money(selectedOrder.amountDue)} />
          <StatMini label="Còn nợ" value={money(debt)} />
        </div>
      </section>
      <form className="border border-line bg-white p-4 shadow-sm" onSubmit={recordPayment}>
        <div className="flex items-center gap-2">
          <ReceiptText className="text-brand" size={20} />
          <h3 className="font-semibold text-ink">Ghi nhận thanh toán</h3>
        </div>
        <div className="mt-4 grid gap-3">
          <Field label="Lệnh"><input className={inputClass()} readOnly value={`${selectedOrder.code} / ${selectedOrder.customerName}`} /></Field>
          <Field label="Số tiền"><input className={inputClass()} defaultValue={debt || selectedOrder.amountDue} min="1" name="amount" required type="number" /></Field>
          <Field label="Phương thức"><select className={inputClass()} name="method"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="card">Thẻ</option><option value="other">Khác</option></select></Field>
          <Field label="Mã tham chiếu"><input className={inputClass()} name="reference" placeholder="Mã GD ngân hàng nếu có" /></Field>
        </div>
        <button className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canRecordPayment} type="submit">
          <Banknote size={16} /> Ghi payment
        </button>
      </form>
      <div className="space-y-4">
        <section className="border border-line bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-ink">Công nợ & hóa đơn</h3>
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
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canUpdateInvoice} onClick={() => updateInvoiceStatus("ready_to_issue")} type="button">Sẵn sàng HĐ</button>
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" disabled={!canUpdateInvoice} onClick={() => updateInvoiceStatus("issued")} type="button">Đã xuất HĐ</button>
            <button className="h-10 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canCloseOrder} onClick={reconcileOrder} type="button">Đóng lệnh</button>
          </div>
        </section>
        <form className="border border-line bg-white p-4 shadow-sm" onSubmit={updateActualCosts}>
          <h3 className="font-semibold text-ink">Chi phí thực tế sau chuyến</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="Tài xế thực tế"><input className={inputClass()} defaultValue={selectedOrder.actualDriverCost ?? selectedOrder.driverCost ?? 0} min="0" name="actualDriverCost" type="number" /></Field>
            <Field label="Xe/nhiên liệu thực tế"><input className={inputClass()} defaultValue={selectedOrder.actualVehicleCost ?? selectedOrder.vehicleCost ?? 0} min="0" name="actualVehicleCost" type="number" /></Field>
            <Field label="Phụ phí thực tế"><input className={inputClass()} defaultValue={selectedOrder.actualOtherCost ?? selectedOrder.otherCost ?? 0} min="0" name="actualOtherCost" type="number" /></Field>
            <div className="md:col-span-3">
              <Field label="Ghi chú chi phí"><textarea className={textAreaClass()} defaultValue={selectedOrder.actualCostNote ?? ""} name="actualCostNote" placeholder="Cầu đường, gửi xe, phát sinh, tài xế ứng..." /></Field>
            </div>
          </div>
          <button className="mt-4 h-10 w-full rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!canUpdateActualCosts} type="submit">Lưu chi phí thực tế</button>
        </form>
        <section className="border border-line bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-ink">Payment list</h3>
          <div className="mt-3 space-y-2 text-sm">
            {payments.length === 0 && <p className="text-slate-500">Chưa có thanh toán.</p>}
            {payments.map((payment) => (
              <div className="flex items-center justify-between border border-line bg-panel p-3" key={payment.id}>
                <div>
                  <p className="font-medium">{money(payment.amount)}</p>
                  <p className="text-xs text-slate-500">{payment.method} / {payment.reference || "không mã GD"}</p>
                </div>
                <Badge tone="good">{payment.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
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
