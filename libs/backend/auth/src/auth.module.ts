import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '@eos/database';
import { AUTH } from '@eos/shared-constants';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AvatarController } from './avatar.controller.js';
import { AvatarService } from './avatar.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: AUTH.ACCESS_TOKEN_TTL_SECONDS },
    }),
  ],
  controllers: [AuthController, AvatarController],
  providers: [AuthService, AvatarService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
