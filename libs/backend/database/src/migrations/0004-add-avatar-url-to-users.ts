import { DataTypes } from 'sequelize';
import type { MigrationParams } from '../migration.types.js';

export async function up({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.addColumn('users', 'avatar_url', {
    type: DataTypes.STRING(500),
    allowNull: true,
  });
}

export async function down({
  context: queryInterface,
}: MigrationParams): Promise<void> {
  await queryInterface.removeColumn('users', 'avatar_url');
}
