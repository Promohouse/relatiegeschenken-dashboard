import { Module } from '@nestjs/common'
import { AddressesController } from './addresses.controller'
import { AddressesService } from './addresses.service'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'
import { CustomersController } from './customers.controller'
import { CustomersService } from './customers.service'

@Module({
  controllers: [CustomersController, ContactsController, AddressesController],
  providers: [CustomersService, ContactsService, AddressesService],
  exports: [CustomersService],
})
export class CustomersModule {}
