import { uuid7 } from '@eos/shared-utils';
import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Table,
} from 'sequelize-typescript';
import { TenantModel } from './tenant.model.js';
import { User } from './user.model.js';

export interface RefreshTokenAttributes {
  id: string;
  organizationId: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  replacedById: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RefreshTokenCreationAttributes = Pick<
  RefreshTokenAttributes,
  'organizationId' | 'userId' | 'tokenHash' | 'expiresAt'
> &
  Partial<
    Pick<
      RefreshTokenAttributes,
      'familyId' | 'userAgent' | 'ipAddress' | 'replacedById'
    >
  >;

/**
 * A single refresh-token *issuance*. Never stores the raw token — only its
 * SHA-256 hash (docs/01 FR-AUTH-03, docs/06). Tokens are chained by
 * `familyId`: rotating a token creates a new row in the same family and
 * marks the old one `revokedAt` + `replacedById`. Presenting an
 * already-revoked token is a reuse signal — the auth service responds by
 * revoking the whole family (see auth.service.ts `refresh()`).
 */
@Table({
  tableName: 'refresh_tokens',
  indexes: [
    { unique: true, fields: ['token_hash'] },
    { fields: ['organization_id', 'user_id'] },
    { fields: ['family_id'] },
  ],
})
export class RefreshToken extends TenantModel<
  RefreshTokenAttributes,
  RefreshTokenCreationAttributes
> {
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Default(uuid7)
  @Column(DataType.UUID)
  declare familyId: string;

  @Column(DataType.STRING(64))
  declare tokenHash: string;

  @ForeignKey(() => RefreshToken)
  @Column(DataType.UUID)
  declare replacedById: string | null;

  @Column(DataType.DATE)
  declare revokedAt: Date | null;

  @Column(DataType.DATE)
  declare expiresAt: Date;

  @Column(DataType.STRING(500))
  declare userAgent: string | null;

  @Column(DataType.STRING(64))
  declare ipAddress: string | null;
}
