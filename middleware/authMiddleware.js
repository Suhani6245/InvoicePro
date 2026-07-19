const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const { AppError } = require('./errorHandler');
const User = require('../models/User');

/**
 * Protects routes by requiring a valid JWT in the Authorization header.
 * Usage: Authorization: Bearer <token>
 * Attaches the authenticated user to req.user (password excluded).
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    throw new AppError('Not authorized, no token provided', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError('Not authorized, invalid or expired token', 401);
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new AppError('Not authorized, user no longer exists', 401);
  }
  if (!user.isActive) {
    throw new AppError('Account has been deactivated', 403);
  }

  req.user = user;
  next();
});

/**
 * Restricts access to specific roles. Usage: authorize('admin')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw new AppError('Not authorized to perform this action', 403);
  }
  next();
};

module.exports = { protect, authorize };
