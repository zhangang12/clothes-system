import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER } from '@nestjs/core';
import { ErrorLog } from './error-log.entity';
import { ErrorLogService } from './error-log.service';
import { ErrorLogController } from './error-log.controller';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

/**
 * 系统报错记录模块。以 APP_FILTER 注册全局异常过滤器(替代 main.ts 的 new),
 * 使过滤器可注入 ErrorLogService,自动把服务器异常归档去重。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog])],
  controllers: [ErrorLogController],
  providers: [
    ErrorLogService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
