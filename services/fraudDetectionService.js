const Invoice = require('../models/Invoice');

const MS_IN_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculates a fraud score (0-100) for a new/updated invoice by checking it
 * against the customer's historical invoicing pattern. Pure business-logic
 * heuristics - no external AI API involved.
 *
 * @param {Object} params - { customerId, grandTotal, items, invoiceDate, isDuplicate }
 */
const calculateFraudScore = async ({ customerId, grandTotal, items, invoiceDate, isDuplicate }) => {
  const reasons = [];
  let score = 0;

  const pastInvoices = await Invoice.find({ customer: customerId, isDeleted: false })
    .sort({ invoiceDate: -1 })
    .limit(50);

  // --- 1. Invoice much higher than customer's historical average ---
  if (pastInvoices.length >= 2) {
    const avg = pastInvoices.reduce((sum, i) => sum + i.grandTotal, 0) / pastInvoices.length;
    if (avg > 0 && grandTotal > avg * 3) {
      score += 30;
      reasons.push(
        `Invoice amount (₹${grandTotal.toFixed(2)}) is more than 3x this customer's average (₹${avg.toFixed(2)})`
      );
    } else if (avg > 0 && grandTotal > avg * 1.75) {
      score += 15;
      reasons.push(
        `Invoice amount (₹${grandTotal.toFixed(2)}) is significantly above this customer's average (₹${avg.toFixed(2)})`
      );
    }
  }

  // --- 2. Unusual quantity on any single item ---
  const MAX_TYPICAL_QTY = 100;
  const hasUnusualQty = items.some((i) => i.quantity > MAX_TYPICAL_QTY);
  if (hasUnusualQty) {
    score += 15;
    reasons.push('One or more items have an unusually high quantity');
  }

  // --- 3. Duplicate invoice detected ---
  if (isDuplicate) {
    score += 25;
    reasons.push('Invoice closely matches another recent invoice for this customer');
  }

  // --- 4. Customer inactive for a long period, then a sudden purchase ---
  if (pastInvoices.length >= 1) {
    const lastInvoiceDate = new Date(pastInvoices[0].invoiceDate);
    const daysSinceLast = (new Date(invoiceDate) - lastInvoiceDate) / MS_IN_DAY;
    if (daysSinceLast > 180) {
      score += 15;
      reasons.push(`Customer was inactive for ${Math.round(daysSinceLast)} days before this invoice`);
    }
  }

  // --- 5. Sudden purchase spike: multiple invoices in a very short window ---
  const last7Days = pastInvoices.filter(
    (i) => (new Date(invoiceDate) - new Date(i.invoiceDate)) / MS_IN_DAY <= 7
  );
  if (last7Days.length >= 3) {
    score += 15;
    reasons.push(`${last7Days.length} invoices created for this customer within the last 7 days`);
  }

  score = Math.min(score, 100);

  let risk = 'Low';
  if (score >= 60) risk = 'High';
  else if (score >= 30) risk = 'Medium';

  return { fraudScore: score, fraudRisk: risk, fraudReasons: reasons };
};

module.exports = { calculateFraudScore };
