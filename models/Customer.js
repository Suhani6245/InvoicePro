const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    gstNumber: {
      type: String,
      trim: true,
      default: '',
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    // --- Reliability & Risk Analyzer fields (calculated, not user-entered) ---
    reliabilityScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    paymentRisk: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Low',
    },
    riskReason: {
      type: String,
      default: '',
    },
    riskRecommendation: {
      type: String,
      default: '',
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Text index for search across common fields
customerSchema.index({ name: 'text', companyName: 'text', email: 'text' });

// Always exclude soft-deleted customers unless explicitly requested
customerSchema.query.notDeleted = function () {
  return this.where({ isDeleted: false });
};

module.exports = mongoose.model('Customer', customerSchema);
