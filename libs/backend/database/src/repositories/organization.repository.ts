import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Organization } from '../models/organization.model.js';

/** Organization is the tenant root — not itself tenant-scoped (docs/04 §1). */
@Injectable()
export class OrganizationRepository {
  constructor(
    @InjectModel(Organization) private readonly model: typeof Organization,
  ) {}

  findBySlug(slug: string): Promise<Organization | null> {
    return this.model.findOne({ where: { slug } });
  }

  findById(id: string): Promise<Organization | null> {
    return this.model.findByPk(id);
  }

  create(attrs: { name: string; slug: string }): Promise<Organization> {
    return this.model.create(attrs);
  }
}
