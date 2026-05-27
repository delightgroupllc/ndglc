export interface Division {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface Category {
  id: string;
  division_id: string;
  name: string;
  slug: string;
  display_order: number;
  seo_title: string | null;
  seo_description: string | null;
}

export interface Specification {
  key: string;
  value: string;
}

export interface Product {
  id: string;
  category_id: string;
  division_id: string;
  name: string;
  sku: string;
  slug: string;
  description: string | null;
  specifications: Specification[];
  featured: boolean;
  status: 'active' | 'inactive' | 'draft';
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  is_primary: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  is_suspended: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface Permission {
  id: string;
  name: string;
  description: string | null;
}

export interface Inventory {
  id: string;
  product_id: string;
  stock_level: number;
  warehouse_location: string;
  low_stock_threshold: number;
  updated_at: string;
}

export interface InventoryLog {
  id: string;
  inventory_id: string;
  change_amount: number;
  previous_stock: number;
  new_stock: number;
  reason: 'purchase' | 'sales' | 'adjustment' | 'audit';
  user_id: string | null;
  timestamp: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  issue_date: string;
  due_date: string;
  payment_status: 'paid' | 'unpaid' | 'overdue' | 'cancelled';
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Download {
  id: string;
  title: string;
  url: string;
  type: 'pdf' | 'catalog' | 'datasheet';
  category_id: string | null;
  visibility_rules: string[];
  permission_required: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  inquiry_type: 'sales' | 'support' | 'partnership' | 'general';
  is_resolved: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  ip_address: string | null;
  timestamp: string;
}
