const Invoice = require('../models/Invoice');

const MS_IN_DAY = 24 * 60 * 60 * 1000;

/**
 * Compares two item lists and returns an overlap ratio (0-1) based on
 * matching product names, regardless of order or exact quantity.
 */
const itemSimilarity = (itemsA, itemsB) => {
  if (!itemsA.length || !itemsB.length) return 0;

  const namesA = itemsA.map((i) => i.productName.trim().toLowerCase());
  const namesB = itemsB.map((i) => i.productName.trim().toLowerCase());

  const matches = namesA.filter((name) => namesB.includes(name)).length;
  const unionSize = new Set([...namesA, ...namesB]).size;

  return unionSize === 0 ? 0 : matches / unionSize;
};

/**
 * Looks for recent invoices belonging to the same customer with a similar
 * amount, similar items, and a nearby invoice date. Returns the best match
 * (if any) with a 0-100 similarity score.
 *
 * @param {Object} candidate - { customerId, grandTotal, items, invoiceDate, excludeInvoiceId }
 */
const findPossibleDuplicate = async (candidate) => {
  const { customerId, grandTotal, items, invoiceDate, excludeInvoiceId } = candidate;

  const windowStart = new Date(new Date(invoiceDate).getTime() - 7 * MS_IN_DAY);
  const windowEnd = new Date(new Date(invoiceDate).getTime() + 7 * MS_IN_DAY);

  const recentInvoices = await Invoice.find({
    customer: customerId,
    isDeleted: false,
    invoiceDate: { $gte: windowStart, $lte: windowEnd },
    ...(excludeInvoiceId && { _id: { $ne: excludeInvoiceId } }),
  }).limit(25);

  let bestMatch = null;
  let bestScore = 0;

  for (const inv of recentInvoices) {
    // Amount similarity: how close the grand totals are (1 = identical)
    const amountDiff = Math.abs(inv.grandTotal - grandTotal);
    const amountSimilarity =
      inv.grandTotal === 0 && grandTotal === 0
        ? 1
        : Math.max(0, 1 - amountDiff / Math.max(inv.grandTotal, grandTotal, 1));

    // Date similarity: closer dates score higher, 7-day window fully decays to 0
    const daysApart = Math.abs(new Date(inv.invoiceDate) - new Date(invoiceDate)) / MS_IN_DAY;
    const dateSimilarity = Math.max(0, 1 - daysApart / 7);

    // Item overlap similarity
    const itemsSim = itemSimilarity(inv.items, items);

    // Weighted composite score (0-100)
    const score = Math.round((amountSimilarity * 0.45 + itemsSim * 0.35 + dateSimilarity * 0.2) * 100);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = inv;
    }
  }

  // Only flag as a likely duplicate above a reasonable confidence threshold
  const DUPLICATE_THRESHOLD = 70;
  if (bestMatch && bestScore >= DUPLICATE_THRESHOLD) {
    return {
      isDuplicate: true,
      similarityScore: bestScore,
      existingInvoice: {
        id: bestMatch._id,
        invoiceNumber: bestMatch.invoiceNumber,
        grandTotal: bestMatch.grandTotal,
        invoiceDate: bestMatch.invoiceDate,
      },
    };
  }

  return { isDuplicate: false, similarityScore: bestScore, existingInvoice: null };
};

module.exports = { findPossibleDuplicate };
