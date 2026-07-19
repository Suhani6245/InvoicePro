const { body, validationResult } = require('express-validator');
const { AppError } = require('../errorHandler');
const { PAYMENT_METHODS } = require('../../config/constants');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e) => e.msg)
      .join(', ');
    return next(new AppError(message, 400));
  }
  next();
};

const createPaymentValidator = [
  body('invoice').notEmpty().withMessage('Invoice is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod')
    .trim()
    .isIn(PAYMENT_METHODS)
    .withMessage(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`),
  body('transactionId').optional().trim(),
  body('date').optional().isISO8601().withMessage('Date must be a valid date'),
  validate,
];

module.exports = { createPaymentValidator };
