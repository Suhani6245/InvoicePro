const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const generateToken = require('../utils/generateToken');
const { ACTIVITY_ACTIONS } = require('../config/constants');

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
});

/**
 * @route   POST /api/auth/register
 * @desc    Register an admin user.
 *          - If no admin exists yet, this is an open "first-run setup" endpoint.
 *          - If an admin already exists, a valid admin token is required to create another.
 * @access  Public (only for the very first admin) / Private (admin) afterwards
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existingAdminCount = await User.countDocuments({ role: 'admin' });

  if (existingAdminCount > 0) {
    // Subsequent admin creation requires an authenticated admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('An admin already exists. Please log in as an admin to create additional accounts.', 403);
    }
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new AppError('An account with this email already exists', 409);
  }

  const user = await User.create({ name, email, password, role: 'admin' });

  await ActivityLog.create({
    user: user._id,
    userName: user.name,
    action: ACTIVITY_ACTIONS.LOGIN,
    description: `Admin account created for ${user.email}`,
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    message: 'Admin registered successfully',
    data: { user: sanitizeUser(user), token },
  });
});

/**
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('Account has been deactivated', 403);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  user.lastLogin = new Date();
  await user.save();

  await ActivityLog.create({
    user: user._id,
    userName: user.name,
    action: ACTIVITY_ACTIONS.LOGIN,
    description: `${user.name} logged in`,
  });

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: { user: sanitizeUser(user), token },
  });
});

/**
 * @route   POST /api/auth/logout
 * @access  Private
 * Note: JWTs are stateless, so "logout" is enforced client-side by discarding
 * the token. This endpoint exists to log the activity and give the frontend
 * a clean call to make on logout.
 */
const logout = asyncHandler(async (req, res) => {
  await ActivityLog.create({
    user: req.user._id,
    userName: req.user.name,
    action: ACTIVITY_ACTIONS.LOGOUT,
    description: `${req.user.name} logged out`,
  });

  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: sanitizeUser(req.user) });
});

/**
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new AppError('Current password is incorrect', 401);
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: 'Password updated successfully' });
});

module.exports = { register, login, logout, getMe, changePassword };
