const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const ActivityLog = require('../models/ActivityLog');
const { AppError } = require('../middleware/errorHandler');
const { round2 } = require('./calculationService');
const { ACTIVITY_ACTIONS } = require('../config/constants');

/**
 * Records a payment against an invoice and keeps the invoice's paidAmount /
 * remainingAmount / status in sync. Shared by the authenticated Payments
 * module and the public simulated QR payment flow.
 *
 * @param {Object} params
 * @param {String} params.invoiceId
 * @param {Number} params.amount
 * @param {String} params.paymentMethod
 * @param {String} [params.transactionId]
 * @param {Date}   [params.date]
 * @param {String} [params.recordedBy] - User id, omitted for public QR payments
 * @param {Boolean} [params.isQrPayment]
 */
const recordPayment = async ({
  invoiceId,
  amount,
  paymentMethod,
  transactionId = '',
  date = new Date(),
  recordedBy = null,
  isQrPayment = false,
}) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, isDeleted: false });
  if (!invoice) {
    throw new AppError('Invoice not found', 404);
  }

  const paymentAmount = round2(Number(amount));
  if (paymentAmount <= 0) {
    throw new AppError('Payment amount must be greater than 0', 400);
  }
  if (paymentAmount > invoice.remainingAmount + 0.01) {
    throw new AppError(
      `Payment amount (Rs. ${paymentAmount}) exceeds the remaining balance (Rs. ${invoice.remainingAmount})`,
      400
    );
  }

  const payment = await Payment.create({
    invoice: invoice._id,
    customer: invoice.customer,
    amount: paymentAmount,
    paymentMethod,
    transactionId,
    date,
    recordedBy,
    isQrPayment,
  });

  invoice.paidAmount = round2(invoice.paidAmount + paymentAmount);
  invoice.remainingAmount = round2(Math.max(invoice.grandTotal - invoice.paidAmount, 0));

  if (invoice.remainingAmount <= 0) {
    invoice.status = 'Paid';
  } else if (invoice.paidAmount > 0) {
    invoice.status = 'Partial';
  }

  await invoice.save();

  await ActivityLog.create({
    user: recordedBy,
    userName: isQrPayment ? 'Customer (QR Payment)' : 'Admin',
    action: ACTIVITY_ACTIONS.PAYMENT_RECORDED,
    description: `Payment of Rs. ${paymentAmount} recorded for invoice ${invoice.invoiceNumber} via ${paymentMethod}`,
    relatedInvoice: invoice._id,
    relatedCustomer: invoice.customer,
  });

  if (isQrPayment) {
    await ActivityLog.create({
      user: null,
      userName: 'Customer (QR Payment)',
      action: ACTIVITY_ACTIONS.QR_PAYMENT_COMPLETED,
      description: `QR payment of Rs. ${paymentAmount} completed for invoice ${invoice.invoiceNumber}`,
      relatedInvoice: invoice._id,
      relatedCustomer: invoice.customer,
    });
  }

  return { payment, invoice };
};

module.exports = { recordPayment };
