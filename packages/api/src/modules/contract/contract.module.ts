import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { Contract } from './contract.entity';
import { ContractMaterial } from './contract-material.entity';
import { ContractPortalLog } from './contract-portal-log.entity';
import { OrderMaterial } from '../order/order-material.entity';
import { OrderMain } from '../order/order-main.entity';
import { Factory } from '../factory/factory.entity';
import { SupplierAccount } from '../auth/supplier-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Contract, ContractMaterial, ContractPortalLog, OrderMaterial, OrderMain, Factory, SupplierAccount,
  ])],
  controllers: [ContractController],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
