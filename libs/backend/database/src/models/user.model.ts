import { UserStatus } from '@eos/shared-enums';
import { Column, DataType, Default, Table } from 'sequelize-typescript';
import { TenantModel } from './tenant.model.js';

export interface UserAttributes {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string | null;
  name: string;
  status: UserStatus;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserCreationAttributes = Pick<
  UserAttributes,
  'organizationId' | 'email' | 'name'
> &
  Partial<Pick<UserAttributes, 'passwordHash' | 'status' | 'avatarUrl'>>;

/**
 * An employee/person within an org (docs/04 §3). Email is unique per
 * organization, not globally — see the composite index below.
 */
@Table({
  tableName: 'users',
  indexes: [{ unique: true, fields: ['organization_id', 'email'] }],
})
export class User extends TenantModel<UserAttributes, UserCreationAttributes> {
  @Column(DataType.STRING(320))
  declare email: string;

  /** argon2id hash; null for users who have only ever used OAuth (docs/06). */
  @Column(DataType.STRING(255))
  declare passwordHash: string | null;

  @Column(DataType.STRING(200))
  declare name: string;

  @Default(UserStatus.Invited)
  @Column(DataType.ENUM(...Object.values(UserStatus)))
  declare status: UserStatus;

  /** Cloudinary secure_url for the user's uploaded avatar, if any. */
  @Column(DataType.STRING(500))
  declare avatarUrl: string | null;
}
