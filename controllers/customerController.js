const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { ACTIVITY_ACTIONS } = require('../config/constants');

/**
 * @route   POST /api/customers
 * @access  Private
 */
const createCustomer = asyncHandler(async (req, res) => {
  const { name, email, phone, address, gstNumber, companyName } = req.body;

  const existing = await Customer.findOne({ email: email.toLowerCase(), isDeleted: false });
  if (existing) {
    throw new AppError('A customer with this email already exists', 409);
  }

  const customer = await Customer.create({
    name,
    email,
    phone,
    address,
    gstNumber,
    companyName,
  });

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.CUSTOMER_CREATED,
    description: `Customer "${customer.name}" was created`,
    relatedCustomer: customer._id,
  });

  res.status(201).json({ success: true, message: 'Customer created successfully', data: customer });
});

/**
 * @route   GET /api/customers
 * @query   search, page, limit, sortBy, sortOrder
 * @access  Private
 */
const getCustomers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const filter = { isDeleted: false };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
      { gstNumber: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;
  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const [customers, total] = await Promise.all([
    Customer.find(filter).sort(sort).skip(skip).limit(limitNum),
    Customer.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: customers,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * @route   GET /api/customers/:id
 * @access  Private
 */
const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  // Lightweight invoice summary alongside the customer profile
  const invoiceStats = await Invoice.aggregate([
    { $match: { customer: customer._id, isDeleted: false } },
    {
      $group: {
        _id: null,
        totalInvoices: { $sum: 1 },
        totalBilled: { $sum: '$grandTotal' },
        totalPaid: { $sum: '$paidAmount' },
        totalOutstanding: { $sum: '$remainingAmount' },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      customer,
      invoiceSummary: invoiceStats[0] || {
        totalInvoices: 0,
        totalBilled: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      },
    },
  });
});

/**
 * @route   PUT /api/customers/:id
 * @access  Private
 */
const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  const { name, email, phone, address, gstNumber, companyName } = req.body;

  if (email && email.toLowerCase() !== customer.email) {
    const emailTaken = await Customer.findOne({
      email: email.toLowerCase(),
      isDeleted: false,
      _id: { $ne: customer._id },
    });
    if (emailTaken) {
      throw new AppError('Another customer already uses this email', 409);
    }
  }

  if (name !== undefined) customer.name = name;
  if (email !== undefined) customer.email = email;
  if (phone !== undefined) customer.phone = phone;
  if (address !== undefined) customer.address = address;
  if (gstNumber !== undefined) customer.gstNumber = gstNumber;
  if (companyName !== undefined) customer.companyName = companyName;

  await customer.save();

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.CUSTOMER_UPDATED,
    description: `Customer "${customer.name}" was updated`,
    relatedCustomer: customer._id,
  });

  res.status(200).json({ success: true, message: 'Customer updated successfully', data: customer });
});

/**
 * @route   DELETE /api/customers/:id
 * @access  Private
 * Soft delete only - isDeleted is flipped to true, record is retained.
 */
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  customer.isDeleted = true;
  await customer.save();

  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.CUSTOMER_DELETED,
    description: `Customer "${customer.name}" was deleted (soft delete)`,
    relatedCustomer: customer._id,
  });

  res.status(200).json({ success: true, message: 'Customer deleted successfully' });
});

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
};
