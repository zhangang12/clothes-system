import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { Reconciliation } from './reconciliation.entity';
import { ReconciliationShipment } from './reconciliation-shipment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reconciliation, ReconciliationShipment])],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
