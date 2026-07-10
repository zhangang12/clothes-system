import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SampleController } from './sample.controller';
import { SampleService } from './sample.service';
// 样衣材料修改→同步未成单报价(P1#11);QuoteModule 不回向 imports SampleModule,无循环
import { QuoteModule } from '../quote/quote.module';
import { CustomerModule } from '../customer/customer.module';
import { SampleGarment } from './sample-garment.entity';
import { SampleMaterial } from './sample-material.entity';
import { SampleVersion } from './sample-version.entity';
import { Customer } from '../customer/customer.entity';
import { Quotation } from '../quote/quotation.entity';

@Module({
  imports: [QuoteModule, CustomerModule, TypeOrmModule.forFeature([SampleGarment, SampleMaterial, SampleVersion, Customer, Quotation])],
  controllers: [SampleController],
  providers: [SampleService],
  exports: [SampleService],
})
export class SampleModule {}
