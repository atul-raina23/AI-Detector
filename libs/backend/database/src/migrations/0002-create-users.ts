import { DataTypes } from 'sequelize';
import { UserStatus } from '@eos/shared-enums';
import type { MigrationParams } from '../migration.types.js';

export async function up({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.createTable('users', {
    id: { type: DataTypes.UUID, primaryKey: true },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'CASCADE',
    },
    email: { type: DataTypes.STRING(320), allowNull: false },
    password_hash: { type: DataTypes.STRING(255), allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(UserStatus)),
      allowNull: false,
      defaultValue: UserStatus.Invited,
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('users', ['organization_id', 'email'], {
    unique: true,
    name: 'users_organization_id_email_unique',
  });
}

export async function down({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.dropTable('users');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_status";');
}
