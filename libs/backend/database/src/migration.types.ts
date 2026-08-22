import type { QueryInterface } from 'sequelize';

/** Shape Umzug passes to each migration's `up`/`down` (see migrate.ts). */
export interface MigrationParams {
  context: QueryInterface;
}
