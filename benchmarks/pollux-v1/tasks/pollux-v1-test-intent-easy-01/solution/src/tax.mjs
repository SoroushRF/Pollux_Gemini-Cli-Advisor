export function totalWithTax(subtotal, discount, taxRate) {
  return (subtotal - discount) * (1 + taxRate);
}

