const express = require('express');
const router = express.Router();

const { createPayment, getPayments, getPaymentById } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { createPaymentValidator } = require('../middleware/validators/paymentValidator');

router.use(protect);

router.route('/').post(createPaymentValidator, createPayment).get(getPayments);
router.get('/:id', getPaymentById);

module.exports = router;
