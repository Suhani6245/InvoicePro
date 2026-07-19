const express = require('express');
const router = express.Router();

const {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  emailInvoice,
  getPublicInvoiceForPayment,
  payInvoiceViaQr,
} = require('../controllers/invoiceController');
const { protect } = require('../middleware/authMiddleware');
const {
  createInvoiceValidator,
  updateInvoiceValidator,
} = require('../middleware/validators/invoiceValidator');

// --- Public routes (what the QR code links to - no login required) ---
// Mounted before the `protect` middleware below on purpose.
router.get('/pay/:invoiceNumber', getPublicInvoiceForPayment);
router.post('/pay/:invoiceNumber', payInvoiceViaQr);

// --- Everything else requires authentication ---
router.use(protect);

router.route('/').post(createInvoiceValidator, createInvoice).get(getInvoices);

router.get('/:id/pdf', downloadInvoicePdf);
router.post('/:id/send-email', emailInvoice);

router
  .route('/:id')
  .get(getInvoiceById)
  .put(updateInvoiceValidator, updateInvoice)
  .delete(deleteInvoice);

module.exports = router;
