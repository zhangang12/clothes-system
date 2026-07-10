import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
// 机密客户名称快照遮蔽(P1#18/A2):行级可见性来自 CustomerService
import { CustomerModule } from '../customer/customer.module';
import { OrderMain } from './order-main.entity';
import { OrderSizeMatrix } from './order-size-matrix.entity';
import { OrderMaterial } from './order-material.entity';
import { OrderShipment } from './order-shipment.entity';
import { Quotation } from '../quote/quotation.entity';
import { QuotationItem } from '../quote/quotation-item.entity';

@Module({
  imports: [CustomerModule, TypeOrmModule.forFeature([OrderMain, OrderSizeMatrix, OrderMaterial, OrderShipment, Quotation, QuotationItem])],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
