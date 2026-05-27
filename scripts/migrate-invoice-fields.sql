-- Run this in your Neon SQL Console to add missing invoice fields

-- Add new columns to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'standard';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_division TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Add new columns to invoice_items table
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS catalogue_ref TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tech_spec TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_rate DOUBLE PRECISION DEFAULT 5;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION DEFAULT 0;
