import { Global, Module } from '@nestjs/common'
import { AuditService } from './audit/audit.service'
import { NumberingService } from './numbering/numbering.service'
import { PricingService } from './pricing/pricing.service'

/**
 * Diensten die elke domeinmodule nodig heeft. Global, zodat modules ze niet
 * allemaal apart hoeven te importeren - dit is infrastructuur, geen domein.
 */
@Global()
@Module({
  providers: [NumberingService, PricingService, AuditService],
  exports: [NumberingService, PricingService, AuditService],
})
export class CoreModule {}
