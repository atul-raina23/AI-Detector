import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '@eos/backend-core';
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  SignupRequestSchema,
  type AuthTokensResponse,
  type LoginRequest,
  type LogoutRequest,
  type RefreshRequest,
  type SignupRequest,
} from '@eos/contracts';
import { AuthService } from './auth.service.js';
import type { RequestMeta } from './jwt-payload.type.js';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(
    @Body(new ZodValidationPipe(SignupRequestSchema)) dto: SignupRequest,
    @Req() req: Request,
  ): Promise<AuthTokensResponse> {
    return this.auth.signup(dto, requestMeta(req));
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) dto: LoginRequest,
    @Req() req: Request,
  ): Promise<AuthTokensResponse> {
    return this.auth.login(dto, requestMeta(req));
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(RefreshRequestSchema)) dto: RefreshRequest,
    @Req() req: Request,
  ): Promise<AuthTokensResponse> {
    return this.auth.refresh(dto, requestMeta(req));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(LogoutRequestSchema)) dto: LogoutRequest,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}

function requestMeta(req: Request): RequestMeta {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ipAddress: req.ip ?? null,
  };
}
