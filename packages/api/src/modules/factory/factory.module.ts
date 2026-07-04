import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FactoryController } from './factory.controller';
import { FactoryService } from './factory.service';
import { Factory } from './factory.entity';
import { Contract } from '../contract/contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Factory, Contract])],
  controllers: [FactoryController],
  providers: [FactoryService],
  exports: [FactoryService],
})
export class FactoryModule {}
