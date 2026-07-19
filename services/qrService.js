const QRCode = require('qrcode');

/**
 * Builds the simulated payment URL for an invoice and generates a QR code
 * (as a base64 data URL) that points to it.
 * Example payment URL: https://yourapp.com/payment/INV-1001
 */
const generateInvoiceQr = async (invoiceNumber) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const paymentUrl = `${baseUrl}/payment/${invoiceNumber}`;

  const qrCodeDataUrl = await QRCode.toDataURL(paymentUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 300,
  });

  return { paymentUrl, qrCodeDataUrl };
};

module.exports = { generateInvoiceQr };
