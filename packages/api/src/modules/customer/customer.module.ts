import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { Customer } from './customer.entity';
import { CustomerGrant } from './customer-grant.entity';
import { CustomerContact } from './customer-contact.entity';
import { CustomerBank } from './customer-bank.entity';
import { CustomerExpress } from './customer-express.entity';
import { OrderMain } from '../order/order-main.entity';
import { Quotation } from '../quote/quotation.entity';
import { SampleGarment } from '../sample/sample-garment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerGrant, 
    Customer, CustomerContact, CustomerBank, CustomerExpress,
    OrderMain, Quotation, SampleGarment,
  ])],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
