const express = require('express');
const router = express.Router();

const {
  getInsights,
  getCustomerReliability,
  getAllCustomerReliability,
  recalculateAllReliability,
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/insights', getInsights);
router.get('/reliability', getAllCustomerReliability);
router.post('/reliability/recalculate', recalculateAllReliability);
router.get('/reliability/:customerId', getCustomerReliability);

module.exports = router;
