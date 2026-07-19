module.exports = {
  INVOICE_STATUS: {
    PENDING: 'Pending',
    PARTIAL: 'Partial',
    PAID: 'Paid',
    OVERDUE: 'Overdue',
  },

  PAYMENT_METHODS: ['Cash', 'UPI', 'Card', 'Bank Transfer', 'QR Payment', 'Other'],

  RISK_LEVELS: {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
  },

  USER_ROLES: {
    ADMIN: 'admin',
  },

  ACTIVITY_ACTIONS: {
    CUSTOMER_CREATED: 'Customer Created',
    CUSTOMER_UPDATED: 'Customer Updated',
    CUSTOMER_DELETED: 'Customer Deleted',
    INVOICE_GENERATED: 'Invoice Generated',
    INVOICE_UPDATED: 'Invoice Updated',
    INVOICE_DELETED: 'Invoice Deleted',
    PAYMENT_RECORDED: 'Payment Recorded',
    INVOICE_SENT: 'Invoice Sent',
    REMINDER_SENT: 'Reminder Sent',
    FRAUD_ALERT: 'Fraud Alert',
    DUPLICATE_INVOICE_WARNING: 'Duplicate Invoice Warning',
    QR_PAYMENT_COMPLETED: 'QR Payment Completed',
    LOGIN: 'User Login',
    LOGOUT: 'User Logout',
  },

  // Invoice numbering prefix, e.g. INV-1001
  INVOICE_PREFIX: 'INV-',
  INVOICE_START_NUMBER: 1000,
};
