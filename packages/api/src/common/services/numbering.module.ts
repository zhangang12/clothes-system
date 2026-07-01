import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { NumberingService, REDIS_CLIENT } from './numbering.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD', ''),
          db: 0,
          lazyConnect: false,
        }),
      inject: [ConfigService],
    },
    NumberingService,
  ],
  exports: [REDIS_CLIENT, NumberingService],
})
export class NumberingModule {}
