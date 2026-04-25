import { searchSelver } from './stores/selver.js';
import { searchBarbora } from './stores/barbora.js';
import { bestMatch } from './matcher.js';
import type { ComparisonRow, ComparisonSummary, Product } from './types.js';

/**
 * Search a single store and return the best matching product.
 * Returns null (and prints a warning) if the network call fails.
 */
async function searchOne(
  fn: (q: string) => Promise<Product[]>,
  query: string,
  storeName: string,
): Promise<Product | null> {
  try {
    const results = await fn(query);
    return bestMatch(query, results);
  } catch (err: any) {
    // Network / parse errors are non-fatal for a demo – we still show the
    // other store's result
    process.stderr.write(`  ⚠  ${storeName}: ${err.message}\n`);
    return null;
  }
}

/**
 * Compare prices for every item in `queries` across Selver and Barbora.
 * Searches are run in parallel per item (both stores at once).
 */
export async function compare(queries: string[]): Promise<ComparisonSummary> {
  const rows: ComparisonRow[] = [];

  for (const query of queries) {
    const [selver, barbora] = await Promise.all([
      searchOne(searchSelver, query, 'Selver'),
      searchOne(searchBarbora, query, 'Barbora'),
    ]);
    rows.push({ query, selver, barbora });
  }

  const totalSelver = rows.reduce((sum, r) => sum + (r.selver?.price ?? 0), 0);
  const totalBarbora = rows.reduce((sum, r) => sum + (r.barbora?.price ?? 0), 0);
  const itemsFound = rows.filter((r) => r.selver && r.barbora).length;

  return { rows, totalSelver, totalBarbora, itemsFound };
}
