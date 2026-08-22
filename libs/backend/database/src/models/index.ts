export * from './base.model.js';
export * from './tenant.model.js';
export * from './organization.model.js';
export * from './user.model.js';
export * from './refresh-token.model.js';

import { Organization } from './organization.model.js';
import { User } from './user.model.js';
import { RefreshToken } from './refresh-token.model.js';

/** Every model, for Sequelize registration (database.module.ts, migrate.ts). */
export const ALL_MODELS = [Organization, User, RefreshToken] as const;
