import { Global, Module } from '@nestjs/common'
import { AppConfig } from './config.service'

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: () => new AppConfig(process.env) }],
  exports: [AppConfig],
})
export class AppConfigModule {}
