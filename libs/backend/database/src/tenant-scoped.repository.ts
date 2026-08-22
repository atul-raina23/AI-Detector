import type {
  Attributes,
  CreationAttributes,
  FindOptions,
  ModelStatic,
  WhereOptions,
} from 'sequelize';
import type { TenantModel } from './models/tenant.model.js';

/**
 * Base for repositories over tenant-owned tables. `organizationId` is a
 * required parameter on every method — not an ambient/global scope — so a
 * caller can never construct a query that forgets it (docs/04 §1, NFR-ISO).
 */
export abstract class TenantScopedRepository<M extends TenantModel> {
  protected constructor(protected readonly model: ModelStatic<M>) {}

  findAllForTenant(
    organizationId: string,
    options: FindOptions<Attributes<M>> = {},
  ): Promise<M[]> {
    return this.model.findAll({
      ...options,
      where: this.scoped(organizationId, options.where),
    });
  }

  findByIdForTenant(organizationId: string, id: string): Promise<M | null> {
    return this.model.findOne({
      where: this.scoped(
        organizationId,
        { id } as unknown as WhereOptions<Attributes<M>>,
      ),
    });
  }

  createForTenant(
    organizationId: string,
    attrs: Omit<CreationAttributes<M>, 'organizationId'>,
  ): Promise<M> {
    return this.model.create({
      ...attrs,
      organizationId,
    } as unknown as CreationAttributes<M>);
  }

  private scoped(
    organizationId: string,
    where: WhereOptions<Attributes<M>> = {},
  ): WhereOptions<Attributes<M>> {
    return { ...where, organizationId } as unknown as WhereOptions<
      Attributes<M>
    >;
  }
}
