// E2E global setup – runs ONCE before all Jest workers start.
// Sets environment variables so they're inherited by every worker process.
// The actual NestJS app bootstrap happens lazily in app-singleton.ts
// (called from e2e-helpers.ts) so that the app lives in the worker process
// that needs it (and can be referenced by supertest).

export default async function setup(): Promise<void> {
  process.env.NODE_ENV    = 'test';
  process.env.DB_HOST     = process.env.DB_HOST    ?? 'localhost';
  process.env.DB_PORT     = process.env.DB_PORT    ?? '3306';
  process.env.DB_NAME     = process.env.DB_NAME    ?? 'i9_test';
  process.env.DB_USER     = process.env.DB_USER    ?? 'i9test';
  process.env.DB_PASS     = process.env.DB_PASS    ?? 'i9test123';
  process.env.REDIS_HOST  = process.env.REDIS_HOST ?? 'localhost';
  process.env.REDIS_PORT  = process.env.REDIS_PORT ?? '6379';
  process.env.JWT_SECRET  = process.env.JWT_SECRET ?? 'e2e-test-secret';
  process.env.JWT_EXPIRES = '1d';
}
