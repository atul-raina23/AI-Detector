import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OrganizationRepository,
  RefreshTokenRepository,
  UserRepository,
  type RefreshToken,
  type User,
} from '@eos/database';
import { UserStatus } from '@eos/shared-enums';
import { AUTH } from '@eos/shared-constants';
import type {
  AuthTokensResponse,
  LoginRequest,
  RefreshRequest,
  SignupRequest,
} from '@eos/contracts';
import { hashPassword, verifyPassword } from './password.util.js';
import { addSeconds, generateRefreshToken, hashToken } from './token.util.js';
import type { JwtPayload, RequestMeta } from './jwt-payload.type.js';

/** Generic message for every credential failure — never reveals which part was wrong (docs/06). */
const INVALID_CREDENTIALS = 'Invalid organization, email, or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly jwt: JwtService,
  ) {}

  async signup(dto: SignupRequest, meta: RequestMeta): Promise<AuthTokensResponse> {
    const existing = await this.organizations.findBySlug(dto.organizationSlug);
    if (existing) {
      throw new ConflictException('Organization slug already taken');
    }

    const organization = await this.organizations.create({
      name: dto.organizationName,
      slug: dto.organizationSlug,
    });
    const passwordHash = await hashPassword(dto.password);
    const user = await this.users.createForTenant(organization.id, {
      email: dto.email.toLowerCase(),
      name: dto.name,
      passwordHash,
      status: UserStatus.Active,
    });

    return this.issueTokenPair(user, meta);
  }

  async login(dto: LoginRequest, meta: RequestMeta): Promise<AuthTokensResponse> {
    const organization = await this.organizations.findBySlug(dto.organizationSlug);
    if (!organization) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = await this.users.findByEmailInTenant(organization.id, dto.email);
    if (!user || !user.passwordHash || user.status !== UserStatus.Active) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const valid = await verifyPassword(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.issueTokenPair(user, meta);
  }

  async refresh(dto: RefreshRequest, meta: RequestMeta): Promise<AuthTokensResponse> {
    const presentedHash = hashToken(dto.refreshToken);
    const stored = await this.refreshTokens.findByTokenHash(presentedHash);
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Reuse of an already-rotated token: likely theft. Kill the whole
      // family so a stolen token can't be replayed (docs/01 FR-AUTH-03).
      this.logger.warn(
        `Refresh token reuse detected for family ${stored.familyId} (org ${stored.organizationId}) — revoking family`,
      );
      await this.refreshTokens.revokeFamily(stored.organizationId, stored.familyId);
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.users.findByIdForTenant(stored.organizationId, stored.userId);
    if (!user || user.status !== UserStatus.Active) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokenPair(user, meta, stored);
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByTokenHash(hashToken(refreshToken));
    if (stored && !stored.revokedAt) {
      await this.refreshTokens.revokeById(stored.organizationId, stored.id);
    }
  }

  private async issueTokenPair(
    user: User,
    meta: RequestMeta,
    rotatingFrom?: RefreshToken,
  ): Promise<AuthTokensResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      org: user.organizationId,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload);

    const rawRefreshToken = generateRefreshToken();
    const issued = await this.refreshTokens.issue({
      organizationId: user.organizationId,
      userId: user.id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: addSeconds(new Date(), AUTH.REFRESH_TOKEN_TTL_SECONDS),
      familyId: rotatingFrom?.familyId,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    });

    if (rotatingFrom) {
      await this.refreshTokens.markReplaced(rotatingFrom, issued.id);
    }

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresInSeconds: AUTH.ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
      },
    };
  }
}
