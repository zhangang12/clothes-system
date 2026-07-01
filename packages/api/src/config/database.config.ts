import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.get('DB_HOST', 'localhost'),
  port: config.get<number>('DB_PORT', 3306),
  database: config.get('DB_NAME', 'i9_clothes'),
  username: config.get('DB_USER', 'i9user'),
  password: config.get('DB_PASS', 'i9pass123'),
  charset: 'utf8mb4',
  timezone: '+08:00',
  // 实体自动发现
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  // 开发环境同步（生产用 migration）
  synchronize: config.get('NODE_ENV') === 'development',
  logging: config.get('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
  extra: {
    connectionLimit: 10,
  },
});
