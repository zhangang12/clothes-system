import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (config: ConfigService): TypeOrmModuleOptions => {
  const password = config.get<string>('DB_PASS');
  if (!password) throw new Error('DB_PASS env var is required');
  return {
    type: 'mysql',
    host: config.get('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 3306),
    database: config.get('DB_NAME', 'i9_clothes'),
    username: config.get('DB_USER', 'i9user'),
    password,
    charset: 'utf8mb4',
    timezone: '+08:00',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: config.get('NODE_ENV') === 'development',
    logging: config.get('NODE_ENV') === 'development' ? ['error', 'warn'] : ['error'],
    extra: {
      connectionLimit: 10,
    },
  };
};
