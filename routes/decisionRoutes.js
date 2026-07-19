const express = require('express');
const router = express.Router();

const { getDecisions } = require('../controllers/decisionController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.get('/', getDecisions);

module.exports = router;
