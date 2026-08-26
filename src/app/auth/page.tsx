"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { hasSupabaseBrowserConfig } from "@/lib/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppRole } from "@/lib/permissions";

export default function AuthPage() {
  const [message, setMessage] = useState(hasSupabaseBrowserConfig() ? "Supabase auth ready." : "Thiếu NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY.");

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Chưa có Supabase config trong .env.local.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode = submitter?.value === "signup" ? "signup" : "signin";
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
      if (!profile) {
        await supabase.from("app_user_profiles" as never).upsert({
          user_id: data.user.id,
          full_name: fullName || data.user.email || "",
          phone: phone || null,
          role: "sale" as AppRole,
          driver_id: null
        } as never);
      }
    }

    setMessage(error ? error.message : mode === "signin" ? "Đăng nhập thành công." : "Đã tạo tài khoản. Kiểm tra email nếu Supabase yêu cầu xác nhận.");
  }

  async function signOut() {
    if (!hasSupabaseBrowserConfig()) {
      setMessage("Chưa có Supabase config trong .env.local.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    setMessage(error ? error.message : "Đã đăng xuất.");
  }

  return (
    <main className="min-h-screen bg-panel p-6">
      <section className="mx-auto max-w-md border border-line bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Angel One Travel Auth</h1>
        <p className="mt-2 border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{message}</p>
        <form className="mt-5 space-y-3" onSubmit={handleAuth}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Email</span>
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="email" required type="email" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Password</span>
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" minLength={6} name="password" required type="password" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Họ tên</span>
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="fullName" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">SĐT</span>
            <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="phone" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className="h-10 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-teal-800" type="submit" value="signin">Đăng nhập</button>
            <button className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit" value="signup">Tạo tài khoản</button>
          </div>
        </form>
        <button className="mt-3 h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={signOut} type="button">Đăng xuất</button>
        <Link className="mt-4 block text-sm font-medium text-brand" href="/">Quay lại dashboard</Link>
      </section>
    </main>
  );
}
