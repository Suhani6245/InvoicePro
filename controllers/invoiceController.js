const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { ACTIVITY_ACTIONS } = require('../config/constants');

const { calculateInvoiceTotals } = require('../services/calculationService');
const { generateInvoiceNumber } = require('../services/invoiceNumberService');
const { generateInvoiceQr } = require('../services/qrService');
const { findPossibleDuplicate } = require('../services/duplicateDetectionService');
const { calculateFraudScore } = require('../services/fraudDetectionService');
const { applyOverdueStatus, applyOverdueStatusSingle } = require('../services/invoiceStatusService');
const { generateInvoicePdf } = require('../services/pdfService');
const { sendInvoiceEmail } = require('../services/emailService');
const { recordPayment } = require('../services/paymentService');

/**
 * @route   POST /api/invoices
 * @access  Private
 * @body    { customer, invoiceDate?, dueDate, items[], gstPercent?, discountPercent?, paidAmount?, notes?, forceCreate? }
 */
const createInvoice = asyncHandler(async (req, res) => {
  const {
    customer: customerId,
    invoiceDate = new Date(),
    dueDate,
    items,
    gstPercent,
    discountPercent,
    paidAmount,
    notes,
    forceCreate = false,
  } = req.body;

  const customer = await Customer.findOne({ _id: customerId, isDeleted: false });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  const totals = calculateInvoiceTotals({ items, gstPercent, discountPercent, paidAmount });

  // --- Duplicate detection ---
  const duplicateCheck = await findPossibleDuplicate({
    customerId: customer._id,
    grandTotal: totals.grandTotal,
    items: totals.items,
    invoiceDate,
  });

  if (duplicateCheck.isDuplicate && !forceCreate) {
    await ActivityLog.create({
      user: req.user._id,
      userName: req.user.name,
      action: ACTIVITY_ACTIONS.DUPLICATE_INVOICE_WARNING,
      description: `Possible duplicate invoice detected for customer "${customer.name}" (similarity ${duplicateCheck.similarityScore}%)`,
      relatedCustomer: customer._id,
    });

    return res.status(409).json({
      success: false,
      duplicateWarning: true,
      message: 'Possible duplicate invoice detected',
      data: duplicateCheck,
    });
  }

  // --- Fraud detection ---
  const fraud = await calculateFraudScore({
    customerId: customer._id,
    grandTotal: totals.grandTotal,
    items: totals.items,
    invoiceDate,
    isDuplicate: duplicateCheck.isDuplicate,
  });

  const invoiceNumber = await generateInvoiceNumber();
  const { paymentUrl, qrCodeDataUrl } = await generateInvoiceQr(invoiceNumber);

  const invoice = await Invoice.create({
    invoiceNumber,
    customer: customer._id,
    invoiceDate,
    dueDate,
    ...totals,
    notes,
    paymentUrl,
    qrCodeDataUrl,
    duplicateOf: duplicateCheck.isDuplicate ? duplicateCheck.existingInvoice.id : null,
    duplicateSimilarityScore: duplicateCheck.similarityScore,
    fraudScore: fraud.fraudScore,
    fraudRisk: fraud.fraudRisk,
    fraudReasons: fraud.fraudReasons,
    createdBy: req.user._id,
  });

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.INVOICE_GENERATED,
    description: `Invoice ${invoice.invoiceNumber} generated for "${customer.name}" (Rs. ${invoice.grandTotal})`,
    relatedInvoice: invoice._id,
    relatedCustomer: customer._id,
  });

  if (fraud.fraudRisk === 'High') {
    await ActivityLog.create({
      user: req.user._id,
      userName: req.user.name,
      action: ACTIVITY_ACTIONS.FRAUD_ALERT,
      description: `High fraud risk (${fraud.fraudScore}/100) on invoice ${invoice.invoiceNumber}: ${fraud.fraudReasons.join('; ')}`,
      relatedInvoice: invoice._id,
      relatedCustomer: customer._id,
    });
  }

  const populated = await Invoice.findById(invoice._id).populate(
    'customer',
    'name email phone companyName gstNumber address'
  );

  res.status(201).json({ success: true, message: 'Invoice created successfully', data: populated });
});

/**
 * @route   GET /api/invoices
 * @query   status, customer, search, dateFrom, dateTo, page, limit, sortBy, sortOrder
 * @access  Private
 */
const getInvoices = asyncHandler(async (req, res) => {
  const {
    status,
    customer,
    search,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    sortBy = 'invoiceDate',
    sortOrder = 'desc',
  } = req.query;

  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (customer) filter.customer = customer;
  if (dateFrom || dateTo) {
    filter.invoiceDate = {};
    if (dateFrom) filter.invoiceDate.$gte = new Date(dateFrom);
    if (dateTo) filter.invoiceDate.$lte = new Date(dateTo);
  }
  if (search) {
    filter.$or = [{ invoiceNumber: { $regex: search, $options: 'i' } }];
    const numericSearch = Number(search);
    if (!Number.isNaN(numericSearch)) {
      filter.$or.push({ grandTotal: numericSearch });
    }
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  let [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('customer', 'name email phone companyName')
      .sort(sort)
      .skip(skip)
      .limit(limitNum),
    Invoice.countDocuments(filter),
  ]);

  invoices = await applyOverdueStatus(invoices);

  res.status(200).json({
    success: true,
    data: invoices,
    pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
});

/**
 * @route   GET /api/invoices/:id
 * @access  Private
 */
const getInvoiceById = asyncHandler(async (req, res) => {
  let invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false }).populate(
    'customer',
    'name email phone companyName gstNumber address'
  );
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }

  invoice = await applyOverdueStatusSingle(invoice);

  res.status(200).json({ success: true, data: invoice });
});

