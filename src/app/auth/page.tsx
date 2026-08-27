"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasSupabaseBrowserConfig } from "@/lib/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { roleLabels, type AppRole } from "@/lib/permissions";
import type { Driver } from "@/lib/types";

type AppUserProfile = {
  user_id: string;
  full_name: string;
  phone: string | null;
  role: AppRole;
  driver_id: string | null;
};

export default function AuthPage() {
  const router = useRouter();
  const [message, setMessage] = useState(hasSupabaseBrowserConfig() ? "Supabase auth ready." : "Thiếu NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<AppRole | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<AppUserProfile[]>([]);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  async function loadAuthContext(userId?: string) {
    if (!hasSupabaseBrowserConfig()) return;
    const supabase = createSupabaseBrowserClient();
    const { data: session } = await supabase.auth.getUser();
    const nextUserId = userId ?? session.user?.id ?? null;

    if (!nextUserId) {
      return { userId: null, role: null as AppRole | null, drivers: [] as Driver[], profiles: [] as AppUserProfile[] };
    }

    const { data: profile } = await supabase.from("app_user_profiles" as never).select("*" as never).eq("user_id" as never, nextUserId as never).maybeSingle();
    const typedProfile = profile as AppUserProfile | null;

    if (typedProfile?.role === "admin") {
      const [{ data: allProfiles }, { data: driverRows }] = await Promise.all([
        supabase.from("app_user_profiles" as never).select("*" as never).order("full_name" as never, { ascending: true } as never),
        supabase.from("app_drivers" as never).select("*" as never).order("full_name" as never, { ascending: true } as never)
      ]);
      const typedDrivers = ((driverRows as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
        id: String(row.id),
        fullName: String(row.full_name ?? ""),
        phone: String(row.phone ?? ""),
        status: String(row.status ?? "active") as Driver["status"]
      }));
      return { userId: nextUserId, role: typedProfile?.role ?? null, drivers: typedDrivers, profiles: (allProfiles as AppUserProfile[] | null) ?? [] };
    } else {
      return { userId: nextUserId, role: typedProfile?.role ?? null, drivers: [] as Driver[], profiles: typedProfile ? [typedProfile] : [] };
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await loadAuthContext();
      if (cancelled || !next) return;
      setCurrentUserId(next.userId);
      setCurrentRole(next.role);
      setDrivers(next.drivers);
      setProfiles(next.profiles);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Chưa có Supabase config trong .env.local.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const fullName = String(form.get("fullName") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const supabase = createSupabaseBrowserClient();
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (!error && data.user) {
      const { data: profile } = await supabase.from("app_user_profiles" as never).select("user_id" as never).eq("user_id" as never, data.user.id as never).maybeSingle();
      const shouldBootstrapAdmin = email.toLowerCase() === "mckaym1109@gmail.com";
      if (!profile) {
        await supabase.from("app_user_profiles" as never).upsert({
          user_id: data.user.id,
          full_name: fullName || data.user.email || "",
          phone: phone || null,
          role: shouldBootstrapAdmin ? "admin" : ("sale" as AppRole),
          driver_id: null
        } as never);
      } else if (shouldBootstrapAdmin) {
        await supabase
          .from("app_user_profiles" as never)
          .update({ role: "admin" as AppRole, driver_id: null } as never)
          .eq("user_id" as never, data.user.id as never);
      }
      const next = await loadAuthContext(data.user.id);
      setCurrentUserId(next?.userId ?? null);
      setCurrentRole(next?.role ?? null);
      setDrivers(next?.drivers ?? []);
      setProfiles(next?.profiles ?? []);
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "signin") {
      setMessage("Đăng nhập thành công, đang mở dashboard...");
      window.location.replace("/");
      return;
    }

    setMessage("Đã tạo tài khoản. Kiểm tra email nếu Supabase yêu cầu xác nhận.");
  }

  async function signOut() {
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Chưa có Supabase config trong .env.local.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    setCurrentUserId(null);
    setCurrentRole(null);
    setDrivers([]);
    setProfiles([]);
    setMessage(error ? error.message : "Đã đăng xuất.");
  }

  async function updateProfileAccess(userId: string, nextRole: AppRole, nextDriverId: string | null) {
    if (currentRole !== "admin") {
      setMessage("Chỉ admin mới được phân quyền truy cập.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("app_user_profiles" as never)
      .update({ role: nextRole, driver_id: nextRole === "driver" ? nextDriverId : null } as never)
      .eq("user_id" as never, userId as never);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`Đã cập nhật quyền thành ${roleLabels[nextRole]}.`);
    const next = await loadAuthContext(currentUserId ?? undefined);
    setCurrentUserId(next?.userId ?? null);
    setCurrentRole(next?.role ?? null);
    setDrivers(next?.drivers ?? []);
    setProfiles(next?.profiles ?? []);
  }

  return (
    <main className="min-h-screen bg-panel p-6">
      <section className="mx-auto max-w-3xl border border-line bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Angel One Travel Auth</h1>
        <p className="mt-2 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{message}</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <form className="space-y-3" onSubmit={handleAuth}>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`h-10 rounded-md px-3 text-sm font-semibold ${mode === "signin" ? "bg-brand text-white" : "border border-line bg-white text-slate-700"}`}
                onClick={() => setMode("signin")}
                type="button"
              >
                Đăng nhập
              </button>
              <button
                className={`h-10 rounded-md px-3 text-sm font-semibold ${mode === "signup" ? "bg-brand text-white" : "border border-line bg-white text-slate-700"}`}
                onClick={() => setMode("signup")}
                type="button"
              >
                Đăng ký
              </button>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Email</span>
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="email" required type="email" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Password</span>
              <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" minLength={6} name="password" required type="password" />
            </label>
            {mode === "signup" && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Họ tên</span>
                  <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="fullName" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">SĐT</span>
                  <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="phone" />
                </label>
              </>
            )}
            <button className="h-10 w-full rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
              {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </form>

          <section className="border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Phân quyền truy cập</h2>
                <p className="text-sm text-slate-600">Chỉ tài khoản admin mới đổi role cho người khác.</p>
              </div>
              <span className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-slate-600">{currentRole ? roleLabels[currentRole] : "Chưa đăng nhập"}</span>
            </div>

            {currentRole === "admin" ? (
              <div className="mt-4 space-y-3">
                {profiles.map((profile) => (
                  <div key={profile.user_id} className="flex flex-col gap-3 rounded-md border border-line bg-white p-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{profile.full_name || profile.user_id}</p>
                      <p className="text-sm text-slate-500">{profile.phone || "Không có SĐT"}</p>
                      {profile.driver_id && <p className="text-xs text-slate-500">Driver ID: {profile.driver_id}</p>}
                    </div>
                    <div className="grid gap-2 md:min-w-48">
                      <select
                        className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
                        value={profile.role}
                        onChange={(event) => void updateProfileAccess(profile.user_id, event.target.value as AppRole, event.target.value === "driver" ? profile.driver_id : null)}
                      >
                        <option value="sale">Sale</option>
                        <option value="dispatcher">Điều hành</option>
                        <option value="driver">Tài xế</option>
                        <option value="accountant">Kế toán</option>
                        <option value="manager">Quản lý</option>
                        <option value="admin">Admin</option>
                      </select>
                      {profile.role === "driver" && (
                        <select
                          className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
                          value={profile.driver_id ?? ""}
                          onChange={(event) => void updateProfileAccess(profile.user_id, "driver", event.target.value || null)}
                        >
                          <option value="">Chọn hồ sơ tài xế</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>{driver.fullName} / {driver.phone}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
                {profiles.length === 0 && <p className="text-sm text-slate-500">Chưa có tài khoản nào để phân quyền.</p>}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Đăng nhập bằng tài khoản admin để xem và đổi role cho các user khác.</p>
            )}
          </section>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={signOut} type="button">Đăng xuất</button>
          <Link className="inline-flex h-10 items-center rounded-md border border-line bg-white px-3 text-sm font-medium text-brand" href="/">Quay lại dashboard</Link>
        </div>
      </section>
    </main>
  );
}
