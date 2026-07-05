import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SampleController } from './sample.controller';
import { SampleService } from './sample.service';
import { SampleGarment } from './sample-garment.entity';
import { SampleMaterial } from './sample-material.entity';
import { SampleVersion } from './sample-version.entity';
import { Customer } from '../customer/customer.entity';
import { Quotation } from '../quote/quotation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SampleGarment, SampleMaterial, SampleVersion, Customer, Quotation])],
  controllers: [SampleController],
  providers: [SampleService],
  exports: [SampleService],
})
export class SampleModule {}
