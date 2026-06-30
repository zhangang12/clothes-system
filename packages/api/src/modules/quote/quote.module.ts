import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Quotation, QuotationItem])],
  controllers: [QuoteController],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
