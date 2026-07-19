const asyncHandler = require('../middleware/asyncHandler');
const analyticsService = require('../services/analyticsService');

/**
 * @route   GET /api/dashboard
 * @access  Private
 * Single endpoint that returns everything the dashboard page needs in one call.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const [
    counts,
    revenue,
    monthlyRevenue,
    averageCollectionTime,
    highestPayingCustomer,
    mostDelayedCustomer,
    highestSellingProduct,
    predictedCollection,
  ] = await Promise.all([
    analyticsService.getCounts(),
    analyticsService.getRevenueStats(),
    analyticsService.getMonthlyRevenue(6),
    analyticsService.getAverageCollectionTime(),
    analyticsService.getHighestPayingCustomer(),
    analyticsService.getMostDelayedCustomer(),
    analyticsService.getHighestSellingProduct(),
    analyticsService.getPredictedCollection(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalCustomers: counts.totalCustomers,
      totalInvoices: counts.totalInvoices,
      statusCounts: counts.statusCounts, // { Pending, Partial, Paid, Overdue }
      revenue: revenue.totalRevenue,
      totalBilled: revenue.totalBilled,
      outstandingBalance: revenue.outstandingBalance,
      collectionEfficiency: revenue.collectionEfficiency,
      averageCollectionTime, // in days
      highestPayingCustomer,
      mostDelayedCustomer,
      highestSellingProduct,
      predictedCollection,
      revenueGraph: monthlyRevenue, // ready for Chart.js: [{ label, revenue }]
    },
  });
});

module.exports = { getDashboard };
