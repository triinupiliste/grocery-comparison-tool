/**
 * Fuzzy product matcher with improved name handling
 *
 * The search APIs already return relevance-ranked results, so in most cases
 * the first hit is the best one.  But when a user types "piim 2.5%" we want
 * to match different variants (2.5%, 3%, etc.) fairly.
 *
 * We strip quantity/packaging info and search on the product base name,
 * then validate the top match has meaningful token overlap.
 */

import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import type { Product } from './types.js';

const FUSE_OPTIONS: IFuseOptions<Product> = {
  keys: ['name'],
  threshold: 0.65,   // Slightly stricter than before for better matches
  minMatchCharLength: 2,
};

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length >= 2);
}

/**
 * Strip quantity and packaging info from product names.
 * Handles various spacing: "1,5 l", "1,5l", "1.5l", "1.5 L", etc.
 * Examples:
 *   "Piim 2,5% pure, FARMI, 1,5 l" → "piim farmi pure"
 *   "Juust EESTI viilutatud, 200g" → "juust eesti viilutatud"
 *   "Rukkileib seemnetega, LÕU, 500g" → "rukkileib seemnetega"
 */
function stripQuantityInfo(text: string): string {
  return text
    .toLowerCase()
    // Match quantity with flexible spacing: "1,5 l", "1,5l", "1.5 L", etc.
    .replace(/[\s,]*\d+[.,]\d*\s*[a-z%]+\b/gi, '')  // "1,5 l", "1.5l", etc.
    .replace(/\b\d+\s*[a-z%]+\b/gi, '')              // "500g", "10tk", etc.
    .replace(/,\s*\d+[.,]\d*\s*[a-z%]+/gi, '')       // ", 200g" after commas
    .replace(/\s+/g, ' ')
    .trim();
}

interface ParsedProduct {
  base: string;        // Core product name (e.g., "keefir")
  brand?: string;      // Brand name if detected (e.g., "SAIDAFARM")
  extras: string[];    // Additional descriptors (e.g., ["kama"])
  fullStripped: string; // Full stripped product name
}

/**
 * Parse a product name into structured parts.
 * Examples:
 *   "Keefir, SAIDAFARM, 1 kg" → { base: "keefir", brand: "SAIDAFARM", extras: [] }
 *   "Keefir GEFILUS kama, 300g" → { base: "keefir", brand: "GEFILUS", extras: ["kama"] }
 *   "Piim 2,5% pure, FARMI, 1 L" → { base: "piim", brand: "FARMI", extras: ["pure"] }
 */
function parseProductName(name: string): ParsedProduct {
  const stripped = stripQuantityInfo(name);
  const parts = stripped
    .split(/[,\s]+/)
    .filter((p) => p.length > 0);
  
  let base = '';
  let brand = '';
  const extras: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isAllCaps = part === part.toUpperCase() && part.length > 1;
    
    if (!base) {
      // First non-empty part is the base product name
      base = part.toLowerCase();
    } else if (isAllCaps && !brand) {
      // All-caps part is the brand
      brand = part;
    } else if (base && !brand && i === 1) {
      // If second part is not all-caps but we haven't found brand yet,
      // it might be a secondary part of the product name (e.g., "2.5%" or "pure")
      // Only add to extras if it looks like a descriptor, not a brand
      const isDescriptor = 
        part.length < 10 && 
        !part.match(/^[A-Z][a-z]{2,}$/) && // Not "Farmi" style capitalization
        part !== part.toUpperCase(); // Not all caps
      if (isDescriptor) {
        extras.push(part.toLowerCase());
      } else {
        // Might be a brand-like name
        brand = part.toUpperCase();
      }
    } else if (i > 1) {
      // Everything after brand/second part is extra descriptors
      extras.push(part.toLowerCase());
    }
  }
  
  return {
    base,
    brand: brand || undefined,
    extras,
    fullStripped: stripped,
  };
}

/**
 * Calculate how "plain" a product is (lower = more plain/basic).
 * Plain products are preferred over fancy variants.
 */
function complexityScore(parsed: ParsedProduct): number {
  // Base score from number of extra descriptors
  let score = parsed.extras.length * 2;
  
  // Penalize common flavor/variant descriptors
  const flavors = ['kama', 'strawberry', 'vanilla', 'chocolate', 'berry', 'fruit', 'herb', 'organic', 'bio', 'probiotic'];
  for (const extra of parsed.extras) {
    if (flavors.some((f) => extra.includes(f))) {
      score += 3; // Heavier penalty for known flavor descriptors
    }
  }
  
  // Product name length as tiebreaker (shorter = simpler)
  score += parsed.fullStripped.length * 0.01;
  
  return score;
}

/**
 * Return the best-matching product from `candidates` for the given `query`.
 * Prioritizes:
 * 1. Token overlap (avoid false positives)
 * 2. Plainness (prefer basic variants over flavored/specialty)
 * 3. Brand consistency (prefer same brand if available)
 * 4. Product name length (shorter = simpler)
 */
export function bestMatch(query: string, candidates: Product[]): Product | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const queryParsed = parseProductName(query);
  const queryTokens = new Set(tokens(queryParsed.base));
  
  // Create a synthetic product list with parsed names
  const candidatesWithParsed = candidates.map((c) => ({
    product: c,
    parsed: parseProductName(c.name),
  }));

  // Type-safe Fuse search
  type CandidateWithParsed = typeof candidatesWithParsed[0];
  const fuse = new Fuse(candidatesWithParsed, {
    keys: ['parsed.fullStripped'],
    threshold: 0.65,
    minMatchCharLength: 2,
  } as IFuseOptions<CandidateWithParsed>);
  
  const results = fuse.search(queryParsed.fullStripped);
  
  // Filter results to only those with token overlap on base product name or brand
  const validResults = results.filter((result) => {
    const { base, brand, extras } = result.item.parsed;
    const productTokens = new Set([
      ...tokens(base),
      ...(brand ? tokens(brand) : []),
      ...extras.flatMap(e => tokens(e))
    ]);
    return [...queryTokens].some((t) => productTokens.has(t));
  });
  
  if (validResults.length === 0) return null;
  
  // Score each valid result
  const scored = validResults.map((result) => {
    const { product, parsed } = result.item;
    const fuseScore = result.score ?? 0;
    
    // Complexity penalty (plain products scored lower = preferred)
    const complexity = complexityScore(parsed);
    
    // Brand match bonus: only apply if base product names have some similarity
    // (to avoid matching completely different products just because brand matches)
    const baseMatch = tokens(queryParsed.base).some(t => tokens(parsed.base).includes(t));
    const brandMatch = 
      baseMatch && queryParsed.brand && parsed.brand && queryParsed.brand === parsed.brand 
        ? -2 // Bonus (lower score is better)
        : 0;
    
    // Combined score: prefer low complexity, matching brand, short name
    const combinedScore = complexity + brandMatch + (fuseScore * 0.1);
    
    return { product, combinedScore };
  });
  
  // Return product with lowest combined score
  const best = scored.sort((a, b) => a.combinedScore - b.combinedScore)[0];
  return best?.product ?? validResults[0]?.item.product ?? null;
}
