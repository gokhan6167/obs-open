import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginDto = z.infer<typeof loginSchema>;

const changePwSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
type ChangePwDto = z.infer<typeof changePwSchema>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Giriş (e-posta + parola -> JWT). Tenant x-tenant-id başlığından.' })
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginDto) {
    return this.service.login(body.email, body.password);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Parola değiştir (JWT ile; eski parola doğrulanır)' })
  changePassword(@Body(new ZodValidationPipe(changePwSchema)) body: ChangePwDto) {
    return this.service.changePassword(body.oldPassword, body.newPassword);
  }
}
