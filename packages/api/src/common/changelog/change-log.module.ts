import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeLog } from './change-log.entity';
import { ChangeLogService } from './change-log.service';
import { ChangeLogController } from './change-log.controller';

// 全局模块:各业务模块直接注入 ChangeLogService 留痕,无需逐个 imports
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ChangeLog])],
  controllers: [ChangeLogController],
  providers: [ChangeLogService],
  exports: [ChangeLogService],
})
export class ChangeLogModule {}
