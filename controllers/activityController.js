const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * @route   GET /api/activity-logs
 * @query   action, search, relatedInvoice, relatedCustomer, dateFrom, dateTo, page, limit
 * @access  Private
 * Every module in the app writes to ActivityLog as things happen (customer
 * created, invoice generated, payment recorded, fraud alerts, etc.) - this
 * endpoint is purely for reading that trail back out.
 */
const getActivityLogs = asyncHandler(async (req, res) => {
  const {
    action,
    search,
    relatedInvoice,
    relatedCustomer,
    dateFrom,
    dateTo,
    page = 1,
    limit = 30,
  } = req.query;

  const filter = {};
  if (action) filter.action = action;
  if (relatedInvoice) filter.relatedInvoice = relatedInvoice;
  if (relatedCustomer) filter.relatedCustomer = relatedCustomer;
  if (search) filter.description = { $regex: search, $options: 'i' };
  if (dateFrom || dateTo) {
    filter.timestamp = {};
    if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
    if (dateTo) filter.timestamp.$lte = new Date(dateTo);
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200);
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .populate('relatedInvoice', 'invoiceNumber')
      .populate('relatedCustomer', 'name companyName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum),
    ActivityLog.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: logs,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
});

/**
 * @route   GET /api/activity-logs/actions
 * @access  Private
 * Returns the distinct list of action types currently in the log, handy for
 * populating a filter dropdown on the frontend.
 */
const getActivityActions = asyncHandler(async (req, res) => {
  const actions = await ActivityLog.distinct('action');
  res.status(200).json({ success: true, data: actions.sort() });
});

module.exports = { getActivityLogs, getActivityActions };
