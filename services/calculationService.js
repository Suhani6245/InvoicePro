/**
 * Computes item line totals and overall invoice totals.
 * Pure function - no DB access - so it's easy to reuse on create and update.
 */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const calculateInvoiceTotals = ({ items, gstPercent = 18, discountPercent = 0, paidAmount = 0 }) => {
  const computedItems = items.map((item) => ({
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: round2(item.quantity * item.unitPrice),
  }));

  const subtotal = round2(computedItems.reduce((sum, i) => sum + i.total, 0));
  const discountAmount = round2((subtotal * discountPercent) / 100);
  const taxableAmount = round2(subtotal - discountAmount);
  const gstAmount = round2((taxableAmount * gstPercent) / 100);
  const grandTotal = round2(taxableAmount + gstAmount);

  const paid = round2(paidAmount || 0);
  const remainingAmount = round2(Math.max(grandTotal - paid, 0));

  let status = 'Pending';
  if (paid <= 0) status = 'Pending';
  else if (paid >= grandTotal) status = 'Paid';
  else status = 'Partial';

  return {
    items: computedItems,
    subtotal,
    gstPercent,
    gstAmount,
    discountPercent,
    discountAmount,
    grandTotal,
    paidAmount: paid,
    remainingAmount,
    status,
  };
};

module.exports = { calculateInvoiceTotals, round2 };
