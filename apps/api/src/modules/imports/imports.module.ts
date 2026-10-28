import { Module } from '@nestjs/common'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'
import { StagedChangesService } from './staged-changes.service'
import { SupplierStockService } from './supplier-stock.service'

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, StagedChangesService, SupplierStockService],
  exports: [ImportsService, StagedChangesService, SupplierStockService],
})
export class ImportsModule {}
