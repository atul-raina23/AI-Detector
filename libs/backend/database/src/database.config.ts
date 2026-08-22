import type { SequelizeModuleOptions } from '@nestjs/sequelize';

/**
 * Single source of truth for connecting to Postgres. Reads DATABASE_URL
 * (see .env.example) so the same config works for the app, migrations, and
 * tests — no config drift between them.
 */
export function buildSequelizeOptions(
  env: NodeJS.ProcessEnv = process.env,
): SequelizeModuleOptions {
  const uri = env.DATABASE_URL;
  if (!uri) {
    throw new Error('DATABASE_URL is required (see .env.example)');
  }

  return {
    dialect: 'postgres',
    uri,
    ssl: env.DB_SSL === 'true',
    dialectOptions:
      env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {},
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  };
}
