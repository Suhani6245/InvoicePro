const express = require('express');
const router = express.Router();

const { getActivityLogs, getActivityActions } = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', getActivityLogs);
router.get('/actions', getActivityActions);

module.exports = router;
