require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db');
const bootstrapAdmin = require('./config/bootstrapAdmin');
const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const activityRoutes = require('./routes/activityRoutes');
const decisionRoutes = require('./routes/decisionRoutes');

const app = express();

// ------------------------------
// Database
// ------------------------------
connectDB().then(() => bootstrapAdmin());

// ------------------------------
// Security & core middleware
// ------------------------------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// Rate limiting - applied to all API routes
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// ------------------------------
// API Routes
// ------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/activity-logs', activityRoutes);
app.use('/api/decisions', decisionRoutes);

// Simple health check for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'InvoicePro API is running', time: new Date().toISOString() });
});

// ------------------------------
// Frontend (static, vanilla HTML/CSS/JS)
// ------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Public QR payment page - what the invoice QR code links to
app.get('/payment/:invoiceNumber', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment.html'));
});

// Fallback to index.html for any non-API route (simple client-side navigation)
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------------------
// Error handling (must be last)
// ------------------------------
app.use(notFound);
app.use(errorHandler);

// ------------------------------
// Start server
// ------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`InvoicePro server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Safety nets for unexpected crashes
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
});
