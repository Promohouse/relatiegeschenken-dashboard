import { Module } from '@nestjs/common'
import { ImportsModule } from '../imports/imports.module'
import { CalculatorService } from './calculator.service'
import { QuotesController } from './quotes.controller'

@Module({
  // Voorraad komt uit de importmodule; de calculator waarschuwt ermee.
  imports: [ImportsModule],
  controllers: [QuotesController],
  providers: [CalculatorService],
  exports: [CalculatorService],
})
export class QuotesModule {}
