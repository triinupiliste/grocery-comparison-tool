/**
 * Selver scraper
 *
 * Selver exposes a public Elasticsearch endpoint (Vue Storefront) that returns
 * clean JSON – no authentication required.
 *
 * Endpoint:
 *   GET https://www.selver.ee/api/catalog/vue_storefront_catalog_et/product/_search
 *   ?q=<query>&size=<n>
 *
 * Key fields in _source:
 *   name                  – product display name
 *   final_price_incl_tax  – shelf price the customer pays (EUR incl. VAT)
 *   unit_price            – comparison price (e.g. per litre / kg)
 *   product_volume        – volume/weight string, e.g. "1,5 l"
 *   url_key               – slug used to build the product page URL
 */

import axios from 'axios';
import type { Product } from '../types.js';

const SEARCH_URL =
  'https://www.selver.ee/api/catalog/vue_storefront_catalog_et/product/_search';

export async function searchSelver(query: string, limit = 5): Promise<Product[]> {
  const { data } = await axios.get(SEARCH_URL, {
    params: { q: query, size: limit },
    timeout: 12_000,
    headers: {
      'User-Agent': 'grocery-compare/1.0 (educational project)',
      Accept: 'application/json',
    },
  });

  const hits: any[] = data?.hits?.hits ?? [];

  return hits
    .map((hit) => {
      const s = hit._source;
      const price: number = s.final_price_incl_tax ?? s.regular_price ?? 0;
      const rawUnitPrice: number | undefined = s.unit_price;

      return {
        name: s.name as string,
        price,
        unitPrice: rawUnitPrice ? `${rawUnitPrice.toFixed(2)} €/kg` : '',
        url: `https://www.selver.ee/${s.url_key}`,
        store: 'Selver' as const,
      };
    })
    .filter((p) => p.price > 0 && p.name.length > 0);
}
