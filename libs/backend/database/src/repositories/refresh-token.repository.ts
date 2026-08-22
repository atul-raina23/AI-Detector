import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { TenantScopedRepository } from '../tenant-scoped.repository.js';
import { RefreshToken } from '../models/refresh-token.model.js';

export interface IssueRefreshTokenInput {
  organizationId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  familyId?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

@Injectable()
export class RefreshTokenRepository extends TenantScopedRepository<RefreshToken> {
  constructor(@InjectModel(RefreshToken) model: typeof RefreshToken) {
    super(model);
  }

  /**
   * Point lookup by the token's hash. Safe without an organizationId filter:
   * `tokenHash` carries a unique index over a 256-bit random secret, so this
   * is a credential lookup (like "find the row with this exact key"), not a
   * listing query — it cannot return another tenant's rows. The caller MUST
   * treat the returned row's `organizationId`/`userId` as authoritative.
   */
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.model.findOne({ where: { tokenHash } });
  }

  issue(input: IssueRefreshTokenInput): Promise<RefreshToken> {
    return this.model.create({
      organizationId: input.organizationId,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      ...(input.familyId ? { familyId: input.familyId } : {}),
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    });
  }

  /** Marks `previous` revoked + linked to the newly issued token (rotation). */
  async markReplaced(previous: RefreshToken, newTokenId: string): Promise<void> {
    await previous.update({ revokedAt: new Date(), replacedById: newTokenId });
  }

  /**
   * Revokes every non-revoked token in a family. Called when a token is
   * presented that was already rotated away — a reuse signal indicating the
   * token was likely stolen (docs/01 FR-AUTH-03).
   */
  async revokeFamily(organizationId: string, familyId: string): Promise<void> {
    await this.model.update(
      { revokedAt: new Date() },
      {
        where: {
          organizationId,
          familyId,
          revokedAt: { [Op.is]: null },
        },
      },
    );
  }

  async revokeById(organizationId: string, id: string): Promise<void> {
    await this.model.update(
      { revokedAt: new Date() },
      { where: { organizationId, id } },
    );
  }
}
