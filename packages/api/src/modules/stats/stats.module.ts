import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { SampleGarment } from '../sample/sample-garment.entity';
import { Quotation } from '../quote/quotation.entity';
import { OrderMain } from '../order/order-main.entity';
import { Settlement } from '../settlement/settlement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SampleGarment, Quotation, OrderMain, Settlement])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
