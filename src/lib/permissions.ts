export type AppRole = "sale" | "dispatcher" | "driver" | "accountant" | "manager" | "admin";

export type PermissionAction =
  | "create_order"
  | "assign_vehicle"
  | "update_dispatch_status"
  | "record_payment"
  | "update_invoice"
  | "close_order"
  | "manage_master_data"
  | "view_audit";

const rolePermissions: Record<AppRole, PermissionAction[]> = {
  sale: ["create_order"],
  dispatcher: ["assign_vehicle", "update_dispatch_status"],
  driver: ["update_dispatch_status"],
  accountant: ["record_payment", "update_invoice", "close_order"],
  manager: ["create_order", "assign_vehicle", "update_dispatch_status", "record_payment", "update_invoice", "close_order", "view_audit"],
  admin: ["create_order", "assign_vehicle", "update_dispatch_status", "record_payment", "update_invoice", "close_order", "manage_master_data", "view_audit"]
};

export function can(role: AppRole, action: PermissionAction) {
  return rolePermissions[role].includes(action);
}

export const roleLabels: Record<AppRole, string> = {
  sale: "Sale",
  dispatcher: "Điều hành",
  driver: "Tài xế",
  accountant: "Kế toán",
  manager: "Quản lý",
  admin: "Admin"
};

