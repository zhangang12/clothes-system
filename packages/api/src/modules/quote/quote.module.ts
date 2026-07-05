import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationFee } from './quotation-fee.entity';
import { Customer } from '../customer/customer.entity';
import { SampleGarment } from '../sample/sample-garment.entity';
import { SampleMaterial } from '../sample/sample-material.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Quotation, QuotationItem, QuotationFee, Customer, SampleGarment, SampleMaterial,
  ])],
  controllers: [QuoteController],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
