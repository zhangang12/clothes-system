import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { Settlement } from './settlement.entity';
import { SettlementCost } from './settlement-cost.entity';
import { SettlementReceipt } from './settlement-receipt.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderShipment } from '../order/order-shipment.entity';
import { Contract } from '../contract/contract.entity';
import { Factory } from '../factory/factory.entity';
import { Reconciliation } from '../reconciliation/reconciliation.entity';
import { ReconciliationExpenseItem } from '../reconciliation/reconciliation-expense-item.entity';
import { ExportInvoiceModule } from '../invoice/export-invoice.module';

@Module({
  imports: [ExportInvoiceModule, TypeOrmModule.forFeature([
    Settlement, SettlementCost, SettlementReceipt, OrderMain, OrderShipment, Contract, Factory, Reconciliation, ReconciliationExpenseItem,
  ])],
  controllers: [SettlementController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
