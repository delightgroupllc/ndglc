/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: {
      id: string;
      email: string;
      name: string;
      is_suspended: boolean;
      created_at: string;
      updated_at: string;
    } | null;
    roles: string[];
    permissions: string[];
    tags: string[];
  }
}
