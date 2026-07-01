// Shared helpers for E2E specs.
// Each spec file should call `initApp()` in a top-level `beforeAll` to ensure
// the singleton NestJS application is ready before tests run.

import { INestApplication } from '@nestjs/common';
import { getTestApp } from './app-singleton';

// Module-level cache so helpers work synchronously inside tests.
let _app: INestApplication;
let _adminToken: string;
let _financeToken: string;

/**
 * Must be called once (in a top-level `beforeAll`) by every spec file.
 * Subsequent calls in the same Jest worker are instant (cached promise).
 */
export async function initApp(): Promise<void> {
  const result = await getTestApp();
  _app = result.app;
  _adminToken = result.adminToken;
  _financeToken = result.financeToken;
}

/** Returns the bootstrapped NestJS application. */
export function getApp(): INestApplication {
  return _app;
}

/** Returns a valid JWT for the seeded ADMIN user. */
export function adminToken(): string {
  return _adminToken;
}

/** Returns a valid JWT for the seeded FINANCE user. */
export function financeToken(): string {
  return _financeToken;
}

/** Builds the Authorization header object for supertest. */
export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Convenience: admin auth header. */
export function adminAuth(): { Authorization: string } {
  return authHeader(adminToken());
}

/** Convenience: finance auth header. */
export function financeAuth(): { Authorization: string } {
  return authHeader(financeToken());
}
