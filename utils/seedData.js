/**
 * InvoicePro demo seed script.
 *
 * Populates a realistic dataset - customers with different risk profiles,
 * invoices spread across the last few months (some paid, some overdue),
 * a deliberate duplicate invoice, a high-fraud invoice, and payments -
 * so every feature (Dashboard, Analytics, Decision Engine, Reliability,
 * Activity Logs) has something meaningful to show.
 *
 * Run with: npm run seed
 * Safe to re-run - it clears existing business data first (NOT admin users).
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const ActivityLog = require('../models/ActivityLog');
const Counter = require('../models/Counter');
const User = require('../models/User');

const { calculateInvoiceTotals } = require('../services/calculationService');
const { generateInvoiceNumber } = require('../services/invoiceNumberService');
const { generateInvoiceQr } = require('../services/qrService');
const { findPossibleDuplicate } = require('../services/duplicateDetectionService');
const { calculateFraudScore } = require('../services/fraudDetectionService');
const { recordPayment } = require('../services/paymentService');
const { recomputeAllCustomersReliability } = require('../services/reliabilityService');
const { syncOverdueStatuses } = require('../services/analyticsService');
const { ACTIVITY_ACTIONS } = require('../config/constants');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const CUSTOMERS = [
  {
    name: 'Aarav Mehta',
    companyName: 'Meltech Solutions',
    email: 'aarav@meltech.example.com',
    phone: '9820011223',
    address: 'Andheri East, Mumbai, MH',
    gstNumber: '27AAMFM1234A1Z5',
  },
  {
    name: 'Priya Nair',
    companyName: 'Coastal Traders',
    email: 'priya@coastaltraders.example.com',
    phone: '9845567788',
    address: 'MG Road, Kochi, KL',
    gstNumber: '32BBCPT5678B2Z1',
  },
  {
    name: 'Rohan Kapoor',
    companyName: 'Kapoor & Sons',
    email: 'rohan@kapoorsons.example.com',
    phone: '9911223344',
    address: 'Connaught Place, New Delhi, DL',
    gstNumber: '07CCKAS9012C3Z8',
  },
  {
    name: 'Sana Iqbal',
    companyName: 'BrightPath Retail',
    email: 'sana@brightpath.example.com',
    phone: '9765432109',
    address: 'FC Road, Pune, MH',
    gstNumber: '27DDBPR3456D4Z2',
  },
  {
    name: 'Vikram Singh',
    companyName: 'Singh Logistics',
    email: 'vikram@singhlogistics.example.com',
    phone: '9888776655',
    address: 'Industrial Area, Ludhiana, PB',
    gstNumber: '03EESLG7890E5Z6',
  },
  {
    name: 'Neha Joshi',
    companyName: 'Joshi Textiles',
    email: 'neha@joshitextiles.example.com',
    phone: '9922334455',
    address: 'Ring Road, Surat, GJ',
    gstNumber: '24FFJTX2345F6Z3',
  },
  {
    name: 'Arjun Rao',
    companyName: 'Rao Electricals',
    email: 'arjun@raoelectricals.example.com',
    phone: '9701122334',
    address: 'Jubilee Hills, Hyderabad, TS',
    gstNumber: '36GGRAE6789G7Z9',
  },
  {
    name: 'Divya Menon',
    companyName: 'Menon Consulting',
    email: 'divya@menonconsulting.example.com',
    phone: '9633221100',
    address: 'Marine Drive, Kochi, KL',
    gstNumber: '32HHMCO0123H8Z4',
  },
];

const PRODUCTS = [
  { productName: 'Web Design Services', unitPrice: 15000 },
  { productName: 'Server Hosting (Monthly)', unitPrice: 3500 },
  { productName: 'Consulting Hours', unitPrice: 2000 },
  { productName: 'Logo & Branding Package', unitPrice: 12000 },
  { productName: 'SEO Retainer', unitPrice: 8000 },
  { productName: 'Office Supplies (Bulk)', unitPrice: 450 },
  { productName: 'Software License', unitPrice: 6000 },
  { productName: 'Freight & Logistics', unitPrice: 5200 },
];

const randomItems = (count = 2) => {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const p = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
    items.push({
      productName: p.productName,
      quantity: Math.ceil(Math.random() * 4),
      unitPrice: p.unitPrice,
    });
  }
  return items;
};

/**
 * Creates one invoice end-to-end using the exact same services the real API
 * uses (duplicate check, fraud score, numbering, QR) - so seeded data behaves
 * identically to data created through the app itself.
 */
