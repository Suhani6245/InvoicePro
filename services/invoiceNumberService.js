const Counter = require('../models/Counter');
const { INVOICE_PREFIX, INVOICE_START_NUMBER } = require('../config/constants');

/**
 * Atomically generates the next sequential invoice number, e.g. INV-1001.
 * Uses findOneAndUpdate with $inc so concurrent requests never collide.
 */
const generateInvoiceNumber = async () => {
  // Try to increment an existing counter document first.
  let counter = await Counter.findOneAndUpdate(
    { _id: 'invoiceNumber' },
    { $inc: { seq: 1 } },
    { new: true }
  );

  // First invoice ever created - counter doc doesn't exist yet, so create it
  // directly at the starting sequence (avoids the $inc-vs-default race).
  if (!counter) {
    counter = await Counter.create({ _id: 'invoiceNumber', seq: INVOICE_START_NUMBER + 1 });
  }

  return `${INVOICE_PREFIX}${counter.seq}`;
};

module.exports = { generateInvoiceNumber };
