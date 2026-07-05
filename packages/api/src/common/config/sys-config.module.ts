import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysConfig } from './sys-config.entity';
import { SysConfigService } from './sys-config.service';
import { SysConfigController } from './sys-config.controller';

// @Global：报价/订单/合同服务可直接注入 SysConfigService 读取审批阈值
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SysConfig])],
  controllers: [SysConfigController],
  providers: [SysConfigService],
  exports: [SysConfigService],
})
export class SysConfigModule {}
