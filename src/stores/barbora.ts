import axios from 'axios';
import type { Product } from '../types.js';

const SEARCH_URL = 'https://barbora.ee/api/eshop/v1/search';

interface BarboraApiProduct {
  title?: string;
  price?: number;
  comparative_unit?: string;
  comparative_unit_price?: number;
  Url?: string;
}

/**
 * Search Barbora and normalize results to shared Product shape.
 */
export async function searchBarbora(query: string, limit = 5): Promise<Product[]> {
  const { data } = await axios.get(SEARCH_URL, {
    params: {
      query,
      limit,
      offset: 0,
    },
    timeout: 12_000,
    headers: {
      'User-Agent': 'grocery-compare/1.0 (educational project)',
      Accept: 'application/json',
    },
  });

  const products: BarboraApiProduct[] = Array.isArray(data?.products) ? data.products : [];

  return products
    .map((p) => {
      const name = (p.title ?? '').trim();
      const price = typeof p.price === 'number' ? p.price : 0;
      const unit = p.comparative_unit ?? '';
      const unitPrice = typeof p.comparative_unit_price === 'number'
        ? `${p.comparative_unit_price.toFixed(2)} €/${unit || 'tk'}`
        : '';
      const slug = p.Url ?? '';
      const url = slug ? `https://barbora.ee/toode/${slug}` : 'https://barbora.ee';

      return {
        name,
        price,
        unitPrice,
        url,
        store: 'Barbora' as const,
      };
    })
    .filter((p) => p.price > 0 && p.name.length > 0)
    .slice(0, limit);
}
