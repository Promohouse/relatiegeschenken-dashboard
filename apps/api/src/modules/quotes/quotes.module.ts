import { Module } from '@nestjs/common'
import { ImportsModule } from '../imports/imports.module'
import { SettingsModule } from '../settings/settings.module'
import { CalculatorService } from './calculator.service'
import { QuotesController } from './quotes.controller'
import { QuotesService } from './quotes.service'
import { QuotePdfService } from './quote-pdf.service'

@Module({
  // Voorraad komt uit de importmodule; de calculator waarschuwt ermee.
  imports: [ImportsModule, SettingsModule],
  controllers: [QuotesController],
  providers: [CalculatorService, QuotesService, QuotePdfService],
  exports: [CalculatorService, QuotesService],
})
export class QuotesModule {}
