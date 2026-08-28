import { v2 as cloudinary, type ConfigOptions } from 'cloudinary';

/**
 * Thin, typed wrapper around the Cloudinary SDK config. Kept here (not in a
 * feature lib) so every backend feature that needs image storage configures
 * it the same way — see docs/10 (shared infra belongs at the lowest layer
 * that needs it).
 */
export interface CloudinaryEnv {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function readCloudinaryEnv(): CloudinaryEnv {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Missing Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET',
    );
  }
  return { cloudName, apiKey, apiSecret };
}

/** Configures the global Cloudinary SDK instance and returns it. Call once at startup. */
export function configureCloudinary(
  env: CloudinaryEnv = readCloudinaryEnv(),
): typeof cloudinary {
  const options: ConfigOptions = {
    cloud_name: env.cloudName,
    api_key: env.apiKey,
    api_secret: env.apiSecret,
    secure: true,
  };
  cloudinary.config(options);
  return cloudinary;
}
