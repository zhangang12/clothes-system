import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

// DataSource 由 TypeOrmModule.forRoot 全局提供，无需 forFeature。
@Module({
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
