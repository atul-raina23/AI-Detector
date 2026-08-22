import { DataTypes } from 'sequelize';
import type { MigrationParams } from '../migration.types.js';

export async function up({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.createTable('refresh_tokens', {
    id: { type: DataTypes.UUID, primaryKey: true },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    family_id: { type: DataTypes.UUID, allowNull: false },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    replaced_by_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'refresh_tokens', key: 'id' },
      onDelete: 'SET NULL',
    },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    user_agent: { type: DataTypes.STRING(500), allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('refresh_tokens', ['organization_id', 'user_id'], {
    name: 'refresh_tokens_org_user_idx',
  });
  await queryInterface.addIndex('refresh_tokens', ['family_id'], {
    name: 'refresh_tokens_family_idx',
  });
}

export async function down({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.dropTable('refresh_tokens');
}
