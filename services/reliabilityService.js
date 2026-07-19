const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Payment = require('../models/Payment');

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Computes a 0-100 reliability score, a star rating, a payment-risk level,
 * and a plain-language reason + recommendation for a single customer, based
 * purely on their invoicing/payment history. Does NOT persist - see
 * computeAndSaveCustomerReliability for the version that writes back.
 */
const computeCustomerReliability = async (customerId) => {
  const invoices = await Invoice.find({ customer: customerId, isDeleted: false })
    .populate({ path: 'customer', select: '_id' })
    .lean();

  // Need payment dates for "paid late" detection - pull separately to keep this readable
  const Payment = require('../models/Payment');
  const payments = await Payment.find({ customer: customerId }).sort({ date: -1 }).lean();
  const lastPaymentDateByInvoice = new Map();
  payments.forEach((p) => {
    const key = String(p.invoice);
    if (!lastPaymentDateByInvoice.has(key)) lastPaymentDateByInvoice.set(key, p.date);
  });

  const totalInvoices = invoices.length;

  if (totalInvoices === 0) {
    return {
      reliabilityScore: 100,
      stars: 5,
      paymentRisk: 'Low',
      riskReason: 'No invoicing history yet',
      riskRecommendation: 'Safe To Provide Credit',
      metrics: { averageDelayDays: 0, lateInvoiceRatio: 0, outstanding: 0, averageInvoiceValue: 0, totalInvoices: 0 },
    };
  }

  const now = new Date();
  let lateCount = 0;
  let totalDelayDays = 0;
  let outstanding = 0;
  let totalBilled = 0;

  invoices.forEach((inv) => {
    outstanding += inv.remainingAmount;
    totalBilled += inv.grandTotal;

    const dueDate = new Date(inv.dueDate);
    const lastPaymentDate = lastPaymentDateByInvoice.get(String(inv._id));

    if (inv.status === 'Overdue') {
      lateCount += 1;
      totalDelayDays += Math.max((now - dueDate) / MS_IN_DAY, 0);
    } else if (inv.status === 'Paid' && lastPaymentDate && new Date(lastPaymentDate) > dueDate) {
      lateCount += 1;
      totalDelayDays += Math.max((new Date(lastPaymentDate) - dueDate) / MS_IN_DAY, 0);
    }
  });

  const lateInvoiceRatio = lateCount / totalInvoices;
  const averageDelayDays = lateCount > 0 ? round2(totalDelayDays / lateCount) : 0;
  const averageInvoiceValue = round2(totalBilled / totalInvoices);

  // --- Scoring: start perfect, subtract penalties ---
  let score = 100;
  score -= Math.min(40, averageDelayDays * 2); // longer average delay hurts more, capped
  score -= lateInvoiceRatio * 30; // proportion of invoices that were/are late
  const outstandingRatio = averageInvoiceValue > 0 ? outstanding / averageInvoiceValue : 0;
  score -= Math.min(20, outstandingRatio * 5); // large outstanding relative to typical invoice size
  score = Math.max(0, Math.min(100, Math.round(score)));

  const stars = Math.max(1, Math.round(score / 20));

  let paymentRisk = 'Low';
  if (score < 40) paymentRisk = 'High';
  else if (score < 70) paymentRisk = 'Medium';

  // --- Human-readable reason: pick the dominant driver ---
  let riskReason;
  if (lateCount === 0 && outstanding <= 0) {
    riskReason = 'Consistently pays on time with no outstanding balance';
  } else if (averageDelayDays > 15) {
    riskReason = `Payments are typically ${averageDelayDays} days late on average`;
  } else if (lateInvoiceRatio > 0.3) {
    riskReason = `${Math.round(lateInvoiceRatio * 100)}% of invoices were paid late or are overdue`;
  } else if (outstandingRatio > 1) {
    riskReason = `Outstanding balance (Rs. ${round2(outstanding)}) is high relative to typical invoice size`;
  } else {
    riskReason = 'Minor payment delays observed, otherwise reliable';
  }

  // --- Recommendation ---
  let riskRecommendation;
  const hasCurrentOverdue = invoices.some((inv) => inv.status === 'Overdue');
  if (paymentRisk === 'High') {
    riskRecommendation = 'Cash Only Recommended';
  } else if (paymentRisk === 'Medium' && hasCurrentOverdue) {
    riskRecommendation = 'Follow Up Immediately';
  } else if (paymentRisk === 'Medium') {
    riskRecommendation = 'Collect 50% Advance';
  } else {
    riskRecommendation = 'Safe To Provide Credit';
  }

  return {
    reliabilityScore: score,
    stars,
    paymentRisk,
    riskReason,
    riskRecommendation,
    metrics: {
      averageDelayDays,
      lateInvoiceRatio: round2(lateInvoiceRatio * 100),
      outstanding: round2(outstanding),
      averageInvoiceValue,
      totalInvoices,
    },
  };
};

/**
 * Computes reliability for one customer and writes the result back onto
 * their Customer document (used by the Decision Engine and customer views).
 */
const computeAndSaveCustomerReliability = async (customerId) => {
  const result = await computeCustomerReliability(customerId);

  const customer = await Customer.findByIdAndUpdate(
    customerId,
    {
      reliabilityScore: result.reliabilityScore,
      paymentRisk: result.paymentRisk,
      riskReason: result.riskReason,
      riskRecommendation: result.riskRecommendation,
    },
    { new: true }
  );

  return { customer, ...result };
};

/**
 * Recomputes reliability for every active customer. Fine at this app's
 * scale (small-business invoicing); for very large customer bases this
 * would want batching/queuing instead of a synchronous loop.
 */
const recomputeAllCustomersReliability = async () => {
  const customers = await Customer.find({ isDeleted: false }).select('_id');
  const results = [];
  for (const c of customers) {
    // Sequential on purpose to avoid hammering the DB with concurrent writes
    // eslint-disable-next-line no-await-in-loop
    const result = await computeAndSaveCustomerReliability(c._id);
    results.push(result);
  }
  return results;
};

module.exports = {
  computeCustomerReliability,
  computeAndSaveCustomerReliability,
  recomputeAllCustomersReliability,
};
