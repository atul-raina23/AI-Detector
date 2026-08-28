import { z } from 'zod';

/**
 * Wire contract for the avatar-upload endpoint (stacked on the Cloudinary
 * config + avatarUrl schema PRs). Shared between the NestJS controller and
 * the React client — no drift (docs/05).
 */

export const AvatarUploadRequestSchema = z.object({
  /** A publicly reachable image URL; Cloudinary fetches and re-hosts it. */
  imageUrl: z.url().max(2000),
});
export type AvatarUploadRequest = z.infer<typeof AvatarUploadRequestSchema>;

export const AvatarUploadResponseSchema = z.object({
  avatarUrl: z.url(),
});
export type AvatarUploadResponse = z.infer<typeof AvatarUploadResponseSchema>;
