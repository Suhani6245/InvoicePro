const { body, validationResult } = require('express-validator');
const { AppError } = require('../errorHandler');

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

const createInvoiceValidator = [
  body('customer').notEmpty().withMessage('Customer is required'),
  body('invoiceDate').optional().isISO8601().withMessage('Invoice date must be a valid date'),
  body('dueDate').isISO8601().withMessage('A valid due date is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productName').trim().notEmpty().withMessage('Item product name is required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Item quantity must be greater than 0'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Item unit price must be 0 or more'),
  body('gstPercent').optional().isFloat({ min: 0, max: 100 }),
  body('discountPercent').optional().isFloat({ min: 0, max: 100 }),
  body('paidAmount').optional().isFloat({ min: 0 }),
  body('forceCreate').optional().isBoolean(),
  validate,
];

const updateInvoiceValidator = [
  body('dueDate').optional().isISO8601().withMessage('Due date must be a valid date'),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productName').optional().trim().notEmpty(),
  body('items.*.quantity').optional().isFloat({ gt: 0 }),
  body('items.*.unitPrice').optional().isFloat({ min: 0 }),
  body('gstPercent').optional().isFloat({ min: 0, max: 100 }),
  body('discountPercent').optional().isFloat({ min: 0, max: 100 }),
  validate,
];

module.exports = { createInvoiceValidator, updateInvoiceValidator };
