import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { SupplierAccount } from '../auth/supplier-account.entity';
import { Contract } from '../contract/contract.entity';
import { ContractMaterial } from '../contract/contract-material.entity';
import { ContractPortalLog } from '../contract/contract-portal-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SupplierAccount, Contract, ContractMaterial, ContractPortalLog])],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
