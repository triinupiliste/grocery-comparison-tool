/**
 * grocery-compare – CLI entry point
 *
 * Usage:
 *   npx tsx src/index.ts "piim" "leib" "juust"
 *   npx tsx src/index.ts --list groceries.json
 *
 * Compares prices across Selver and Barbora for every item in the list,
 * then recommends the cheaper store.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { readFileSync } from 'fs';
import { compare } from './compare.js';
import type { ComparisonSummary } from './types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function banner() {
  console.log(
    chalk.bold.green('\n╔══════════════════════════════════════════╗'),
  );
  console.log(
    chalk.bold.green('║') +
      chalk.bold.white('  🛒  Estonian Grocery Price Comparison   ') +
      chalk.bold.green('║'),
  );
  console.log(
    chalk.bold.green('║') +
      chalk.gray('      Selver  vs  Barbora                 ') +
      chalk.bold.green('║'),
  );
  console.log(chalk.bold.green('╚══════════════════════════════════════════╝\n'));
}

function fmt(price: number) {
  return `${price.toFixed(2)} €`;
}

/**
 * Normalize unit price to a consistent format.
 * Converts "3.91 €/330g" to "€/kg" equivalent, or "1.78 €/l" stays as is.
 * Returns a standardized string like "11.85 €/kg" or "1.78 €/l".
 */
function normalizeUnitPrice(unitPrice: string): string {
  if (!unitPrice) return '';
  
  // Match pattern like "3.91 €/330g" or "1.78 €/kg"
  const match = unitPrice.match(/([\d.]+)\s*€\/(.+)/);
  if (!match) return unitPrice;
  
  const pricePerUnit = parseFloat(match[1]);
  const unit = match[2].toLowerCase().trim();
  
  if (isNaN(pricePerUnit)) return unitPrice;
  
  // Handle liter/ml
  if (unit.includes('l')) {
    // Already in liters, keep as-is
    return `${pricePerUnit.toFixed(2)} €/${unit}`;
  }
  
  // Handle grams → convert to kg
  const gMatch = unit.match(/^(\d+)\s*g$/);
  if (gMatch) {
    const grams = parseInt(gMatch[1], 10);
    const pricePerKg = (pricePerUnit * 1000) / grams;
    return `${pricePerKg.toFixed(2)} €/kg`;
  }
  
  // Already in kg or unknown, keep as-is
  return `${pricePerUnit.toFixed(2)} €/${unit}`;
}

function printTable(result: ComparisonSummary) {
  const table = new Table({
    head: [
      chalk.white.bold('Item'),
      chalk.blue.bold('Selver'),
      chalk.yellow.bold('Barbora'),
      chalk.white.bold('Cheaper'),
    ],
    colWidths: [26, 32, 32, 10],
    wordWrap: true,
    style: { head: [], border: ['gray'] },
  });

  for (const row of result.rows) {
    const sp = row.selver?.price;
    const pp = row.barbora?.price;

    // Determine which store is cheaper for this item
    let cheaperCell: string;
    if (sp !== undefined && pp !== undefined) {
      if (sp < pp) cheaperCell = chalk.blue('◀ Selver');
      else if (pp < sp) cheaperCell = chalk.yellow('Barbora ▶');
      else cheaperCell = chalk.gray('equal');
    } else {
      cheaperCell = chalk.gray('–');
    }

    const selverCell = row.selver
      ? chalk.bold(fmt(row.selver.price)) +
        '\n' +
        chalk.gray(row.selver.name.length > 28
          ? row.selver.name.slice(0, 25) + '…'
          : row.selver.name) +
        (row.selver.unitPrice ? '\n' + chalk.dim(normalizeUnitPrice(row.selver.unitPrice)) : '')
      : chalk.red('not found');

    const barboraCell = row.barbora
      ? chalk.bold(fmt(row.barbora.price)) +
        '\n' +
        chalk.gray(row.barbora.name.length > 28
          ? row.barbora.name.slice(0, 25) + '…'
          : row.barbora.name) +
        (row.barbora.unitPrice ? '\n' + chalk.dim(normalizeUnitPrice(row.barbora.unitPrice)) : '')
      : chalk.red('not found');

    table.push([chalk.cyan(row.query), selverCell, barboraCell, cheaperCell]);
  }

  console.log(table.toString());
}

function printSummary(result: ComparisonSummary) {
  const { totalSelver, totalBarbora, itemsFound, rows } = result;

  console.log(chalk.bold('\n📊  Summary'));
  console.log(
    `   Selver  total (${rows.filter(r => r.selver).length} items): ` +
      chalk.blue.bold(fmt(totalSelver)),
  );
  console.log(
    `   Barbora total (${rows.filter(r => r.barbora).length} items): ` +
      chalk.yellow.bold(fmt(totalBarbora)),
  );

  if (itemsFound === 0) {
    console.log(chalk.red('\n   No items found in both stores – comparison not possible.'));
    return;
  }

  // Only compare totals for items found in BOTH stores
  const bothSelver = rows
    .filter((r) => r.selver && r.barbora)
    .reduce((s, r) => s + r.selver!.price, 0);
  const bothBarbora = rows
    .filter((r) => r.selver && r.barbora)
    .reduce((s, r) => s + r.barbora!.price, 0);

  if (bothSelver === bothBarbora) {
    console.log(chalk.gray('\n   Prices are equal – both stores are the same cost.'));
  } else {
    const cheaper = bothSelver < bothBarbora ? 'Selver' : 'Barbora';
    const savings = Math.abs(bothSelver - bothBarbora).toFixed(2);
    const color = cheaper === 'Selver' ? chalk.blue : chalk.yellow;
    console.log(
      `\n   ${color.bold('✓ ' + cheaper + ' is cheaper')} – save ` +
        chalk.green.bold(savings + ' €') +
        chalk.gray(` (${itemsFound} matching items)`),
    );
  }

  console.log('');
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  banner();

  const args = process.argv.slice(2);
  let queries: string[] = [];

  if (args.includes('--list')) {
    const idx = args.indexOf('--list');
    const filePath = args[idx + 1];
    if (!filePath) {
      console.error(chalk.red('Error: --list requires a file path, e.g.: --list groceries.json'));
      process.exit(1);
    }
    try {
      queries = JSON.parse(readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(queries) || queries.some((q) => typeof q !== 'string')) {
        throw new Error('File must contain a JSON array of strings.');
      }
    } catch (err: any) {
      console.error(chalk.red(`Error reading file "${filePath}": ${err.message}`));
      process.exit(1);
    }
  } else if (args.length > 0) {
    queries = args;
  } else {
    console.error(chalk.red('Usage:'));
    console.error('  npx tsx src/index.ts "piim" "leib" "juust"');
    console.error('  npx tsx src/index.ts --list groceries.json');
    process.exit(1);
  }

  console.log(chalk.gray(`Searching for ${queries.length} items across both stores...\n`));

  const result = await compare(queries);
  printTable(result);
  printSummary(result);
}

main().catch((err) => {
  console.error(chalk.red('\nUnexpected error:'), err.message);
  process.exit(1);
});
