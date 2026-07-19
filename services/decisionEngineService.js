const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const analyticsService = require('./analyticsService');

const OUTSTANDING_ALERT_THRESHOLD = 50000; // ₹50,000, per spec

/**
 * The Decision Engine: scans current business state and produces a list of
 * plain-language recommendations, the way a financial assistant would flag
 * things worth your attention. Computed live (not stored) so it always
 * reflects the current data.
 */
const generateDecisions = async () => {
  const decisions = [];

  // --- 1. High fraud risk invoices ---
  const fraudInvoices = await Invoice.find({ isDeleted: false, fraudRisk: 'High' })
    .populate('customer', 'name companyName')
    .sort({ createdAt: -1 })
    .limit(20);

  fraudInvoices.forEach((inv) => {
    decisions.push({
      type: 'High Fraud Risk',
      severity: 'High',
      title: `Invoice ${inv.invoiceNumber} flagged as high fraud risk`,
      recommendation: 'Verify invoice before sending.',
      relatedInvoice: inv._id,
      relatedInvoiceNumber: inv.invoiceNumber,
      relatedCustomer: inv.customer?._id || null,
      relatedCustomerName: inv.customer?.companyName || inv.customer?.name || null,
      detail: inv.fraudReasons?.join('; ') || undefined,
    });
  });

  // --- 2. Late / high-risk customers ---
  const riskyCustomers = await Customer.find({ isDeleted: false, paymentRisk: 'High' })
    .select('name companyName riskReason riskRecommendation')
    .limit(20);

  riskyCustomers.forEach((c) => {
    decisions.push({
      type: 'Late Customer',
      severity: 'High',
      title: `${c.companyName || c.name} has a high payment risk profile`,
      recommendation: c.riskRecommendation || 'Collect advance payment.',
      relatedCustomer: c._id,
      relatedCustomerName: c.companyName || c.name,
      detail: c.riskReason,
    });
  });

  // --- 3. Customers with outstanding balance above the alert threshold ---
  const highOutstanding = await Invoice.aggregate([
    { $match: { isDeleted: false, remainingAmount: { $gt: 0 } } },
    { $group: { _id: '$customer', totalOutstanding: { $sum: '$remainingAmount' } } },
    { $match: { totalOutstanding: { $gt: OUTSTANDING_ALERT_THRESHOLD } } },
    { $sort: { totalOutstanding: -1 } },
    { $limit: 20 },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
  ]);

  highOutstanding.forEach((row) => {
    decisions.push({
      type: 'High Outstanding Balance',
      severity: 'Medium',
      title: `${row.customer.companyName || row.customer.name} owes Rs. ${row.totalOutstanding.toFixed(2)}`,
      recommendation: 'Send payment reminder.',
      relatedCustomer: row.customer._id,
      relatedCustomerName: row.customer.companyName || row.customer.name,
      detail: `Outstanding balance exceeds the Rs. ${OUTSTANDING_ALERT_THRESHOLD.toLocaleString()} threshold`,
    });
  });

  // --- 4. Revenue dropped month-over-month ---
  const monthlyGrowth = await analyticsService.getMonthlyGrowth(3);
  const latest = monthlyGrowth[monthlyGrowth.length - 1];
  if (latest && latest.growthPercent !== null && latest.growthPercent < 0) {
    decisions.push({
      type: 'Revenue Drop',
      severity: Math.abs(latest.growthPercent) > 20 ? 'High' : 'Medium',
      title: `Revenue dropped ${Math.abs(latest.growthPercent)}% in ${latest.label}`,
      recommendation: 'Review inactive customers.',
      detail: `Collected Rs. ${latest.revenue} in ${latest.label}, down from the prior month`,
    });
  }

  // --- 5. Recently created duplicate invoices (force-created despite a warning) ---
  const duplicateInvoices = await Invoice.find({ isDeleted: false, duplicateOf: { $ne: null } })
    .populate('customer', 'name companyName')
    .sort({ createdAt: -1 })
    .limit(20);

  duplicateInvoices.forEach((inv) => {
    decisions.push({
      type: 'Duplicate Invoice',
      severity: 'Medium',
      title: `Invoice ${inv.invoiceNumber} was created despite a duplicate warning`,
      recommendation: 'Verify before saving.',
      relatedInvoice: inv._id,
      relatedInvoiceNumber: inv.invoiceNumber,
      relatedCustomer: inv.customer?._id || null,
      relatedCustomerName: inv.customer?.companyName || inv.customer?.name || null,
      detail: `${inv.duplicateSimilarityScore}% similarity to an existing invoice`,
    });
  });

  // Highest severity first
  const severityRank = { High: 0, Medium: 1, Low: 2 };
  decisions.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return decisions;
};

module.exports = { generateDecisions };
