import { Injectable } from '@nestjs/common';
import { configureCloudinary } from '@eos/backend-core';
import { UserRepository } from '@eos/database';

@Injectable()
export class AvatarService {
  constructor(private readonly users: UserRepository) {}

  /**
   * Uploads a source image to Cloudinary and stores the resulting
   * secure_url on the user (tenant-scoped write via UserRepository).
   */
  async uploadFromUrl(
    organizationId: string,
    userId: string,
    imageUrl: string,
  ): Promise<string> {
    const cloudinary = configureCloudinary();
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'avatars',
      public_id: userId,
      overwrite: true,
    });

    await this.users.setAvatarUrl(organizationId, userId, result.secure_url);
    return result.secure_url;
  }
}
