// Shared NestJS application instance for the E2E test suite.
// All spec files import from here to avoid spinning up multiple apps.
//
// Jest runs each spec file in its own worker but `setupFilesAfterEnv` runs
// in the same worker as the tests, so the singleton lives in worker memory.
// The first call bootstraps; subsequent calls return the cached promise.

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { UserRole } from '@i9/types';

let appPromise: Promise<{
  app: INestApplication;
  adminToken: string;
  financeToken: string;
}> | null = null;

export async function getTestApp() {
  if (!appPromise) {
    appPromise = (async () => {
      // env defaults – CI sets these via env vars; local dev falls back below.
      process.env.NODE_ENV   = 'test';
      process.env.DB_HOST    = process.env.DB_HOST    ?? 'localhost';
      process.env.DB_PORT    = process.env.DB_PORT    ?? '3306';
      process.env.DB_NAME    = process.env.DB_NAME    ?? 'i9_test';
      process.env.DB_USER    = process.env.DB_USER    ?? 'i9test';
      process.env.DB_PASS    = process.env.DB_PASS    ?? 'i9test123';
      process.env.REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
      process.env.REDIS_PORT = process.env.REDIS_PORT ?? '6379';
      process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret';
      process.env.JWT_EXPIRES = '1d';

      const app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
      );
      app.useGlobalFilters(new HttpExceptionFilter());
      app.useGlobalInterceptors(new ResponseInterceptor());

      // Auto-create / update tables in the test DB.
      const ds = app.get(DataSource);
      await ds.synchronize();

      await app.init();

      // ── seed test users ──────────────────────────────────────────────────
      const hashedAdmin   = await bcrypt.hash('Admin@123', 10);
      const hashedFinance = await bcrypt.hash('Finance@123', 10);

      // Use parameterised queries – bcrypt hashes contain $ chars that could
      // confuse non-parameterised drivers in edge cases.
      await ds.query(
        `INSERT INTO sys_user (username, password, real_name, role, status)
         VALUES (?, ?, 'E2E Admin', ?, 1), (?, ?, 'E2E Finance', ?, 1)
         ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), status = 1`,
        [
          'e2e_admin',   hashedAdmin,   UserRole.ADMIN,
          'e2e_finance', hashedFinance, UserRole.FINANCE,
        ],
      );

      const [adminRow]   = await ds.query(`SELECT id FROM sys_user WHERE username = 'e2e_admin'   LIMIT 1`);
      const [financeRow] = await ds.query(`SELECT id FROM sys_user WHERE username = 'e2e_finance' LIMIT 1`);

      const jwt = app.get(JwtService);

      const adminToken = jwt.sign({
        sub: Number(adminRow.id),
        username: 'e2e_admin',
        role: UserRole.ADMIN,
        type: 'admin',
      });

      const financeToken = jwt.sign({
        sub: Number(financeRow.id),
        username: 'e2e_finance',
        role: UserRole.FINANCE,
        type: 'admin',
      });

      return { app, adminToken, financeToken };
    })();
  }
  return appPromise;
}
