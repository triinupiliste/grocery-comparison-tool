# Estonian Grocery Price Comparison CLI Tool

A TypeScript/Node.js CLI tool that compares real-time grocery prices between **Selver** and **Barbora** (two major Estonian grocery chains).

## Problem Statement

Comparing grocery prices across stores manually is tedious:
- You search one store's app, note the price
- Switch to another app, search again
- Manually compare prices in your head
- This repeats for every item in your shopping list

For a typical ~10-item grocery list, this takes 5-10 minutes per store. **AI and automation can solve this.**

## What This Does

```bash
# Compare specific items
npx tsx src/index.ts "rukkitasku" "juust hiirte 500g" "keefir hellus"

# Compare a grocery list from a file
npx tsx src/index.ts --list groceries.json
```

**Output:** A clean table showing:
- Item name
- Price & product name from each store
- Per-unit price (€/kg or €/l) for fair comparison
- Which store is cheaper
- **Summary:** Total cost, savings amount, overall winner

Example:
```
│ rukkileib                │ 1.59 €                         │ 0.59 €                         │ Barbora ▶ │
│                          │ Rukkileib seemnetega, LÕU…     │ Rukkileib, 320g                │          │
│                          │ 5.30 €/kg                      │ 1.78 €/kg                      │          │
```

## How It Works

### Architecture

```
Query (CLI args or JSON file)
    ↓
Selver API + Barbora API (parallel fetch)
    ↓
Smart Fuzzy Matching (avoid wrong variants)
    ↓
Unit Price Normalization (fair comparison)
    ↓
Pretty Table Output
```

### Data Sources

#### **Selver**
- Public JSON API (Vue Storefront Elasticsearch)
- `GET https://www.selver.ee/api/catalog/vue_storefront_catalog_et/product/_search`
- Returns: product name, shelf price, unit price (€/kg), product URL

#### **Barbora**
- Public JSON REST API
- `GET https://barbora.ee/api/eshop/v1/search?query=...`
- Returns: product name, shelf price, unit price, product category

### Matching Strategy

When you search for "keefir", the system must pick the *right* keefir from potentially 50+ results. We use **multi-factor scoring**:

1. **Token overlap** - Does the product name contain words from your query?
   - Query: "keefir" → Matches "Keefir plain" ✓, blocks obvious false positives
   
2. **Plainness scoring** - Prefer basic variants over fancy ones
   - "Keefir" (score: 0) beats "Keefir with kama" (score: 3)
   - Detects flavors: kama, strawberry, chocolate, organic, probiotic, etc.
   
3. **Brand matching** - If you specify a brand, prefer same brand from both stores
   - Query: "farmi piim" → Prefers FARMI brand milk if available
   - Only applies when base product names also match (prevents wrong matches)
   
4. **Shortest name** - Simpler products are usually more standard
   - "Bread" beats "Bread with seeds and herbs"

5. **Unit price normalization**
   - Converts "3.91 €/330g" → "11.85 €/kg" for fair comparison
   - Keeps "€/l" as-is for liquids

### Spacing Tolerance

Handles quantity format variations in product names:
- "1,5 l" (space) vs "1,5l" (no space)
- "2.5%" vs "2,5%" (decimal format)
- All normalized for consistent matching

## Installation & Usage

### Setup

```bash
npm install
```

### Run

```bash
# Quick test with inline items
npx tsx src/index.ts "piim" "leib" "juust"

# Compare a full shopping list
npx tsx src/index.ts --list groceries.json
```

### Example Grocery List (`groceries.json`)

```json
[
  "piim 1,5 l",
  "rukkitasku",
  "juust hiirte 500g",
  "nisujahu kalew 2kg",
  "munad 10tk"
]
```

## Technical Stack

- **Language:** TypeScript (ES2022, strict mode)
- **Runtime:** Node.js + tsx (TypeScript executor)
- **HTTP:** axios (API calls with 12s timeout)
- **Fuzzy matching:** Fuse.js (0.65 threshold, token-based)
- **CLI output:** chalk (colors) + cli-table3 (table rendering)
- **Search scope:** Top 5 results per store, fuzzy-filtered to best match

## Key Design Decisions

### What We Include
✅ Real-time live prices from actual store APIs  
✅ Per-unit price normalization for fair comparison  
✅ Smart variant matching (plain vs flavored, different brands)  
✅ English-language UI (but EST product names, as stores use Estonian)  
✅ Error handling - if one store fails, other result still shown  

### What We Deliberately Left Out
❌ **Quantity auto-correction** - "hakkliha 500g" vs "hakkliha 600g" are still different products. Normalizing would be wrong.  
❌ **Stock/availability checking** - Prices change by warehouse; showing stock adds complexity  
❌ **Discounts/promotions detection** - Stores hide promo logic; we show shelf price only  
❌ **Nutrition comparison** - Scope creep; focus on price, not health info  
❌ **Web UI** - CLI is faster to build and test; covers the core need  
❌ **Caching** - Prices change daily; always fetch fresh  

## AI Usage in This Project

