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

const createCustomerValidator = [
  body('name').trim().notEmpty().withMessage('Customer name is required'),
  body('email').trim().isEmail().withMessage('A valid email is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('address').optional().trim(),
  body('gstNumber').optional().trim(),
  body('companyName').optional().trim(),
  validate,
];

const updateCustomerValidator = [
  body('name').optional().trim().notEmpty().withMessage('Customer name cannot be empty'),
  body('email').optional().trim().isEmail().withMessage('A valid email is required'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('address').optional().trim(),
  body('gstNumber').optional().trim(),
  body('companyName').optional().trim(),
  validate,
];

module.exports = { createCustomerValidator, updateCustomerValidator };
