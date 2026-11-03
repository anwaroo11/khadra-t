// GET /api/catalog — كتالوج الشاي المحفوظ من لوحة التحكم.
import { getStore } from '@netlify/blobs';
import { createApi } from '../lib/khadra-api.mjs';

export default async (request) => createApi({
  catalogStore: getStore({ name: 'khadra-catalog', consistency: 'strong' }),
  imageStore: getStore('khadra-images')
}).publicCatalog(request);

export const config = { path: '/api/catalog' };
