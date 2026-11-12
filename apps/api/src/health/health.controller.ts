import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Sağlık kontrolü — installer/upgrade ve izleme (Faz 9) için temel uç. */
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check(): { status: string; deploymentMode: string; time: string } {
    return {
      status: 'ok',
      deploymentMode: this.config.getOrThrow<string>('DEPLOYMENT_MODE'),
      time: new Date().toISOString(),
    };
  }
}
