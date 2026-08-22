import { DataTypes } from 'sequelize';
import type { MigrationParams } from '../migration.types.js';

export async function up({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.createTable('organizations', {
    id: { type: DataTypes.UUID, primaryKey: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.dropTable('organizations');
}
