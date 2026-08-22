import { uuid7 } from '@eos/shared-utils';
import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Base for every model, tenant-scoped or not: a time-sortable UUIDv7 PK
 * (index-friendly, per docs/04 §9) plus managed timestamps.
 */
export abstract class BaseModel<
  TModelAttributes extends object = object,
  TCreationAttributes extends object = TModelAttributes,
> extends Model<TModelAttributes, TCreationAttributes> {
  @PrimaryKey
  @Default(uuid7)
  @Column(DataType.UUID)
  declare id: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
