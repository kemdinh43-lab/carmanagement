"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { roleLabels, type AppRole } from "@/lib/permissions";
import type { Driver } from "@/lib/types";

type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: AppRole;
  driverId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminUsersResponse = {
  users: AdminUser[];
  drivers: Driver[];
};

const roleOptions: AppRole[] = ["sale", "dispatcher", "driver", "accountant", "manager", "admin"];

export function AdminUsersPanel({ currentRole }: { currentRole: AppRole }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [message, setMessage] = useState("Chưa tải danh sách user.");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const driverLabelMap = useMemo(() => new Map(drivers.map((driver) => [driver.id, `${driver.fullName} / ${driver.phone}`])), [drivers]);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await response.json()) as Partial<AdminUsersResponse> & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Không tải được user");
      }
      setUsers(data.users ?? []);
      setDrivers(data.drivers ?? []);
      setMessage(`Đã tải ${data.users?.length ?? 0} user.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được user");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentRole !== "admin") return;
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentRole]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentRole !== "admin") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || ""),
      fullName: String(form.get("fullName") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      role: String(form.get("role") || "sale") as AppRole,
      driverId: String(form.get("driverId") || "") || null
    };
    setCreating(true);
    try {
      const response = await fetch("/api/admin/users", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tạo được user");
      setMessage(`Đã tạo user ${payload.email}.`);
      event.currentTarget.reset();
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được user");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentRole !== "admin") return;
    const form = new FormData(event.currentTarget);
    const userId = String(form.get("userId") || "");
    if (!userId) return;
    const payload = {
      userId,
      fullName: String(form.get("fullName") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      role: String(form.get("role") || "sale") as AppRole,
      driverId: String(form.get("driverId") || "") || null,
      password: String(form.get("password") || "").trim()
    };

    setSavingUserId(userId);
    try {
      const response = await fetch("/api/admin/users", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được user");
      setMessage(`Đã cập nhật ${payload.fullName || payload.userId}.`);
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không lưu được user");
    } finally {
      setSavingUserId(null);
    }
  }

  if (currentRole !== "admin") {
    return (
      <section className="border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-amber-700" size={20} />
          <h3 className="font-semibold text-amber-950">Không đủ quyền</h3>
        </div>
        <p className="mt-2 text-sm text-amber-900">Chỉ admin mới được quản lý user.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 border border-line bg-white px-4 py-3 shadow-sm">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-ink">
            <UsersRound size={20} className="text-brand" />
            Quản lý users
          </h3>
          <p className="text-sm text-slate-500">Tạo login, đặt mật khẩu và phân quyền truy cập cho từng tài khoản.</p>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => void loadUsers()} type="button">
          <RefreshCw size={16} /> Tải lại
        </button>
      </div>

      <p className="border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{message}{loading ? " Đang tải..." : ""}</p>

      <form className="border border-line bg-white p-4 shadow-sm" onSubmit={handleCreate}>
        <div className="flex items-center gap-2">
          <UserPlus className="text-brand" size={20} />
          <h4 className="font-semibold text-ink">Tạo user mới</h4>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Tên đăng nhập / email</span><input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="email" required type="email" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Mật khẩu</span><input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" minLength={6} name="password" required type="password" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Họ tên</span><input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="fullName" required /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">SĐT</span><input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="phone" /></label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Phân quyền</span>
            <select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="role">
              {roleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Gắn tài xế</span>
            <select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="driverId">
              <option value="">Không gắn</option>
              {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName} / {driver.phone}</option>)}
            </select>
          </label>
        </div>
        <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={creating} type="submit">
          <Save size={16} /> {creating ? "Đang tạo..." : "Tạo user"}
        </button>
      </form>

      <div className="overflow-hidden border border-line bg-white shadow-sm">
        <div className="border-b border-line px-4 py-3">
          <h4 className="font-semibold text-ink">Danh sách users</h4>
        </div>
        <div className="divide-y divide-line">
          {users.map((user) => (
            <UserRow
              driverLabelMap={driverLabelMap}
              drivers={drivers}
              key={`${user.id}-${user.updatedAt}`}
              onSave={handleSaveUser}
              saving={savingUserId === user.id}
              user={user}
            />
          ))}
          {!loading && users.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">Chưa có user nào.</p>}
        </div>
      </div>
    </section>
  );
}

function UserRow({
  driverLabelMap,
  drivers,
  onSave,
  saving,
  user
}: {
  driverLabelMap: Map<string, string>;
  drivers: Driver[];
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  user: AdminUser;
}) {
  const [role, setRole] = useState<AppRole>(() => user.role);

  return (
    <form className="grid gap-3 px-4 py-4 xl:grid-cols-[1.1fr_1fr_1fr_130px_180px_140px] xl:items-end" onSubmit={onSave}>
      <input name="userId" type="hidden" value={user.id} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Email</span>
        <input className="h-10 w-full rounded-md border border-line bg-slate-50 px-3 text-sm text-slate-600 outline-none" readOnly value={user.email} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Họ tên</span>
        <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" defaultValue={user.fullName} name="fullName" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">SĐT</span>
        <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" defaultValue={user.phone ?? ""} name="phone" />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Role</span>
        <select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="role" value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
          {roleOptions.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Driver</span>
        <select className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50" defaultValue={user.driverId ?? ""} disabled={role !== "driver"} name="driverId">
          <option value="">Không gắn</option>
          {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driverLabelMap.get(driver.id) || driver.id}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Mật khẩu mới</span>
        <input className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100" name="password" placeholder="Để trống nếu không đổi" type="password" />
      </label>
      <div className="xl:col-span-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          <p>{user.confirmedAt ? "Đã xác thực email" : "Chưa xác thực email"}</p>
          <p>Cập nhật: {new Date(user.updatedAt).toLocaleString("vi-VN")}</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={saving} type="submit">
          <Save size={16} /> {saving ? "Đang lưu..." : "Lưu user"}
        </button>
      </div>
    </form>
  );
}
