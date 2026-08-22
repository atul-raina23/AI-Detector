---
name: nx-library
description: Create a new Nx library in this monorepo with the correct scope/type tags, @eos/* path mapping, and module-boundary constraints so it can never introduce a circular dependency. Use whenever adding a shared, backend, or frontend lib.
---

# New Nx Library

Reference: [docs/10-shared-packages-and-boundaries.md](../../../docs/10-shared-packages-and-boundaries.md).
Every lib must land in the right **layer** and carry **tags**, or the boundary linter can't protect us.

## 1. Pick the layer (lowest that satisfies the need)

| Need | Location | Package | Tags |
|------|----------|---------|------|
| Constant / threshold | `libs/shared/constants` | `@eos/shared-constants` | `scope:shared,type:const` |
| Enum (single source of truth) | `libs/shared/enums` | `@eos/shared-enums` | `scope:shared,type:enum` |
| Domain type/interface | `libs/shared/types` | `@eos/shared-types` | `scope:shared,type:types` |
| API/WS zod schema (FE↔BE contract) | `libs/shared/contracts` | `@eos/contracts` | `scope:shared,type:contract` |
| Pure helper | `libs/shared/utils` | `@eos/shared-utils` | `scope:shared,type:util` |
| Server infra (config/db/events) | `libs/backend/*` | `@eos/backend-*` / `@eos/database` | `scope:backend,type:infra` |
| Server feature | `libs/backend/<name>` | `@eos/<name>` | `scope:backend,type:feature` |
| UI component | `libs/frontend/ui` | `@eos/ui` | `scope:frontend,type:ui` |
| FE data hooks | `libs/frontend/data` | `@eos/frontend-data` | `scope:frontend,type:data` |

**Rule:** `shared/*` imports nothing internal. `frontend` ↮ `backend`. Siblings in a layer don't import
each other. Apps are the only composition roots.

## 2. Generate

```bash
# JS/TS lib (shared/*, backend infra)
npx nx g @nx/js:lib <name> --directory=libs/shared/<name> --importPath=@eos/<name> --unitTestRunner=vitest --tags=scope:shared,type:util
# NestJS backend feature lib
npx nx g @nx/nest:lib <name> --directory=libs/backend/<name> --importPath=@eos/<name> --tags=scope:backend,type:feature
# React UI lib
npx nx g @nx/react:lib <name> --directory=libs/frontend/<name> --importPath=@eos/<name> --tags=scope:frontend,type:ui
```

## 3. Wire & verify

1. Confirm `tsconfig.base.json` got the `@eos/<name>` path mapping (generator adds it).
2. Set the correct `tags` in the lib's `project.json` (double-check against the table).
3. Confirm the root ESLint `depConstraints` already forbids bad edges for your tags (see doc 10). If a
   genuinely new tag was introduced, add its allowed edges — never widen `scope:shared`.
4. **Verify no cycle before committing:**
   ```bash
   npx nx lint <name>            # enforces module boundaries
   npx nx graph                  # eyeball the DAG
   npx madge --circular --extensions ts libs apps
   ```

## Checklist

- [ ] Lowest-layer placement; symbol didn't belong in an existing lib.
- [ ] Tags set; path mapping present; import is `@eos/<name>`.
- [ ] No up-import; `nx lint` + `madge --circular` clean.
- [ ] One responsibility per lib; keep it small.
