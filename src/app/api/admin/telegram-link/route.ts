import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hasSupabaseServiceConfig, getSupabaseServiceConfig } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function serviceClient() {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const service = serviceClient();
  const { data: profile, error } = await service
    .from("app_user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, service };
}

export async function POST(request: Request) {
  if (!hasSupabaseServiceConfig()) {
    return NextResponse.json({ error: "Missing Supabase service config" }, { status: 500 });
  }

  const access = await requireAdmin();
  if ("error" in access) return access.error;

  const body = (await request.json().catch(() => null)) as Partial<{
    targetType: "user" | "driver";
    targetUserId: string;
    targetDriverId: string;
    ttlMinutes: number;
  }> | null;

  const targetType = body?.targetType === "driver" ? "driver" : "user";
  const targetUserId = body?.targetUserId || null;
  const targetDriverId = body?.targetDriverId || null;

  if (targetType === "user" && !targetUserId) {
    return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
  }
  if (targetType === "driver" && !targetDriverId) {
    return NextResponse.json({ error: "targetDriverId is required" }, { status: 400 });
  }

  const { data, error } = await access.service.rpc("create_telegram_link_token", {
    p_target_type: targetType,
    p_target_user_id: targetType === "user" ? targetUserId : null,
    p_target_driver_id: targetType === "driver" ? targetDriverId : null,
    p_ttl_minutes: body?.ttlMinutes ?? 30
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const first = Array.isArray(data) ? data[0] : null;
  const token = first?.token ? String(first.token) : "";
  const expiresAt = first?.expires_at ? String(first.expires_at) : "";

  if (!token) {
    return NextResponse.json({ error: "Could not create Telegram token" }, { status: 500 });
  }

  return NextResponse.json({
    token,
    expiresAt,
    startCommand: `/start ${token}`
  });
}
