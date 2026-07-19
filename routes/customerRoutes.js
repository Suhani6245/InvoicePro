const express = require('express');
const router = express.Router();

const {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customerController');
const { protect } = require('../middleware/authMiddleware');
const {
  createCustomerValidator,
  updateCustomerValidator,
} = require('../middleware/validators/customerValidator');

router.use(protect); // every customer route requires authentication

router.route('/').post(createCustomerValidator, createCustomer).get(getCustomers);

router
  .route('/:id')
  .get(getCustomerById)
  .put(updateCustomerValidator, updateCustomer)
  .delete(deleteCustomer);

module.exports = router;