**Summary:** With AI assistance, I built a minimal working version in **~1 hour**. AI fully wrote all the code — I provided direction, tested against real store data, and iterated on the matching algorithm.

### Where AI Helped

1. **API Discovery** 
   - Tested 15+ API endpoint patterns for Selver and Barbora
   - AI suggested common REST patterns and helped debug 404 responses
   - Discovered Selver's public Elasticsearch endpoint (not documented publicly)

2. **Product Matching Logic** 
   - AI suggested multi-factor scoring instead of simple fuzzy match
   - Provided token-based overlap validation pattern
   - Helped design "complexity score" for variant preference

3. **Unit Price Normalization** 
   - AI generated regex patterns for quantity extraction ("500g", "1.5l", "2,5%")
   - Helped implement decimal separator handling (comma vs period)
   - Suggested the conversion formula from "€/330g" to "€/kg"

4. **Error Handling & Edge Cases** 
   - AI identified spacing variations ("1,5 l" vs "1,5l")
   - Suggested brand-name parsing (all-caps detection)
   - Generated test cases for boundary conditions

5. **TypeScript Type Safety** 
   - Fixed Fuse.js type system issues
   - Generated proper interface definitions
   - Resolved ESM module import patterns

### Iteration Pattern

1. AI generates initial pattern/idea
2. I test against real data from stores
3. If it fails, I debug and ask AI for refinement
4. Repeat until it works on actual product names

Example: First fuzzy match picked "Keefir kama" (flavored) when searching "keefir". 
- AI suggested adding "complexity score" 
- I tested on real Barbora/Selver products
- Adjusted weights until "Keefir plain" was preferred
- Verified with 20+ test cases

## What Doesn't Work Yet

### Known Limitations

1. **Store availability mismatch**
   - Some items exist in only one store → can't compare
   - Solution would require fallback to "similar items" (e.g., compare any cheese if "eesti juust" unavailable)

2. **Quantity variance**
   - "Butter 100g" vs "Butter 200g" are different products with different €/kg
   - Normalized comparison would require assuming bulk pricing (not always accurate)

3. **Regional stock variations**
   - Same store, different branch → different stock/prices
   - Stores don't expose branch-level pricing in API

4. **Seasonal/temporary promotions**
   - APIs return shelf price, not active promo prices
   - Promo detection requires real-time scraping (Barbora doesn't expose in API)

5. **Misspellings in queries**
   - "keifer" vs "keefir" - fuzzy match struggles with this
   - Would need spell-checker or query expansion

## Future Improvements (If Continuing)

### High Impact
1. **Add more stores** (Coop, Rimi) - Would require API/scraper research
2. **Quantity-aware matching** - Detect "500g" in query, prefer 500g products
3. **Nutrition/quality filters** - "Organic" vs "Regular", show both
4. **Shopping list optimization** - Suggest cheapest basket (buy all from Barbora or mix?)

### Medium Impact
5. **Caching with smart invalidation** - Cache prices for 6 hours, refresh on demand
6. **Historical price tracking** - Store prices daily, show trends
7. **Web UI** - Simple React dashboard for non-CLI users
8. **Browser extension** - Highlight cheaper option while browsing store websites

### Nice-to-Have
9. **Multi-language support** - Extend beyond Estonian stores
10. **Budget alerts** - "Email me when butter drops below €12/kg"
11. **Personalized preferences** - Remember brand preferences per user

## Running the Project

```bash
# Install
npm install

# Type check
npx tsc --noEmit

# Run
npx tsx src/index.ts "piim" "leib"
npx tsx src/index.ts --list groceries.json

# Test with specific items
npx tsx src/index.ts "keefir"
npx tsx src/index.ts "rukkileib"
npx tsx src/index.ts "juust 200g"
```

## Project Structure

```
src/
├── index.ts           # CLI entry point, table rendering, output formatting
├── types.ts           # TypeScript interfaces (Product, ComparisonRow, etc.)
├── compare.ts         # Main comparison orchestration (parallel store search)
├── matcher.ts         # Fuzzy matching with plainness/brand scoring
└── stores/
    ├── selver.ts      # Selver API client
    └── barbora.ts     # Barbora API client

groceries.json         # Example shopping list
package.json           # Dependencies, build config
tsconfig.json          # TypeScript configuration
```

## Files & Purpose

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI interface, table rendering, summary stats |
| `src/compare.ts` | Orchestrates parallel API calls, builds results |
| `src/matcher.ts` | Smart product matching (plainness, brand, fuzzy) |
| `src/stores/selver.ts` | Selver API integration |
| `src/stores/barbora.ts` | Barbora API integration |
| `src/types.ts` | Shared TypeScript types |

## Conclusion

This is a **working, real solution** to a real problem. It:
- ✅ Fetches live prices from actual store APIs
- ✅ Handles product variant matching intelligently
- ✅ Shows fair price comparison (per-unit normalized)
- ✅ Completes in <5 seconds for typical shopping list
- ✅ Saves ~5 minutes per shopping trip (manual comparison time)

**Problem solved.** The AI helped identify the right APIs, design the matching algorithm, and handle edge cases. The human work was testing, debugging, and making judgment calls about trade-offs.
