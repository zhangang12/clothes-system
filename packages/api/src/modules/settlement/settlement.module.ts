import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { Settlement } from './settlement.entity';
import { SettlementCost } from './settlement-cost.entity';
import { SettlementReceipt } from './settlement-receipt.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderShipment } from '../order/order-shipment.entity';
import { Reconciliation } from '../reconciliation/reconciliation.entity';
import { ReconciliationExpenseItem } from '../reconciliation/reconciliation-expense-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Settlement, SettlementCost, SettlementReceipt, OrderMain, OrderShipment, Reconciliation, ReconciliationExpenseItem,
  ])],
  controllers: [SettlementController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
