import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { buildSequelizeOptions } from './database.config.js';

/**
 * Migration CLI — the only sanctioned way the schema changes in any shared
 * environment (docs/04 §9, docs/08). Run with tsx (see package.json scripts):
 *   npx tsx libs/backend/database/src/migrate.ts up
 *   npx tsx libs/backend/database/src/migrate.ts down   (reverts the last one)
 */
const { uri, ...options } = buildSequelizeOptions();
const sequelize = new Sequelize(uri as string, options);

const umzug = new Umzug({
  migrations: {
    glob: ['migrations/*.ts', { cwd: import.meta.dirname }],
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
  logger: console,
});

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';
  if (command === 'up') {
    await umzug.up();
  } else if (command === 'down') {
    await umzug.down();
  } else {
    throw new Error(`Unknown migrate command: ${command} (expected up|down)`);
  }
  await sequelize.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
