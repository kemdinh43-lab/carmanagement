import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hasSupabaseServiceConfig, getSupabaseServiceConfig } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleLabels, type AppRole } from "@/lib/permissions";

type AdminDriver = {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  telegram_enabled?: boolean | null;
  telegram_username?: string | null;
  telegram_connected_at?: string | null;
};

type AdminUserProfile = {
  user_id: string;
  full_name: string;
  phone: string | null;
  role: AppRole;
  driver_id: string | null;
  updated_at: string;
  telegram_enabled?: boolean | null;
  telegram_username?: string | null;
  telegram_connected_at?: string | null;
};

const internalLoginDomain = "angel-one.local";

function serviceClient() {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normalizeLoginName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function loginToEmail(value: string) {
  const raw = value.trim();
  if (raw.includes("@")) return raw.toLowerCase();
  const loginName = normalizeLoginName(raw);
  if (!loginName) return "";
  return `${loginName}@${internalLoginDomain}`;
}

function emailToLoginName(email: string) {
  return email.endsWith(`@${internalLoginDomain}`) ? email.slice(0, -(`@${internalLoginDomain}`).length) : email;
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const service = serviceClient();
  const { data: profile, error } = await service
    .from("app_user_profiles")
    .select("user_id,full_name,phone,role,driver_id,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, service };
}

function normalizeRole(value: unknown): AppRole {
  if (value === "sale" || value === "dispatcher" || value === "driver" || value === "accountant" || value === "manager" || value === "admin") {
    return value;
  }
  return "sale";
}

export async function GET() {
  if (!hasSupabaseServiceConfig()) {
    return NextResponse.json({ error: "Missing Supabase service config" }, { status: 500 });
  }

  const access = await requireAdmin();
  if ("error" in access) return access.error;

  const service = access.service;
  const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }, { data: drivers, error: driverError }] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 200 }),
    service.from("app_user_profiles").select("user_id,full_name,phone,role,driver_id,updated_at,telegram_enabled,telegram_username,telegram_connected_at"),
    service.from("app_drivers").select("id,full_name,phone,status,telegram_enabled,telegram_username,telegram_connected_at").order("full_name", { ascending: true })
  ]);

  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (driverError) return NextResponse.json({ error: driverError.message }, { status: 500 });

  const profileMap = new Map<string, AdminUserProfile>();
  (profiles ?? []).forEach((profile) => profileMap.set(profile.user_id, profile as AdminUserProfile));

  const users = (authUsers?.users ?? []).map((authUser) => {
    const profile = profileMap.get(authUser.id);
    return {
      id: authUser.id,
      email: authUser.email ?? "",
      loginName: emailToLoginName(authUser.email ?? ""),
      createdAt: authUser.created_at,
      updatedAt: profile?.updated_at ?? authUser.updated_at ?? authUser.created_at,
      confirmedAt: authUser.email_confirmed_at,
      fullName: profile?.full_name ?? authUser.user_metadata?.full_name ?? "",
      phone: profile?.phone ?? null,
      role: normalizeRole(profile?.role),
      driverId: profile?.driver_id ?? null,
      telegramEnabled: Boolean(profile?.telegram_enabled),
      telegramUsername: profile?.telegram_username ?? null,
      telegramConnectedAt: profile?.telegram_connected_at ?? null
    };
  });

  const normalizedDrivers = ((drivers ?? []) as AdminDriver[]).map((driver) => ({
    id: driver.id,
    fullName: driver.full_name,
    phone: driver.phone,
    status: driver.status,
    telegramEnabled: Boolean(driver.telegram_enabled),
    telegramUsername: driver.telegram_username ?? null,
    telegramConnectedAt: driver.telegram_connected_at ?? null
  }));

  return NextResponse.json({ users, drivers: normalizedDrivers });
}

export async function POST(request: Request) {
  if (!hasSupabaseServiceConfig()) {
    return NextResponse.json({ error: "Missing Supabase service config" }, { status: 500 });
  }

  const access = await requireAdmin();
  if ("error" in access) return access.error;

  const body = (await request.json().catch(() => null)) as Partial<{
    email: string;
    loginName: string;
    password: string;
    fullName: string;
    phone: string;
    role: AppRole;
    driverId: string | null;
  }> | null;

  const loginName = body?.loginName || body?.email || "";
  const email = loginToEmail(loginName);

  if (!email || !body?.password) {
    return NextResponse.json({ error: "Tên tài khoản và mật khẩu là bắt buộc" }, { status: 400 });
  }

  const service = access.service;
  const role = normalizeRole(body.role);
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.fullName?.trim() || loginName.trim(), login_name: emailToLoginName(email) }
  });

  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });
  if (!created.user) return NextResponse.json({ error: "Could not create user" }, { status: 500 });

  const { error: profileError } = await service.from("app_user_profiles").upsert({
    user_id: created.user.id,
    full_name: body.fullName?.trim() || loginName.trim(),
    phone: body.phone?.trim() || null,
    role,
    driver_id: role === "driver" ? body.driverId ?? null : null
  });

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({ ok: true, userId: created.user.id });
}

export async function PATCH(request: Request) {
  if (!hasSupabaseServiceConfig()) {
    return NextResponse.json({ error: "Missing Supabase service config" }, { status: 500 });
  }

  const access = await requireAdmin();
  if ("error" in access) return access.error;

  const body = (await request.json().catch(() => null)) as Partial<{
    userId: string;
    loginName: string;
    fullName: string;
    phone: string;
    role: AppRole;
    driverId: string | null;
    password: string;
  }> | null;

  if (!body?.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const service = access.service;
  const loginName = body.loginName?.trim();
  if (loginName) {
    const email = loginToEmail(loginName);
    if (!email) {
      return NextResponse.json({ error: "Tên tài khoản không hợp lệ" }, { status: 400 });
    }
    const { error: loginError } = await service.auth.admin.updateUserById(body.userId, {
      email,
      email_confirm: true,
      user_metadata: { full_name: body.fullName?.trim() || loginName, login_name: emailToLoginName(email) }
    });
    if (loginError) return NextResponse.json({ error: loginError.message }, { status: 400 });
  }

  const { data: existingProfile, error: profileFetchError } = await service
    .from("app_user_profiles")
    .select("user_id,full_name,phone,role,driver_id,updated_at")
    .eq("user_id", body.userId)
    .maybeSingle();

  if (profileFetchError) return NextResponse.json({ error: profileFetchError.message }, { status: 500 });

  if (body.password) {
    const { error: passwordError } = await service.auth.admin.updateUserById(body.userId, { password: body.password });
    if (passwordError) return NextResponse.json({ error: passwordError.message }, { status: 400 });
  }

  const role = body.role ? normalizeRole(body.role) : normalizeRole((existingProfile as AdminUserProfile | null)?.role);
  const { error: profileError } = await service.from("app_user_profiles").upsert({
    user_id: body.userId,
    full_name: body.fullName?.trim() ?? (existingProfile as AdminUserProfile | null)?.full_name ?? "",
    phone: body.phone !== undefined ? body.phone.trim() || null : (existingProfile as AdminUserProfile | null)?.phone ?? null,
    role,
    driver_id: role === "driver" ? body.driverId ?? null : null
  });

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({ ok: true, message: `Updated ${role ? roleLabels[role] : "user"}` });
}
