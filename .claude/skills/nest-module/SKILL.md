---
name: nest-module
description: Scaffold a NestJS feature module in apps/api (or a backend lib) with the repo's thin controller / service / repository / zod-DTO / tests structure, tenant scoping, and RBAC guards. Use when adding any backend feature.
---

# New NestJS Feature Module

References: [docs/08 coding standards](../../../docs/08-coding-standards.md),
[docs/04 data model](../../../docs/04-data-model.md), [docs/05 API](../../../docs/05-api-and-realtime.md).
Keep every file small and single-purpose.

## Layout (one concern per file)

```
<feature>/
├─ <feature>.module.ts          # wires providers; binds interface tokens → impls
├─ <feature>.controller.ts      # HTTP only: validate (zod) → call service → map DTO
├─ <feature>.service.ts         # domain logic; depends on repo INTERFACE + ports
├─ <feature>.repository.ts      # Sequelize persistence; ALWAYS tenant-scoped
├─ <feature>.repository.port.ts # interface the service depends on (enables cycle-free DI + fakes)
├─ dto/                         # request/response types re-exported from @eos/contracts (zod)
└─ *.spec.ts                    # unit (mock repo) + integration (Testcontainers)
```

## Rules

- **Controller** does no business logic and never touches Sequelize. It applies
  `@RequirePermission('<resource>:<action>')` (RBAC, doc 02) and validates the body against a zod
  schema from `@eos/contracts`.
- **Service** depends on the repository **port interface** (injected by token), plus any other ports
  (event bus, other features' service interfaces). Never import another feature's model or concrete class.
- **Repository** extends the tenant-scoped base; every query is scoped by `organizationId` from
  `TenantContext` (doc 04 §5/§9). Returns domain types from `@eos/shared-types`, not raw models.
- Emitting state changes? Publish a canonical `DomainEvent` (add the `EventType` to `@eos/shared-enums`)
  via the event bus port — don't call other modules directly.
- New endpoints → add zod request/response schemas to `@eos/contracts` first (contract-first).

## Steps

1. If it's a reusable domain, generate a backend lib (see the `nx-library` skill); otherwise create the
   folder under `apps/api/src/modules/<feature>/`.
2. Add contracts to `@eos/contracts`; add any enums/constants to their shared libs.
3. Write repository port + Sequelize repo (+ migration via `sequelize-migration` skill).
4. Write service against the port; write controller.
5. Register in the module; bind `{ provide: FEATURE_REPO, useClass: FeatureRepository }`.
6. Tests: unit (service with a fake repo), integration (repo tenant-isolation + endpoint via Supertest).
7. `nx lint <project>` + `nx test <project>`; confirm no cross-boundary import.

## Checklist

- [ ] Controller thin, guarded, zod-validated; no DB in controller.
- [ ] Service depends on interfaces only; no cross-feature/model imports.
- [ ] Repo tenant-scoped; migration written; no `sequelize.sync()`.
- [ ] Contracts in `@eos/contracts`; enums/constants in shared libs.
- [ ] Unit + integration tests incl. a cross-tenant negative test.
