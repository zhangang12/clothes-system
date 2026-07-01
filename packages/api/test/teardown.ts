// E2E global teardown – runs ONCE after all Jest workers have finished.
// Since the NestJS app lives in worker processes (not the global setup process),
// workers handle their own cleanup via Jest's `--forceExit` flag or by the
// app being GC'd when the worker exits.
// If you need explicit cleanup, add a `setupFilesAfterEnv` teardown instead.
export default async function teardown(): Promise<void> {
  // Nothing needed here: each worker's app is closed when the worker exits.
  // For explicit teardown within workers, use afterAll in individual suites
  // or add a globalTeardownFile that is a setupFilesAfterEnv module.
}
