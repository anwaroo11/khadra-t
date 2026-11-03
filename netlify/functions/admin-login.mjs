// POST /api/admin/login — تسجيل الدخول بكلمة المرور (ADMIN_PASSWORD في إعدادات Netlify).
// محاولات محدودة لكل عنوان حتى ما يمكن تخمين كلمة المرور.
import { getStore } from '@netlify/blobs';
import { createApi } from '../lib/khadra-api.mjs';

export default async (request) => createApi({
  catalogStore: getStore({ name: 'khadra-catalog', consistency: 'strong' }),
  imageStore: getStore('khadra-images')
}).login(request);

export const config = {
  path: '/api/admin/login',
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
