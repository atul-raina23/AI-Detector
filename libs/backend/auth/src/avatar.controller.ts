import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@eos/backend-core';
import {
  AvatarUploadRequestSchema,
  type AvatarUploadRequest,
  type AvatarUploadResponse,
} from '@eos/contracts';
import type { AuthPrincipal } from '@eos/shared-types';
import { AvatarService } from './avatar.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('v1/users/me')
@UseGuards(JwtAuthGuard)
export class AvatarController {
  constructor(private readonly avatar: AvatarService) {}

  @Post('avatar')
  async upload(
    @Body(new ZodValidationPipe(AvatarUploadRequestSchema)) dto: AvatarUploadRequest,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<AvatarUploadResponse> {
    const avatarUrl = await this.avatar.uploadFromUrl(
      principal.organizationId,
      principal.userId,
      dto.imageUrl,
    );
    return { avatarUrl };
  }
}
