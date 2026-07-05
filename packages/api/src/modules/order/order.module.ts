import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderMain } from './order-main.entity';
import { OrderSizeMatrix } from './order-size-matrix.entity';
import { OrderMaterial } from './order-material.entity';
import { OrderShipment } from './order-shipment.entity';
import { Quotation } from '../quote/quotation.entity';
import { QuotationItem } from '../quote/quotation-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderMain, OrderSizeMatrix, OrderMaterial, OrderShipment, Quotation, QuotationItem])],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
