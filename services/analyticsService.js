const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Maintenance step: flips any past-due invoices with a remaining balance to
 * "Overdue" before running aggregations, so dashboard/analytics numbers
 * always reflect the current real-world state (not just what was true the
 * last time each invoice happened to be individually fetched).
 */
const syncOverdueStatuses = async () => {
  await Invoice.updateMany(
    {
      isDeleted: false,
      status: { $nin: ['Paid', 'Overdue'] },
      dueDate: { $lt: new Date() },
      remainingAmount: { $gt: 0 },
    },
    { $set: { status: 'Overdue' } }
  );
};

/**
 * Total customers + total invoices + invoice counts broken down by status.
 */
const getCounts = async () => {
  await syncOverdueStatuses();

  const [totalCustomers, totalInvoices, statusAgg] = await Promise.all([
    Customer.countDocuments({ isDeleted: false }),
    Invoice.countDocuments({ isDeleted: false }),
    Invoice.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const statusCounts = { Pending: 0, Partial: 0, Paid: 0, Overdue: 0 };
  statusAgg.forEach((s) => {
    if (statusCounts[s._id] !== undefined) statusCounts[s._id] = s.count;
  });

  return { totalCustomers, totalInvoices, statusCounts };
};

/**
 * Total billed, total collected (revenue) and total outstanding balance.
 */
const getRevenueStats = async () => {
  const [agg] = await Invoice.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalBilled: { $sum: '$grandTotal' },
        totalRevenue: { $sum: '$paidAmount' },
        outstandingBalance: { $sum: '$remainingAmount' },
      },
    },
  ]);

  const totalBilled = agg?.totalBilled || 0;
  const totalRevenue = agg?.totalRevenue || 0;
  const outstandingBalance = agg?.outstandingBalance || 0;

  const collectionEfficiency = totalBilled > 0 ? round2((totalRevenue / totalBilled) * 100) : 0;

  return {
    totalBilled: round2(totalBilled),
    totalRevenue: round2(totalRevenue),
    outstandingBalance: round2(outstandingBalance),
    collectionEfficiency,
  };
};

/**
 * Revenue collected (from Payments) per month for the last `monthsBack` months,
 * including months with zero revenue so the chart line doesn't skip gaps.
 */
