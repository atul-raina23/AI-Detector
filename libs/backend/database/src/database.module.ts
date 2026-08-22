import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { buildSequelizeOptions } from './database.config.js';
import { ALL_MODELS } from './models/index.js';
import { OrganizationRepository } from './repositories/organization.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { RefreshTokenRepository } from './repositories/refresh-token.repository.js';

const REPOSITORIES = [
  OrganizationRepository,
  UserRepository,
  RefreshTokenRepository,
];

/**
 * Sole owner of the Sequelize connection + model registration. Other
 * modules never import a model directly — they inject a repository
 * exported here (docs/03 §6, docs/04 §9).
 *
 * Uses `forRootAsync` (not `forRoot`) so `buildSequelizeOptions()` — which
 * throws if `DATABASE_URL` is unset — only runs when Nest actually
 * bootstraps this module, not merely when a file imports `@eos/database`.
 * That keeps plain unit tests (which never boot a Nest app) free of any
 * database dependency.
 */
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      useFactory: () => ({
        ...buildSequelizeOptions(),
        models: [...ALL_MODELS],
        autoLoadModels: false,
      }),
    }),
    SequelizeModule.forFeature([...ALL_MODELS]),
  ],
  providers: [...REPOSITORIES],
  exports: [SequelizeModule, ...REPOSITORIES],
})
export class DatabaseModule {}
