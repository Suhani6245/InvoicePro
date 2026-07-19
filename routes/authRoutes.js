const express = require('express');
const router = express.Router();

const { register, login, logout, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const {
  registerValidator,
  loginValidator,
  changePasswordValidator,
} = require('../middleware/validators/authValidator');

router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePasswordValidator, changePassword);

module.exports = router;
