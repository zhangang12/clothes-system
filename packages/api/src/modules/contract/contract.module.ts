import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { Contract } from './contract.entity';
import { ContractMaterial } from './contract-material.entity';
import { ContractShipment } from './contract-shipment.entity';
import { ContractPortalLog } from './contract-portal-log.entity';
import { OrderMaterial } from '../order/order-material.entity';
import { OrderMain } from '../order/order-main.entity';
import { OrderSizeMatrix } from '../order/order-size-matrix.entity';
import { Factory } from '../factory/factory.entity';
import { SupplierAccount } from '../auth/supplier-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Contract, ContractMaterial, ContractShipment, ContractPortalLog, OrderMaterial, OrderMain, OrderSizeMatrix, Factory, SupplierAccount,
  ])],
  controllers: [ContractController],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
