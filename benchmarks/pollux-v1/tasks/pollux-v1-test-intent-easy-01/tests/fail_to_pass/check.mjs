import { totalWithTax } from '../../src/tax.mjs';

if (totalWithTax(100, 20, 0.1) !== 88) {
  throw new Error('discount must apply before tax');
}
if (totalWithTax(50, 5, 0.2) !== 54) {
  throw new Error('second tax case failed');
}

