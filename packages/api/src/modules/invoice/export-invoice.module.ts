import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportInvoice } from './export-invoice.entity';
import { ExportInvoiceItem } from './export-invoice-item.entity';
import { InvoiceReceipt } from './invoice-receipt.entity';
import { ExportInvoiceService } from './export-invoice.service';
import { ExportInvoiceController } from './export-invoice.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExportInvoice, ExportInvoiceItem, InvoiceReceipt])],
  controllers: [ExportInvoiceController],
  providers: [ExportInvoiceService],
  exports: [ExportInvoiceService],
})
export class ExportInvoiceModule {}
