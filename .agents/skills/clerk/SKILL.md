---
name: clerk
description: Custom instructions for Clerk Auth integration, local vs production keys, and middleware user synchronization.
---

# Clerk Auth Setup & Telemetry Guidelines

Always follow these guidelines when configuring or debugging Clerk Auth inside the Delight Group LLC platform.

## 1. Local vs Production Environment Keys

When running the application locally (`localhost:4321` or `127.0.0.1`), Clerk requires development/test credentials to allow local session cookies and redirects.

* **Local Development Environment Keys**:
  * `PUBLIC_CLERK_PUBLISHABLE_KEY`: Must start with `pk_test_`
  * `CLERK_SECRET_KEY`: Must start with `sk_test_`
* **Production Environment Keys**:
  * `PUBLIC_CLERK_PUBLISHABLE_KEY`: Must start with `pk_live_`
  * `CLERK_SECRET_KEY`: Must start with `sk_live_`

If live production keys are used on localhost, Clerk will block authentication because of domain validation safeguards.

## 2. Local User Database Synchronization

Our middleware (`src/middleware.ts`) automatically synchronizes authenticated Clerk users into the local PostgreSQL `users` table:
* Whenever a new user signs in, the middleware queries Clerk Backend APIs to retrieve their email address, name, and role metadata.
* It populates the local `users` and `user_roles` mappings.
* It assigns the default `'user'` role unless they match administrative parameters (e.g., `sales@delightgroupllc.com`) or have explicit role parameters in Clerk metadata.
