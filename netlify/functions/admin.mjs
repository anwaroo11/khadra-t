// /api/admin/* — لوحة التحكم (تحتاج تسجيل دخول).
import { getStore } from '@netlify/blobs';
import { createApi } from '../lib/khadra-api.mjs';

export default async (request) => createApi({
  catalogStore: getStore({ name: 'khadra-catalog', consistency: 'strong' }),
  imageStore: getStore('khadra-images')
}).admin(request);

export const config = {
  path: ['/api/admin/session', '/api/admin/logout', '/api/admin/catalog', '/api/admin/history', '/api/admin/history/*', '/api/admin/image/*'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