const createSeedInvoice = async ({ customer, invoiceDate, dueDate, items, gstPercent = 18, discountPercent = 0, forceCreate = false }) => {
  const totals = calculateInvoiceTotals({ items, gstPercent, discountPercent, paidAmount: 0 });

  const duplicateCheck = await findPossibleDuplicate({
    customerId: customer._id,
    grandTotal: totals.grandTotal,
    items: totals.items,
    invoiceDate,
  });

  if (duplicateCheck.isDuplicate && !forceCreate) {
    // Not the demo duplicate we intentionally want - nudge amount slightly and retry once
    totals.items[0].quantity += 1;
    return createSeedInvoice({ customer, invoiceDate, dueDate, items: totals.items, gstPercent, discountPercent, forceCreate });
  }

  const fraud = await calculateFraudScore({
    customerId: customer._id,
    grandTotal: totals.grandTotal,
    items: totals.items,
    invoiceDate,
    isDuplicate: duplicateCheck.isDuplicate,
  });

  const invoiceNumber = await generateInvoiceNumber();
  const { paymentUrl, qrCodeDataUrl } = await generateInvoiceQr(invoiceNumber);

  const invoice = await Invoice.create({
    invoiceNumber,
    customer: customer._id,
    invoiceDate,
    dueDate,
    ...totals,
    paymentUrl,
    qrCodeDataUrl,
    duplicateOf: duplicateCheck.isDuplicate ? duplicateCheck.existingInvoice.id : null,
    duplicateSimilarityScore: duplicateCheck.similarityScore,
    fraudScore: fraud.fraudScore,
    fraudRisk: fraud.fraudRisk,
    fraudReasons: fraud.fraudReasons,
  });

  await ActivityLog.create({
    userName: 'Seed Script',
    action: ACTIVITY_ACTIONS.INVOICE_GENERATED,
    description: `Invoice ${invoice.invoiceNumber} generated for "${customer.name}" (Rs. ${invoice.grandTotal})`,
    relatedInvoice: invoice._id,
    relatedCustomer: customer._id,
  });

  if (duplicateCheck.isDuplicate) {
    await ActivityLog.create({
      userName: 'Seed Script',
      action: ACTIVITY_ACTIONS.DUPLICATE_INVOICE_WARNING,
      description: `Invoice ${invoice.invoiceNumber} flagged as a possible duplicate (${duplicateCheck.similarityScore}% similarity) and created anyway for demo purposes`,
      relatedInvoice: invoice._id,
      relatedCustomer: customer._id,
    });
  }

  if (fraud.fraudRisk === 'High') {
    await ActivityLog.create({
      userName: 'Seed Script',
      action: ACTIVITY_ACTIONS.FRAUD_ALERT,
      description: `High fraud risk (${fraud.fraudScore}/100) on invoice ${invoice.invoiceNumber}: ${fraud.fraudReasons.join('; ')}`,
      relatedInvoice: invoice._id,
      relatedCustomer: customer._id,
    });
  }

  return invoice;
};

const pay = async (invoice, ratio, daysAfterInvoice) => {
  const amount = Math.round(invoice.grandTotal * ratio * 100) / 100;
  if (amount <= 0) return;
  const methods = ['UPI', 'Bank Transfer', 'Card', 'Cash'];
  await recordPayment({
    invoiceId: invoice._id,
    amount,
    paymentMethod: methods[Math.floor(Math.random() * methods.length)],
    transactionId: `TXN${Math.floor(Math.random() * 900000 + 100000)}`,
    date: new Date(invoice.invoiceDate.getTime() + daysAfterInvoice * 24 * 60 * 60 * 1000),
  });
};

