import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerModule } from '../customer/customer.module';
// 转销售合同自动建订单；OrderModule 不 imports QuoteModule（只 forFeature 报价实体），无循环依赖
import { OrderModule } from '../order/order.module';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationFee } from './quotation-fee.entity';
import { Customer } from '../customer/customer.entity';
import { SampleGarment } from '../sample/sample-garment.entity';
import { SampleMaterial } from '../sample/sample-material.entity';

@Module({
  imports: [CustomerModule, OrderModule, TypeOrmModule.forFeature([
    Quotation, QuotationItem, QuotationFee, Customer, SampleGarment, SampleMaterial,
  ])],
  controllers: [QuoteController],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
