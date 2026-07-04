import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FactoryController } from './factory.controller';
import { FactoryService } from './factory.service';
import { Factory } from './factory.entity';
import { FactoryContact } from './factory-contact.entity';
import { Contract } from '../contract/contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Factory, FactoryContact, Contract])],
  controllers: [FactoryController],
  providers: [FactoryService],
  exports: [FactoryService],
})
export class FactoryModule {}