/**
 * @route   PUT /api/invoices/:id
 * @access  Private
 * Recalculates totals if items/gst/discount change. Paid amount is managed
 * via the Payments module, not directly editable here.
 */
const updateInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false });
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }

  const { dueDate, items, gstPercent, discountPercent, notes } = req.body;

  if (items || gstPercent !== undefined || discountPercent !== undefined) {
    const totals = calculateInvoiceTotals({
      items: items || invoice.items,
      gstPercent: gstPercent !== undefined ? gstPercent : invoice.gstPercent,
      discountPercent: discountPercent !== undefined ? discountPercent : invoice.discountPercent,
      paidAmount: invoice.paidAmount,
    });
    Object.assign(invoice, totals);
  }

  if (dueDate) invoice.dueDate = dueDate;
  if (notes !== undefined) invoice.notes = notes;

  await invoice.save();

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.INVOICE_UPDATED,
    description: `Invoice ${invoice.invoiceNumber} was updated`,
    relatedInvoice: invoice._id,
    relatedCustomer: invoice.customer,
  });

  const populated = await Invoice.findById(invoice._id).populate(
    'customer',
    'name email phone companyName gstNumber address'
  );

  res.status(200).json({ success: true, message: 'Invoice updated successfully', data: populated });
});

/**
 * @route   DELETE /api/invoices/:id
 * @access  Private
 * Soft delete only.
 */
const deleteInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false });
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }

  invoice.isDeleted = true;
  await invoice.save();

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.INVOICE_DELETED,
    description: `Invoice ${invoice.invoiceNumber} was deleted (soft delete)`,
    relatedInvoice: invoice._id,
    relatedCustomer: invoice.customer,
  });

  res.status(200).json({ success: true, message: 'Invoice deleted successfully' });
});

/**
 * @route   GET /api/invoices/:id/pdf
 * @access  Private
 */
const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false }).populate(
    'customer',
    'name email phone companyName gstNumber address'
  );
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }

  const pdfBuffer = await generateInvoicePdf(invoice);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});

/**
 * @route   POST /api/invoices/:id/send-email
 * @access  Private
 */
const emailInvoice = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false }).populate(
    'customer',
    'name email phone companyName gstNumber address'
  );
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }
  if (!invoice.customer?.email) {
    throw new AppError('Customer does not have an email on file', 400);
  }

  const pdfBuffer = await generateInvoicePdf(invoice);

  await sendInvoiceEmail({
    toEmail: invoice.customer.email,
    customerName: invoice.customer.name,
    invoice,
    pdfBuffer,
  });

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.INVOICE_SENT,
    description: `Invoice ${invoice.invoiceNumber} emailed to ${invoice.customer.email}`,
    relatedInvoice: invoice._id,
    relatedCustomer: invoice.customer._id,
  });

  res.status(200).json({ success: true, message: `Invoice emailed to ${invoice.customer.email}` });
});

/**
 * @route   GET /api/invoices/pay/:invoiceNumber
 * @access  Public (no auth) - this is what the QR code links to
 */
const getPublicInvoiceForPayment = asyncHandler(async (req, res) => {
  let invoice = await Invoice.findOne({
    invoiceNumber: req.params.invoiceNumber,
    isDeleted: false,
  }).populate('customer', 'name companyName email');

  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }

  invoice = await applyOverdueStatusSingle(invoice);

  res.status(200).json({
    success: true,
    data: {
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customer?.companyName || invoice.customer?.name,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      grandTotal: invoice.grandTotal,
      paidAmount: invoice.paidAmount,
      remainingAmount: invoice.remainingAmount,
      status: invoice.status,
    },
  });
});

/**
 * @route   POST /api/invoices/pay/:invoiceNumber
 * @access  Public (no auth) - simulated "Pay Now" button
 * Pays the full remaining balance in one shot to keep the demo flow simple.
 */
const payInvoiceViaQr = asyncHandler(async (req, res) => {
  const invoice = await Invoice.findOne({
    invoiceNumber: req.params.invoiceNumber,
    isDeleted: false,
  });
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }
  if (invoice.remainingAmount <= 0) {
    throw new AppError('This invoice is already fully paid', 400);
  }

  const { payment, invoice: updatedInvoice } = await recordPayment({
    invoiceId: invoice._id,
    amount: invoice.remainingAmount,
    paymentMethod: 'QR Payment',
    transactionId: `QR-${Date.now()}`,
    isQrPayment: true,
  });

  res.status(200).json({
    success: true,
    message: 'Payment successful',
    data: {
      receipt: {
        invoiceNumber: updatedInvoice.invoiceNumber,
        amountPaid: payment.amount,
        transactionId: payment.transactionId,
        date: payment.date,
        status: updatedInvoice.status,
      },
    },
  });
});

module.exports = {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  emailInvoice,
  getPublicInvoiceForPayment,
  payInvoiceViaQr,
};
