import { BelongsTo, Column, DataType, ForeignKey } from 'sequelize-typescript';
import { BaseModel } from './base.model.js';
import { Organization } from './organization.model.js';

/**
 * Base for every tenant-owned table (docs/04 §1). `organizationId` is
 * mandatory and non-null — repositories built on `TenantScopedRepository`
 * (see tenant-scoped.repository.ts) require it on every query, so a caller
 * can never accidentally construct a cross-tenant read (NFR-ISO).
 */
export abstract class TenantModel<
  TModelAttributes extends object = object,
  TCreationAttributes extends object = TModelAttributes,
> extends BaseModel<TModelAttributes, TCreationAttributes> {
  @ForeignKey(() => Organization)
  @Column(DataType.UUID)
  declare organizationId: string;

  @BelongsTo(() => Organization)
  declare organization?: Organization;
}
