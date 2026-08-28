import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { TenantScopedRepository } from '../tenant-scoped.repository.js';
import { User } from '../models/user.model.js';

@Injectable()
export class UserRepository extends TenantScopedRepository<User> {
  constructor(@InjectModel(User) model: typeof User) {
    super(model);
  }

  /** Email is unique per-org, not globally (docs/04 §3) — org id is required. */
  findByEmailInTenant(
    organizationId: string,
    email: string,
  ): Promise<User | null> {
    return this.model.findOne({
      where: { organizationId, email: email.toLowerCase() },
    });
  }

  async setAvatarUrl(
    organizationId: string,
    userId: string,
    avatarUrl: string,
  ): Promise<void> {
    await this.model.update(
      { avatarUrl },
      { where: { organizationId, id: userId } },
    );
  }
}
