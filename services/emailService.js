const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

/**
 * Emails an invoice PDF to the customer.
 * @param {Object} params - { toEmail, customerName, invoice, pdfBuffer }
 */
const sendInvoiceEmail = async ({ toEmail, customerName, invoice, pdfBuffer }) => {
  const companyName = process.env.COMPANY_NAME || 'Your Company';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #222;">
      <p>Hi ${customerName || 'there'},</p>
      <p>Please find attached your invoice <strong>${invoice.invoiceNumber}</strong> from ${companyName}.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Invoice Date</td><td>${new Date(
          invoice.invoiceDate
        ).toLocaleDateString()}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Due Date</td><td>${new Date(
          invoice.dueDate
        ).toLocaleDateString()}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Grand Total</td><td>Rs. ${invoice.grandTotal.toFixed(
          2
        )}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Balance Due</td><td>Rs. ${invoice.remainingAmount.toFixed(
          2
        )}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Status</td><td>${invoice.status}</td></tr>
      </table>
      <p>You can scan the QR code on the invoice to pay instantly.</p>
      <p>Thank you for your business!</p>
      <p style="color:#888;font-size:12px;">${companyName}</p>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM || `"${companyName}" <no-reply@invoicepro.com>`,
    to: toEmail,
    subject: `Invoice ${invoice.invoiceNumber} from ${companyName}`,
    html,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  const mailer = getTransporter();
  const info = await mailer.sendMail(mailOptions);
  logger.info(`Invoice email sent to ${toEmail} for ${invoice.invoiceNumber} (messageId: ${info.messageId})`);
  return info;
};

module.exports = { sendInvoiceEmail };
