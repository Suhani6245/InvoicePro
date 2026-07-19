const mongoose = require('mongoose');

// Generic counter collection used to atomically generate sequential
// invoice numbers like INV-1001, INV-1002, ...
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. 'invoiceNumber'
  seq: { type: Number, default: 1000 },
});

module.exports = mongoose.model('Counter', counterSchema);
