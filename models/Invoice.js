const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 }, // quantity * unitPrice
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    items: {
      type: [invoiceItemSchema],
      validate: [(arr) => arr.length > 0, 'Invoice must have at least one item'],
    },

    // --- Calculated financial fields ---
    subtotal: { type: Number, required: true, default: 0 },
    gstPercent: { type: Number, default: 18 },
    gstAmount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },

    paidAmount: { type: Number, default: 0 },
    remainingAmount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['Pending', 'Partial', 'Paid', 'Overdue'],
      default: 'Pending',
      index: true,
    },

    // --- QR Payment ---
    qrCodeDataUrl: { type: String, default: '' },
    paymentUrl: { type: String, default: '' },

    // --- Duplicate detection ---
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    duplicateSimilarityScore: { type: Number, default: 0 },

    // --- Fraud detection ---
    fraudScore: { type: Number, default: 0, min: 0, max: 100 },
    fraudRisk: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
    fraudReasons: { type: [String], default: [] },

    notes: { type: String, default: '' },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ status: 1, isDeleted: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
