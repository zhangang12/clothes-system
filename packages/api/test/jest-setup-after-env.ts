// jest setupFilesAfterEnv – runs in each worker process once,
// after the test framework is installed but before any test suites run.
// We register a global afterAll hook that closes the singleton NestJS app
// so DB connections and the Redis client are released cleanly at the end.

import { getTestApp } from './app-singleton';

// `afterAll` at the top level of a setupFilesAfterEnv file fires after ALL
// suites in this worker have finished (Jest treats the whole file as a suite).
afterAll(async () => {
  try {
    const { app } = await getTestApp();
    await app.close();
  } catch {
    // If the app was never bootstrapped (e.g., all tests skipped), ignore.
  }
}, 15000);
