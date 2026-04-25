export interface Product {
  name: string;
  price: number;      // shelf price in EUR (what you pay)
  unitPrice: string;  // e.g. "1.25 €/l" – comparison price
  url: string;
  store: 'Selver' | 'Barbora';
}

export interface ComparisonRow {
  query: string;
  selver: Product | null;
  barbora: Product | null;
}

export interface ComparisonSummary {
  rows: ComparisonRow[];
  totalSelver: number;   // sum of matched Selver items
  totalBarbora: number;  // sum of matched Barbora items
  itemsFound: number;    // rows where both stores returned a result
}
