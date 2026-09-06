"use client";

import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "good" | "warn" | "danger" | "info";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  const toneClass = {
    neutral: "border-slate-200 bg-white text-slate-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-cyan-200 bg-cyan-50 text-cyan-800"
  }[tone];

  return <span className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium ${toneClass}`}>{children}</span>;
}

export function readableAuthName(label: string, fallback: string) {
  const trimmed = label.trim();
  if (!trimmed || trimmed.startsWith("Đang ") || trimmed.startsWith("Chưa ") || trimmed.startsWith("Auth ") || trimmed === "Local demo") return fallback;
  return trimmed;
}

export function greetingName(label: string, fallback: string) {
  return `Mr./Mrs. ${readableAuthName(label, fallback)}`;
}

export function RoleAccountControls({
  authLabel,
  compact = false,
  onSignOut,
  roleLabel
}: {
  authLabel: string;
  compact?: boolean;
  onSignOut: () => void;
  roleLabel: string;
}) {
  const name = readableAuthName(authLabel, "Người dùng");
  const displayName = greetingName(authLabel, "Người dùng");

  return (
    <div className={`flex min-w-0 items-center gap-2 ${compact ? "" : "max-w-full rounded-2xl border border-line bg-white px-3 py-2 shadow-sm"}`}>
      {!compact && (
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-extrabold text-brand">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      {!compact && (
        <div className="min-w-0 max-w-[220px] xl:max-w-[280px]">
          <p className="truncate text-sm font-extrabold text-ink" title={displayName}>{displayName}</p>
          <p className="truncate text-xs font-semibold text-slate-500">{roleLabel}</p>
        </div>
      )}
      <Link className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50" href="/auth" title="Đăng nhập / đổi tài khoản">
        Đăng nhập
      </Link>
      <button
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100"
        onClick={onSignOut}
        title="Đăng xuất"
        type="button"
      >
        <LogOut size={15} /> Đăng xuất
      </button>
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, detail }: { label: string; value: string; icon: LucideIcon; detail: string }) {
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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function SectionDetails({
  badge,
  children,
  defaultOpen = true,
  description,
  title
}: {
  badge?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  description?: string;
  title: string;
}) {
  return (
    <details className="rounded-lg border border-line bg-white p-3 shadow-sm" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{title}</p>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        {badge && <Badge tone="info">{badge}</Badge>}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
