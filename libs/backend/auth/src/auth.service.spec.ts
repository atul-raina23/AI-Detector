import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@eos/shared-enums';
import type {
  OrganizationRepository,
  RefreshToken,
  RefreshTokenRepository,
  User,
  UserRepository,
} from '@eos/database';
import { AuthService } from './auth.service.js';
import { hashToken } from './token.util.js';

/**
 * In-memory fakes standing in for the repository ports (docs/09 §"unit
 * tests"). Casts through `unknown` are limited to test doubles for classes
 * that carry a protected `model` field — never used in production code.
 */
function createFakeRefreshTokenStore() {
  const rows = new Map<string, RefreshToken>();
  let counter = 0;

  const repo = {
    findByTokenHash: async (tokenHash: string) =>
      [...rows.values()].find((r) => r.tokenHash === tokenHash) ?? null,
    issue: async (input: {
      organizationId: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      familyId?: string;
    }) => {
      const id = `rt_${++counter}`;
      const row = {
        id,
        organizationId: input.organizationId,
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId ?? `fam_${id}`,
        expiresAt: input.expiresAt,
        revokedAt: null as Date | null,
        replacedById: null as string | null,
        update: async (patch: Partial<RefreshToken>) =>
          Object.assign(row, patch),
      } as unknown as RefreshToken;
      rows.set(id, row);
      return row;
    },
    markReplaced: async (previous: RefreshToken, newTokenId: string) => {
      const row = rows.get(previous.id) as unknown as {
        revokedAt: Date | null;
        replacedById: string | null;
      };
      row.revokedAt = new Date();
      row.replacedById = newTokenId;
    },
    revokeFamily: async (organizationId: string, familyId: string) => {
      for (const row of rows.values()) {
        if (row.organizationId === organizationId && row.familyId === familyId && !row.revokedAt) {
          (row as unknown as { revokedAt: Date }).revokedAt = new Date();
        }
      }
    },
    revokeById: async (organizationId: string, id: string) => {
      const row = rows.get(id);
      if (row && row.organizationId === organizationId) {
        (row as unknown as { revokedAt: Date }).revokedAt = new Date();
      }
    },
  };

  return repo as unknown as RefreshTokenRepository;
}

function createFakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    organizationId: 'org_1',
    email: 'dev@acme.test',
    name: 'Dev',
    passwordHash: 'irrelevant-for-this-test',
    status: UserStatus.Active,
    ...overrides,
  } as unknown as User;
}

describe('AuthService refresh token rotation', () => {
  let refreshTokens: RefreshTokenRepository;
  let service: AuthService;
  const user = createFakeUser();

  beforeEach(() => {
    refreshTokens = createFakeRefreshTokenStore();

    const users = {
      findByIdForTenant: async (organizationId: string, id: string) =>
        organizationId === user.organizationId && id === user.id ? user : null,
    } as unknown as UserRepository;

    const organizations = {} as unknown as OrganizationRepository;
    const jwt = new JwtService({ secret: 'test-secret' });

    service = new AuthService(organizations, users, refreshTokens, jwt);
  });

  it('rotates on each legitimate refresh: every issued token differs and stays usable in sequence', async () => {
    const first = await service['issueTokenPair'](user, {});

    const second = await service.refresh(
      { refreshToken: first.refreshToken },
      {},
    );
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Continuing the chain with the latest token (not replaying `first`,
    // which would be a reuse attempt — see the dedicated test below).
    const third = await service.refresh(
      { refreshToken: second.refreshToken },
      {},
    );
    expect(third.refreshToken).not.toBe(second.refreshToken);
    expect(third.accessToken).toBeTruthy();
  });

  it('reuse detection: presenting an already-rotated token revokes the whole family', async () => {
    const first = await service['issueTokenPair'](user, {});
    const second = await service.refresh(
      { refreshToken: first.refreshToken },
      {},
    );

    // Attacker replays the stolen, already-rotated first token.
    await expect(
      service.refresh({ refreshToken: first.refreshToken }, {}),
    ).rejects.toThrow(/reuse detected/i);

    // The legitimate second token — same family — must now ALSO be dead.
    await expect(
      service.refresh({ refreshToken: second.refreshToken }, {}),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a refresh token that was never issued', async () => {
    await expect(
      service.refresh({ refreshToken: 'not-a-real-token-at-all-000000' }, {}),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('stores only the hash, never the raw refresh token', async () => {
    const { refreshToken } = await service['issueTokenPair'](user, {});
    const stored = await refreshTokens.findByTokenHash(hashToken(refreshToken));
    expect(stored).toBeTruthy();
    expect(stored?.tokenHash).not.toBe(refreshToken);
  });
});
