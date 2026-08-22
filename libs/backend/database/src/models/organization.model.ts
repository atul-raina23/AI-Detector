import { Column, DataType, Table, Unique } from 'sequelize-typescript';
import { BaseModel } from './base.model.js';

export interface OrganizationAttributes {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationCreationAttributes = Pick<
  OrganizationAttributes,
  'name' | 'slug'
>;

/** The tenant root (docs/04 §1). Not itself tenant-scoped. */
@Table({ tableName: 'organizations' })
export class Organization extends BaseModel<
  OrganizationAttributes,
  OrganizationCreationAttributes
> {
  @Column(DataType.STRING(200))
  declare name: string;

  @Unique
  @Column(DataType.STRING(100))
  declare slug: string;
}
