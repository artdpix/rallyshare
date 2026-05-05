import { isAbsolute, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../..');

const rawMediaRoot = process.env.MEDIA_ROOT ?? './media';
export const MEDIA_ROOT = isAbsolute(rawMediaRoot)
  ? rawMediaRoot
  : resolve(REPO_ROOT, rawMediaRoot);

export const IP_HASH_SALT = process.env.IP_HASH_SALT ?? 'dev-salt-change-me';

export const MAX_UPLOAD_BYTES = Number(
  process.env.MAX_UPLOAD_BYTES ?? 250 * 1024 * 1024,
);

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
