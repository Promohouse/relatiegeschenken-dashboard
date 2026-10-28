import { Module } from '@nestjs/common'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'
import { StagedChangesService } from './staged-changes.service'

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, StagedChangesService],
  exports: [ImportsService, StagedChangesService],
})
export class ImportsModule {}
