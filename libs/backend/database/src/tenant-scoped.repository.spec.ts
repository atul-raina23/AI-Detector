import { TenantScopedRepository } from './tenant-scoped.repository.js';
import type { TenantModel } from './models/tenant.model.js';

/** Concrete subclass — TenantScopedRepository itself is abstract. */
class FakeRepository extends TenantScopedRepository<
  TenantModel & { id: string; organizationId: string; name?: string }
> {
  constructor(model: unknown) {
    super(model as never);
  }
}

describe('TenantScopedRepository', () => {
  const ORG_A = 'org-a';
  const ORG_B = 'org-b';

  function createRepo() {
    const calls: { method: string; args: unknown[] }[] = [];
    const model = {
      findAll: (...args: unknown[]) => {
        calls.push({ method: 'findAll', args });
        return Promise.resolve([]);
      },
      findOne: (...args: unknown[]) => {
        calls.push({ method: 'findOne', args });
        return Promise.resolve(null);
      },
      create: (...args: unknown[]) => {
        calls.push({ method: 'create', args });
        return Promise.resolve({});
      },
    };
    return { repo: new FakeRepository(model), calls };
  }

  it('injects organizationId into findAllForTenant even when other where clauses are passed', async () => {
    const { repo, calls } = createRepo();
    await repo.findAllForTenant(ORG_A, { where: { name: 'x' } as never });

    const [{ args }] = calls;
    const options = args[0] as { where: Record<string, unknown> };
    expect(options.where).toMatchObject({ name: 'x', organizationId: ORG_A });
  });

  it('never lets a caller override organizationId with a different tenant', async () => {
    const { repo, calls } = createRepo();
    // Even if a caller mistakenly passes another org's id in `where`,
    // the repository's own organizationId argument wins (spread order).
    await repo.findAllForTenant(ORG_A, {
      where: { organizationId: ORG_B } as never,
    });

    const [{ args }] = calls;
    const options = args[0] as { where: Record<string, unknown> };
    expect(options.where['organizationId']).toBe(ORG_A);
  });

  it('scopes findByIdForTenant by both id and organizationId', async () => {
    const { repo, calls } = createRepo();
    await repo.findByIdForTenant(ORG_A, 'row-1');

    const [{ args }] = calls;
    const options = args[0] as { where: Record<string, unknown> };
    expect(options.where).toEqual({ id: 'row-1', organizationId: ORG_A });
  });

  it('stamps organizationId on createForTenant regardless of input attrs', async () => {
    const { repo, calls } = createRepo();
    await repo.createForTenant(ORG_A, { name: 'new row' } as never);

    const [{ args }] = calls;
    const attrs = args[0] as Record<string, unknown>;
    expect(attrs).toMatchObject({ name: 'new row', organizationId: ORG_A });
  });
});
