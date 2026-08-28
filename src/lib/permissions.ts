export type AppRole = "sale" | "dispatcher" | "driver" | "accountant" | "manager" | "admin";

export type PermissionAction =
  | "create_order"
  | "update_order_details"
  | "submit_driver_proposal"
  | "assign_vehicle"
  | "update_dispatch_status"
  | "record_payment"
  | "update_invoice"
  | "close_order"
  | "manage_master_data"
  | "view_audit";

const rolePermissions: Record<AppRole, PermissionAction[]> = {
  sale: ["create_order", "update_order_details"],
  dispatcher: ["update_order_details", "assign_vehicle", "update_dispatch_status"],
  driver: ["submit_driver_proposal", "update_dispatch_status"],
  accountant: ["update_order_details", "record_payment", "update_invoice", "close_order"],
  manager: ["create_order", "update_order_details", "submit_driver_proposal", "assign_vehicle", "update_dispatch_status", "record_payment", "update_invoice", "close_order", "view_audit"],
  admin: ["create_order", "update_order_details", "submit_driver_proposal", "assign_vehicle", "update_dispatch_status", "record_payment", "update_invoice", "close_order", "manage_master_data", "view_audit"]
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
