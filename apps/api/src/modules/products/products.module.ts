import { Module } from '@nestjs/common'
import { ImportsModule } from '../imports/imports.module'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'

@Module({
  // Voorraad hoort bij de importmodule; de catalogus leest hem via de
  // service en niet uit de tabel (harde regel 1).
  imports: [ImportsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
