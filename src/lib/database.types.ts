import type {
  DispatchStatus,
  InvoiceStatus,
  OrderStatus,
  PaymentStatus,
  ReconciliationStatus,
  ResourceStatus
} from "./types";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      vehicles: {
        Row: {
          id: string;
          organization_id: string;
          plate_no: string;
          vehicle_type: string;
          seats: number;
          status: ResourceStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          plate_no: string;
          vehicle_type: string;
          seats: number;
          status?: ResourceStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
      };
      drivers: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          phone: string;
          license_no: string | null;
          status: ResourceStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          full_name: string;
          phone: string;
          license_no?: string | null;
          status?: ResourceStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["drivers"]["Insert"]>;
      };
      service_orders: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          customer_id: string | null;
          company_id: string | null;
          contact_id: string | null;
          sales_owner_id: string | null;
          source_id: string | null;
          status: OrderStatus;
          total_amount: number;
          payment_status: PaymentStatus;
          invoice_status: InvoiceStatus;
          reconciliation_status: ReconciliationStatus;
          billing_snapshot_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["service_orders"]["Row"]> & {
          organization_id: string;
          code: string;
        };
        Update: Partial<Database["public"]["Tables"]["service_orders"]["Insert"]>;
      };
      dispatch_orders: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          service_order_id: string;
          start_at: string;
          end_at: string;
          pickup: string;
          dropoff: string;
          itinerary: string | null;
          guest_count: number | null;
          vehicle_requirement: string | null;
          dispatch_status: DispatchStatus;
          actual_start_at: string | null;
          actual_end_at: string | null;
          trip_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["dispatch_orders"]["Row"]> & {
          organization_id: string;
          code: string;
          service_order_id: string;
          start_at: string;
          end_at: string;
          pickup: string;
          dropoff: string;
        };
        Update: Partial<Database["public"]["Tables"]["dispatch_orders"]["Insert"]>;
      };
      ops_snapshots: {
        Row: {
          id: string;
          state: Json;
          updated_at: string;
        };
        Insert: {
          id: string;
          state?: Json;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ops_snapshots"]["Insert"]>;
      };
    };
    Functions: {
      has_assignment_conflict: {
        Args: {
          p_vehicle_id: string;
          p_driver_id: string;
          p_start_at: string;
          p_end_at: string;
          p_ignore_assignment_id?: string | null;
        };
        Returns: boolean;
      };
      next_dispatch_order_code: {
        Args: {
          p_order_date?: string | null;
        };
        Returns: string;
      };
    };
  };
}
