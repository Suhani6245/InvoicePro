const Payment = require('../models/Payment');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { recordPayment } = require('../services/paymentService');

/**
 * @route   POST /api/payments
 * @access  Private
 * @body    { invoice, amount, paymentMethod, transactionId?, date? }
 */
const createPayment = asyncHandler(async (req, res) => {
  const { invoice, amount, paymentMethod, transactionId, date } = req.body;

  const { payment, invoice: updatedInvoice } = await recordPayment({
    invoiceId: invoice,
    amount,
    paymentMethod,
    transactionId,
    date,
    recordedBy: req.user._id,
    isQrPayment: false,
  });

  res.status(201).json({
    success: true,
    message: 'Payment recorded successfully',
    data: {
      payment,
      invoice: {
        id: updatedInvoice._id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        paidAmount: updatedInvoice.paidAmount,
        remainingAmount: updatedInvoice.remainingAmount,
        status: updatedInvoice.status,
      },
    },
  });
});

/**
 * @route   GET /api/payments
 * @query   invoice, customer, paymentMethod, dateFrom, dateTo, page, limit
 * @access  Private
 */
const getPayments = asyncHandler(async (req, res) => {
  const { invoice, customer, paymentMethod, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (invoice) filter.invoice = invoice;
  if (customer) filter.customer = customer;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('invoice', 'invoiceNumber grandTotal status')
      .populate('customer', 'name companyName email')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum),
    Payment.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: payments,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
});

/**
 * @route   GET /api/payments/:id
 * @access  Private
 */
const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('invoice', 'invoiceNumber grandTotal status')
    .populate('customer', 'name companyName email');

  if (!payment) {
    throw new AppError('Payment not found', 404);
  }

  res.status(200).json({ success: true, data: payment });
});

module.exports = { createPayment, getPayments, getPaymentById };
