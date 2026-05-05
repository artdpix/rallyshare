import { isAbsolute, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../..');

const rawMediaRoot = process.env.MEDIA_ROOT ?? './media';
export const MEDIA_ROOT = isAbsolute(rawMediaRoot)
  ? rawMediaRoot
  : resolve(REPO_ROOT, rawMediaRoot);

export const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);
