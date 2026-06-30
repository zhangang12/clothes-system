// E2E test global setup
// Verifies test DB connection before running suites
export default async function setup() {
  // TODO Phase 8: setup test MySQL/Redis connections
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'i9_clothes_test';
}