const run = async () => {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Clearing existing business data (customers, invoices, payments, activity logs)...');

  await Promise.all([
    Customer.deleteMany({}),
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    ActivityLog.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  const adminExists = await User.countDocuments({ role: 'admin' });
  if (adminExists === 0) {
    console.log('No admin account found - make sure ADMIN_EMAIL/ADMIN_PASSWORD are set in .env and start the server once first.');
  }

  console.log('Creating customers...');
  const customers = {};
  for (const c of CUSTOMERS) {
    customers[c.companyName] = await Customer.create(c);
  }

  console.log('Creating invoices and payments (this simulates ~5 months of activity)...');

  // --- Meltech Solutions: reliable, always pays on time, several months of history ---
  for (let m = 4; m >= 0; m -= 1) {
    const invDate = daysAgo(m * 28 + 3);
    const inv = await createSeedInvoice({
      customer: customers['Meltech Solutions'],
      invoiceDate: invDate,
      dueDate: new Date(invDate.getTime() + 14 * 24 * 60 * 60 * 1000),
      items: randomItems(2),
      gstPercent: 18,
    });
    await pay(inv, 1, 5); // paid in full, 5 days after invoicing
  }

  // --- Coastal Traders: reliable ---
  for (let m = 3; m >= 0; m -= 1) {
    const invDate = daysAgo(m * 30 + 10);
    const inv = await createSeedInvoice({
      customer: customers['Coastal Traders'],
      invoiceDate: invDate,
      dueDate: new Date(invDate.getTime() + 21 * 24 * 60 * 60 * 1000),
      items: randomItems(3),
      discountPercent: 5,
    });
    await pay(inv, 1, 10);
  }

  // --- Kapoor & Sons: occasionally late, one partial payment ---
  {
    const inv1Date = daysAgo(70);
    const inv1 = await createSeedInvoice({
      customer: customers['Kapoor & Sons'],
      invoiceDate: inv1Date,
      dueDate: new Date(inv1Date.getTime() + 15 * 24 * 60 * 60 * 1000),
      items: randomItems(2),
    });
    await pay(inv1, 1, 25); // paid late

    const inv2Date = daysAgo(20);
    const inv2 = await createSeedInvoice({
      customer: customers['Kapoor & Sons'],
      invoiceDate: inv2Date,
      dueDate: daysFromNow(5),
      items: randomItems(2),
    });
    await pay(inv2, 0.5, 3); // partially paid
  }

  // --- BrightPath Retail: high risk, overdue, frequently late ---
  {
    const inv1Date = daysAgo(80);
    const inv1 = await createSeedInvoice({
      customer: customers['BrightPath Retail'],
      invoiceDate: inv1Date,
      dueDate: daysAgo(60),
      items: randomItems(3),
    });
    // never paid - stays overdue

    const inv2Date = daysAgo(45);
    const inv2 = await createSeedInvoice({
      customer: customers['BrightPath Retail'],
      invoiceDate: inv2Date,
      dueDate: daysAgo(25),
      items: randomItems(2),
    });
    await pay(inv2, 0.3, 40); // small late partial payment
  }

  // --- Singh Logistics: high value, mostly paid ---
  for (let m = 2; m >= 0; m -= 1) {
    const invDate = daysAgo(m * 35 + 5);
    const inv = await createSeedInvoice({
      customer: customers['Singh Logistics'],
      invoiceDate: invDate,
      dueDate: new Date(invDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      items: randomItems(4),
    });
    await pay(inv, 1, 15);
  }

  // --- Joshi Textiles: brand new customer, no invoices yet (edge case for reliability score) ---
  // intentionally left with zero invoices

  // --- Rao Electricals: deliberate duplicate invoice + a high-fraud invoice ---
  {
    const baseDate = daysAgo(10);
    const sharedItems = [{ productName: 'Software License', quantity: 3, unitPrice: 6000 }];

    const original = await createSeedInvoice({
      customer: customers['Rao Electricals'],
      invoiceDate: baseDate,
      dueDate: daysFromNow(20),
      items: sharedItems,
    });
    await pay(original, 1, 2);

    // Same customer, same items, same amount, 1 day later - triggers duplicate detection
    await createSeedInvoice({
      customer: customers['Rao Electricals'],
      invoiceDate: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000),
      dueDate: daysFromNow(21),
      items: sharedItems,
      forceCreate: true,
    });

    // A few small recent invoices, close together - establishes a low
    // "typical" average AND creates a short-window purchase spike
    for (let i = 0; i < 3; i += 1) {
      const invDate = daysAgo(6 - i * 2); // day 6, day 4, day 2
      const inv = await createSeedInvoice({
        customer: customers['Rao Electricals'],
        invoiceDate: invDate,
        dueDate: new Date(invDate.getTime() + 14 * 24 * 60 * 60 * 1000),
        items: [{ productName: 'Consulting Hours', quantity: 1, unitPrice: 2000 }],
      });
      await pay(inv, 1, 2);
    }

    // ...then one WAY above average, with an unusual quantity, arriving right
    // after that spike - stacks three fraud rules (amount + quantity + spike)
    // so this one clearly lands as High risk for the demo.
    await createSeedInvoice({
      customer: customers['Rao Electricals'],
      invoiceDate: daysAgo(1),
      dueDate: daysFromNow(14),
      items: [{ productName: 'Office Supplies (Bulk)', quantity: 500, unitPrice: 450 }],
    });
  }

  // --- Menon Consulting: large unpaid balance (> Rs. 50,000), overdue - feeds the Decision Engine ---
  {
    const invDate = daysAgo(40);
    await createSeedInvoice({
      customer: customers['Menon Consulting'],
      invoiceDate: invDate,
      dueDate: daysAgo(15),
      items: [
        { productName: 'Consulting Hours', quantity: 20, unitPrice: 2000 },
        { productName: 'SEO Retainer', quantity: 3, unitPrice: 8000 },
      ],
    });
    // left completely unpaid
  }

  console.log('Syncing overdue statuses...');
  await syncOverdueStatuses();

  console.log('Calculating customer reliability & risk scores...');
  await recomputeAllCustomersReliability();

  const [customerCount, invoiceCount, paymentCount] = await Promise.all([
    Customer.countDocuments({}),
    Invoice.countDocuments({}),
    Payment.countDocuments({}),
  ]);

  console.log('\nDone! Seeded:');
  console.log(`  ${customerCount} customers`);
  console.log(`  ${invoiceCount} invoices (mix of Paid / Partial / Pending / Overdue)`);
  console.log(`  ${paymentCount} payments`);
  console.log('\nHighlights for your demo:');
  console.log('  - Rao Electricals: has a duplicate invoice warning AND a high fraud risk invoice');
  console.log('  - Menon Consulting: overdue invoice > Rs. 50,000 (shows up in the Decision Engine)');
  console.log('  - BrightPath Retail: high payment risk, overdue balance');
  console.log('  - Meltech Solutions / Coastal Traders: reliable, high reliability scores');
  console.log('  - Joshi Textiles: brand-new customer with zero invoice history\n');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
