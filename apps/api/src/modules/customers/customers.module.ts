import { Module } from '@nestjs/common'
import { PaymentTermsModule } from '../payment-terms/payment-terms.module'
import { ProductsModule } from '../products/products.module'
import { AddressesController } from './addresses.controller'
import { AddressesService } from './addresses.service'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import { CustomersController } from './customers.controller'
import { CustomerPricesController } from './customer-prices.controller'
import { CustomerPricesService } from './customer-prices.service'
import { CustomersService } from './customers.service'

@Module({
  // Prijsafspraken hebben productnamen nodig; die komen uit de productservice,
  // niet uit de producttabel (harde regel 1).
  imports: [ProductsModule, PaymentTermsModule],
  controllers: [CustomersController, ContactsController, AddressesController, CustomerPricesController],
  providers: [CustomersService, ContactsService, AddressesService, CustomerPricesService],
  exports: [CustomersService],
})
export class CustomersModule {}
