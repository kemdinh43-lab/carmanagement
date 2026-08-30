"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, MapPin, PhoneCall, Route } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { DispatchStatus } from "@/lib/types";

type ExternalTrip = {
  id: string;
  code: string;
  customer_name: string;
  contact_phone: string;
  pickup: string;
  dropoff: string;
  service_label: string;
  start_at: string;
  end_at: string;
  dispatch_status: DispatchStatus;
  external_driver_name?: string | null;
  external_driver_phone?: string | null;
  external_vehicle_plate?: string | null;
  external_vehicle_type?: string | null;
  trip_access_expires_at: string;
};

const statusLabels: Record<DispatchStatus, string> = {
  waiting_assignment: "Chờ phân xe",
  assigned: "Đã giao chuyến",
  driver_accepted: "Đã nhận chuyến",
  in_progress: "Đang chạy",
  completed: "Hoàn thành",
  cancelled: "Đã hủy"
};

const nextStatus: Partial<Record<DispatchStatus, DispatchStatus>> = {
  assigned: "driver_accepted",
  driver_accepted: "in_progress",
  in_progress: "completed"
};

const nextActionLabel: Partial<Record<DispatchStatus, string>> = {
  assigned: "Nhận chuyến",
  driver_accepted: "Bắt đầu chạy",
  in_progress: "Hoàn thành chuyến"
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  });
}

function inputTokenFromPath() {
  if (typeof window === "undefined") return "";
  return decodeURIComponent(window.location.pathname.split("/trip/")[1] ?? "");
}

async function fetchExternalTrip(token: string) {
  const { data, error } = await createSupabaseBrowserClient().rpc("get_external_trip_by_token" as never, { p_token: token } as never);
  if (error) throw new Error(error.message);
  const rows = data as ExternalTrip[] | null;
  return rows?.[0] ?? null;
}

export default function ExternalTripPage() {
  const [token] = useState(inputTokenFromPath);
  const [trip, setTrip] = useState<ExternalTrip | null>(null);
  const [message, setMessage] = useState("Đang tải chuyến...");
  const [pending, setPending] = useState(false);

  const routeUrl = useMemo(() => {
    if (!trip) return "";
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(trip.pickup)}&destination=${encodeURIComponent(trip.dropoff)}&travelmode=driving`;
  }, [trip]);

  useEffect(() => {
    let cancelled = false;
    void fetchExternalTrip(token)
      .then((result) => {
        if (cancelled) return;
        setTrip(result);
        setMessage(result ? "Trip Link sẵn sàng." : "Link chuyến không hợp lệ, đã hết hạn hoặc chuyến đã hoàn thành.");
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(`Không tải được chuyến: ${error instanceof Error ? error.message : "unknown error"}`);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function updateStatus() {
    if (!trip) return;
    const next = nextStatus[trip.dispatch_status];
    if (!next) return;
    setPending(true);
    setMessage(`${nextActionLabel[trip.dispatch_status]} đang được ghi nhận...`);
    const { error } = await createSupabaseBrowserClient().rpc("update_external_trip_status" as never, { p_token: token, p_next_status: next } as never);
    if (error) {
      setMessage(`Không cập nhật được chuyến: ${error.message}`);
      setPending(false);
      return;
    }
    const refreshed = await fetchExternalTrip(token);
    setTrip(refreshed);
    setMessage(refreshed ? "Đã cập nhật trạng thái chuyến." : "Chuyến đã hoàn thành hoặc link đã hết hạn.");
    setPending(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <section className="mx-auto max-w-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-teal-700">Angel One Travel</p>
            <h1 className="text-xl font-bold">Chuyến được giao</h1>
          </div>
          {trip && <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">{statusLabels[trip.dispatch_status]}</span>}
        </div>

        <p className="mt-4 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{message}</p>

        {trip && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">{trip.code}</p>
              <p className="mt-1 font-semibold">{trip.service_label}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-700"><Clock3 size={16} /> {formatDateTime(trip.start_at)} - {formatDateTime(trip.end_at)}</p>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="flex gap-2 text-sm"><MapPin className="mt-0.5 text-teal-700" size={16} /><span><strong>Đón:</strong> {trip.pickup}</span></p>
              <p className="mt-3 flex gap-2 text-sm"><Route className="mt-0.5 text-orange-600" size={16} /><span><strong>Trả:</strong> {trip.dropoff}</span></p>
            </div>

            <div className="rounded-md border border-slate-200 p-3 text-sm">
              <p><strong>Khách:</strong> {trip.customer_name}</p>
              <p><strong>SĐT:</strong> <a className="font-semibold text-teal-700 underline" href={`tel:${trip.contact_phone}`}>{trip.contact_phone}</a></p>
              <p><strong>Xe:</strong> {trip.external_vehicle_plate || "-"} / {trip.external_vehicle_type || "-"}</p>
              <p><strong>Tài xế:</strong> {trip.external_driver_name || "-"}</p>
            </div>

            <div className="grid gap-2">
              <a className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" href={`tel:${trip.contact_phone}`}>
                <PhoneCall size={17} /> Gọi khách
              </a>
              <a className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white" href={routeUrl} rel="noreferrer" target="_blank">
                <Route size={17} /> Mở Google Maps
              </a>
              {nextStatus[trip.dispatch_status] ? (
                <button className="h-11 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300" disabled={pending} onClick={updateStatus} type="button">
                  {pending ? "Đang cập nhật..." : nextActionLabel[trip.dispatch_status]}
                </button>
              ) : (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="mr-1 inline" size={16} /> Không còn thao tác
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