const getMonthlyRevenue = async (monthsBack = 6) => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - (monthsBack - 1));

  const agg = await Payment.aggregate([
    { $match: { date: { $gte: start } } },
    {
      $group: {
        _id: { year: { $year: '$date' }, month: { $month: '$date' } },
        revenue: { $sum: '$amount' },
      },
    },
  ]);

  const map = new Map(agg.map((a) => [`${a._id.year}-${a._id.month}`, round2(a.revenue)]));

  const result = [];
  const cursor = new Date(start);
  for (let i = 0; i < monthsBack; i += 1) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
    result.push({
      label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
      revenue: map.get(key) || 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return result;
};

/**
 * Month-over-month revenue growth percentage, derived from getMonthlyRevenue.
 */
const getMonthlyGrowth = async (monthsBack = 6) => {
  const monthly = await getMonthlyRevenue(monthsBack);
  return monthly.map((m, idx) => {
    if (idx === 0) return { ...m, growthPercent: null };
    const prev = monthly[idx - 1].revenue;
    const growthPercent = prev > 0 ? round2(((m.revenue - prev) / prev) * 100) : null;
    return { ...m, growthPercent };
  });
};

/**
 * Average number of days between invoice date and the date it was fully paid,
 * approximated using the latest payment date recorded on each "Paid" invoice.
 */
const getAverageCollectionTime = async () => {
  const paidInvoices = await Invoice.aggregate([
    { $match: { isDeleted: false, status: 'Paid' } },
    {
      $lookup: {
        from: 'payments',
        localField: '_id',
        foreignField: 'invoice',
        as: 'payments',
      },
    },
    { $match: { 'payments.0': { $exists: true } } },
    {
      $project: {
        invoiceDate: 1,
        lastPaymentDate: { $max: '$payments.date' },
      },
    },
  ]);

  if (paidInvoices.length === 0) return 0;

  const totalDays = paidInvoices.reduce((sum, inv) => {
    const days = (new Date(inv.lastPaymentDate) - new Date(inv.invoiceDate)) / MS_IN_DAY;
    return sum + Math.max(days, 0);
  }, 0);

  return round2(totalDays / paidInvoices.length);
};

/**
 * Customer who has paid the most in total (all-time), based on Payment records.
 */
const getHighestPayingCustomer = async () => {
  const [top] = await Payment.aggregate([
    { $group: { _id: '$customer', totalPaid: { $sum: '$amount' } } },
    { $sort: { totalPaid: -1 } },
    { $limit: 1 },
    {
      $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' },
    },
    { $unwind: '$customer' },
    { $project: { name: '$customer.name', companyName: '$customer.companyName', totalPaid: 1 } },
  ]);

  return top || null;
};

/**
 * Customer with the largest average delay (days past due) across their
 * currently overdue invoices - i.e. the most consistently late payer.
 */
const getMostDelayedCustomer = async () => {
  await syncOverdueStatuses();

  const [top] = await Invoice.aggregate([
    { $match: { isDeleted: false, status: 'Overdue' } },
    {
      $project: {
        customer: 1,
        remainingAmount: 1,
        daysLate: { $divide: [{ $subtract: [new Date(), '$dueDate'] }, MS_IN_DAY] },
      },
    },
    {
      $group: {
        _id: '$customer',
        avgDaysLate: { $avg: '$daysLate' },
        totalOverdue: { $sum: '$remainingAmount' },
        overdueInvoiceCount: { $sum: 1 },
      },
    },
    { $sort: { avgDaysLate: -1 } },
    { $limit: 1 },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
    {
      $project: {
        name: '$customer.name',
        companyName: '$customer.companyName',
        avgDaysLate: { $round: ['$avgDaysLate', 1] },
        totalOverdue: 1,
        overdueInvoiceCount: 1,
      },
    },
  ]);

  return top || null;
};

/**
 * Product with the highest total revenue across all invoice line items.
 */
const getHighestSellingProduct = async () => {
  const [top] = await Invoice.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productName',
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.total' },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 1 },
    { $project: { productName: '$_id', totalQuantity: 1, totalRevenue: 1, _id: 0 } },
  ]);

  return top || null;
};

/**
 * Top N customers ranked by total amount paid.
 */
const getTopCustomers = async (limit = 5) => {
  const top = await Payment.aggregate([
    { $group: { _id: '$customer', totalPaid: { $sum: '$amount' }, paymentCount: { $sum: 1 } } },
    { $sort: { totalPaid: -1 } },
    { $limit: limit },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
    {
      $project: {
        name: '$customer.name',
        companyName: '$customer.companyName',
        email: '$customer.email',
        totalPaid: 1,
        paymentCount: 1,
      },
    },
  ]);

  return top;
};

/**
 * Simple, transparent forecast: predicted next month's collection is the
 * average of the last 3 months' actual collected revenue. No external AI -
 * pure trailing-average projection, clearly labelled as an estimate.
 */
const getPredictedCollection = async () => {
  const monthly = await getMonthlyRevenue(3);
  const avg = monthly.reduce((sum, m) => sum + m.revenue, 0) / monthly.length;
  return round2(avg);
};

/**
 * Outstanding balance grouped by the month the invoice was raised - gives a
 * rough trend of how unpaid balances are accumulating over time.
 */
const getOutstandingTrend = async (monthsBack = 6) => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - (monthsBack - 1));

  const agg = await Invoice.aggregate([
    { $match: { isDeleted: false, invoiceDate: { $gte: start } } },
    {
      $group: {
        _id: { year: { $year: '$invoiceDate' }, month: { $month: '$invoiceDate' } },
        outstanding: { $sum: '$remainingAmount' },
      },
    },
  ]);

  const map = new Map(agg.map((a) => [`${a._id.year}-${a._id.month}`, round2(a.outstanding)]));

  const result = [];
  const cursor = new Date(start);
  for (let i = 0; i < monthsBack; i += 1) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}`;
    result.push({
      label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      outstanding: map.get(key) || 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return result;
};

module.exports = {
  syncOverdueStatuses,
  getCounts,
  getRevenueStats,
  getMonthlyRevenue,
  getMonthlyGrowth,
  getAverageCollectionTime,
  getHighestPayingCustomer,
  getMostDelayedCustomer,
  getHighestSellingProduct,
  getTopCustomers,
  getPredictedCollection,
  getOutstandingTrend,
};
