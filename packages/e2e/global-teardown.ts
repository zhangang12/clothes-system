import { request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = 'http://localhost:3000/api/v1';
const STATE_FILE = path.join(__dirname, 'e2e-test-state.json');

async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('E2E global-teardown: state file not found, nothing to clean up');
    return;
  }

  let state: { adminToken?: string; factoryId?: number | null; customerId?: number | null };
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    console.warn('E2E global-teardown: could not parse state file');
    return;
  }

  const { adminToken, factoryId, customerId } = state;
  if (!adminToken) {
    console.warn('E2E global-teardown: no adminToken, skipping API cleanup');
    fs.unlinkSync(STATE_FILE);
    return;
  }

  const ctx = await request.newContext();
  const auth = { Authorization: `Bearer ${adminToken}` };

  // Clean up test customer
  if (customerId) {
    try {
      await ctx.delete(`${API}/customers/${customerId}`, { headers: auth });
      console.log(`E2E global-teardown: deleted test customer #${customerId}`);
    } catch (err) {
      console.warn(`E2E global-teardown: could not delete customer #${customerId}:`, err);
    }
  }

  // Clean up test factory
  if (factoryId) {
    try {
      await ctx.delete(`${API}/factories/${factoryId}`, { headers: auth });
      console.log(`E2E global-teardown: deleted test factory #${factoryId}`);
    } catch (err) {
      console.warn(`E2E global-teardown: could not delete factory #${factoryId}:`, err);
    }
  }

  await ctx.dispose();

  // Remove state file
  try {
    fs.unlinkSync(STATE_FILE);
    console.log('E2E global-teardown: removed state file');
  } catch {
    // best effort
  }
}

export default globalTeardown;
