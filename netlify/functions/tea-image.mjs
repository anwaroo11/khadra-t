// GET /api/image/:kind/:name — صور الشاي المرفوعة من لوحة التحكم.
import { getStore } from '@netlify/blobs';
import { createApi } from '../lib/khadra-api.mjs';

export default async (request, context) => createApi({
  catalogStore: getStore({ name: 'khadra-catalog', consistency: 'strong' }),
  imageStore: getStore('khadra-images')
}).image(request, context.params?.kind, context.params?.name);

export const config = { path: '/api/image/:kind/:name' };
