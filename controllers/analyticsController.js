const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const analyticsService = require('../services/analyticsService');
const reliabilityService = require('../services/reliabilityService');

/**
 * @route   GET /api/analytics/insights
 * @access  Private
 * The "AI Spending Insights" engine - a single bundle of business analytics
 * built entirely from MongoDB aggregation + business logic (no external AI API).
 */
const getInsights = asyncHandler(async (req, res) => {
  const [
    revenue,
    monthlyGrowth,
    outstandingTrend,
    averageCollectionTime,
    highestPayingCustomer,
    mostDelayedCustomer,
    highestSellingProduct,
    topCustomers,
    predictedCollection,
  ] = await Promise.all([
    analyticsService.getRevenueStats(),
    analyticsService.getMonthlyGrowth(6),
    analyticsService.getOutstandingTrend(6),
    analyticsService.getAverageCollectionTime(),
    analyticsService.getHighestPayingCustomer(),
    analyticsService.getMostDelayedCustomer(),
    analyticsService.getHighestSellingProduct(),
    analyticsService.getTopCustomers(5),
    analyticsService.getPredictedCollection(),
  ]);

  // "Recent Business Performance": current 30-day window vs the prior 30 days
  const now = new Date();
  const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prev30Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [last30, prev30] = await Promise.all([
    Invoice.aggregate([
      { $match: { isDeleted: false, invoiceDate: { $gte: last30Start, $lte: now } } },
      { $group: { _id: null, invoiceCount: { $sum: 1 }, billed: { $sum: '$grandTotal' }, collected: { $sum: '$paidAmount' } } },
    ]),
    Invoice.aggregate([
      { $match: { isDeleted: false, invoiceDate: { $gte: prev30Start, $lt: last30Start } } },
      { $group: { _id: null, invoiceCount: { $sum: 1 }, billed: { $sum: '$grandTotal' }, collected: { $sum: '$paidAmount' } } },
    ]),
  ]);

  const cur = last30[0] || { invoiceCount: 0, billed: 0, collected: 0 };
  const prev = prev30[0] || { invoiceCount: 0, billed: 0, collected: 0 };
  const pctChange = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 10000) / 100 : null);

  const recentBusinessPerformance = {
    last30Days: cur,
    previous30Days: prev,
    invoiceCountChangePercent: pctChange(cur.invoiceCount, prev.invoiceCount),
    billedChangePercent: pctChange(cur.billed, prev.billed),
    collectedChangePercent: pctChange(cur.collected, prev.collected),
  };

  res.status(200).json({
    success: true,
    data: {
      revenueGrowth: monthlyGrowth,
      collectionEfficiency: revenue.collectionEfficiency,
      averageCollectionTime,
      monthlyGrowth,
      outstandingTrend,
      topCustomers,
      highestPayingCustomer,
      mostDelayedCustomer,
      highestSellingProduct,
      predictedCollection,
      recentBusinessPerformance,
    },
  });
});

/**
 * @route   GET /api/analytics/reliability/:customerId
 * @access  Private
 * Computes AND persists the reliability score for a single customer.
 */
const getCustomerReliability = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.customerId, isDeleted: false });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  const result = await reliabilityService.computeAndSaveCustomerReliability(customer._id);

  res.status(200).json({ success: true, data: result });
});

/**
 * @route   GET /api/analytics/reliability
 * @access  Private
 * Returns the currently stored reliability/risk snapshot for every customer
 * (fast - reads from the Customer collection rather than recomputing live).
 */
const getAllCustomerReliability = asyncHandler(async (req, res) => {
  const customers = await Customer.find({ isDeleted: false })
    .select('name companyName email reliabilityScore paymentRisk riskReason riskRecommendation')
    .sort({ reliabilityScore: 1 }); // riskiest customers first

  res.status(200).json({ success: true, data: customers });
});

/**
 * @route   POST /api/analytics/reliability/recalculate
 * @access  Private
 * Recomputes and persists reliability/risk for every active customer.
 */
const recalculateAllReliability = asyncHandler(async (req, res) => {
  const results = await reliabilityService.recomputeAllCustomersReliability();

  const summary = { Low: 0, Medium: 0, High: 0 };
  results.forEach((r) => {
    summary[r.paymentRisk] = (summary[r.paymentRisk] || 0) + 1;
  });

  res.status(200).json({
    success: true,
    message: `Reliability recalculated for ${results.length} customers`,
    data: { totalProcessed: results.length, summary },
  });
});

module.exports = {
  getInsights,
  getCustomerReliability,
  getAllCustomerReliability,
  recalculateAllReliability,
};
