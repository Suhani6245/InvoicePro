const Invoice = require('../models/Invoice');

/**
 * Whenever invoices are fetched, any invoice past its due date with a
 * remaining balance should automatically show as "Overdue". This function
 * accepts an array of invoice documents (already fetched), flips the
 * in-memory + persisted status where needed, and returns the same array.
 */
const applyOverdueStatus = async (invoices) => {
  const now = new Date();
  const idsToUpdate = [];

  for (const invoice of invoices) {
    const isPastDue = new Date(invoice.dueDate) < now;
    const hasBalance = invoice.remainingAmount > 0;
    const alreadyTerminal = invoice.status === 'Paid';

    if (isPastDue && hasBalance && !alreadyTerminal && invoice.status !== 'Overdue') {
      invoice.status = 'Overdue';
      idsToUpdate.push(invoice._id);
    }
  }

  if (idsToUpdate.length > 0) {
    await Invoice.updateMany({ _id: { $in: idsToUpdate } }, { $set: { status: 'Overdue' } });
  }

  return invoices;
};

// Convenience wrapper for a single invoice document
const applyOverdueStatusSingle = async (invoice) => {
  const [updated] = await applyOverdueStatus([invoice]);
  return updated;
};

module.exports = { applyOverdueStatus, applyOverdueStatusSingle };
