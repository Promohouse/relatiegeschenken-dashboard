import { Injectable } from '@nestjs/common'
import { parseEnv, type Env } from './config.schema'

@Injectable()
export class AppConfig {
  readonly env: Env

  constructor(raw: NodeJS.ProcessEnv = process.env) {
    this.env = parseEnv(raw)
  }

  get isProduction() {
    return this.env.NODE_ENV === 'production'
  }

  get isTest() {
    return this.env.NODE_ENV === 'test'
  }
}
