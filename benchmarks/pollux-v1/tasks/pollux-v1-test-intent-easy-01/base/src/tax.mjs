export function totalWithTax(subtotal, discount, taxRate) {
  return subtotal + subtotal * taxRate - discount;
}

