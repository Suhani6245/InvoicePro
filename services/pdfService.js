const PDFDocument = require('pdfkit');

const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

/**
 * Generates a professional invoice PDF and returns it as a Buffer.
 * @param {Object} invoice - populated invoice document (customer populated)
 */
const generateInvoicePdf = (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const companyName = process.env.COMPANY_NAME || 'Your Company';
      const companyAddress = process.env.COMPANY_ADDRESS || '';
      const companyGst = process.env.COMPANY_GST || '';
      const companyEmail = process.env.COMPANY_EMAIL || '';
      const companyPhone = process.env.COMPANY_PHONE || '';

      // ---- Header: logo placeholder + company info ----
      doc
        .rect(50, 45, 60, 60)
        .strokeColor('#cccccc')
        .stroke()
        .fontSize(8)
        .fillColor('#999999')
        .text('LOGO', 50, 70, { width: 60, align: 'center' });

      doc
        .fillColor('#111111')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(companyName, 120, 45);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#444444')
        .text(companyAddress, 120, 68, { width: 300 })
        .text(`GSTIN: ${companyGst}`, 120, undefined)
        .text(`${companyEmail} | ${companyPhone}`, 120, undefined);

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor('#2c3e88')
        .text('INVOICE', 400, 45, { width: 150, align: 'right' });

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#111111')
        .text(`Invoice #: ${invoice.invoiceNumber}`, 400, 72, { width: 150, align: 'right' })
        .text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`, 400, undefined, {
          width: 150,
          align: 'right',
        })
        .text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, 400, undefined, {
          width: 150,
          align: 'right',
        });

      // Status badge
      const statusColors = {
        Paid: '#1a9c4a',
        Pending: '#c98a12',
        Partial: '#2c6fbb',
        Overdue: '#c0392b',
      };
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(statusColors[invoice.status] || '#333333')
        .text(invoice.status.toUpperCase(), 400, 128, { width: 150, align: 'right' });

      doc.moveTo(50, 155).lineTo(545, 155).strokeColor('#dddddd').stroke();

      // ---- Bill To ----
      const customer = invoice.customer || {};
      doc
        .fillColor('#666666')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('BILL TO', 50, 170);

      doc
        .fillColor('#111111')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(customer.companyName || customer.name || 'Customer', 50, 185);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#444444')
        .text(customer.name || '', 50, undefined)
        .text(customer.address || '', 50, undefined, { width: 250 })
        .text(customer.email || '', 50, undefined)
        .text(customer.phone || '', 50, undefined)
        .text(customer.gstNumber ? `GSTIN: ${customer.gstNumber}` : '', 50, undefined);

      // ---- Items table ----
      let y = 280;
      const col = { name: 50, qty: 300, price: 370, total: 460 };

      doc.rect(50, y, 495, 22).fill('#2c3e88');
      doc
        .fillColor('#ffffff')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('ITEM', col.name + 8, y + 6)
        .text('QTY', col.qty, y + 6, { width: 60, align: 'right' })
        .text('UNIT PRICE', col.price, y + 6, { width: 80, align: 'right' })
        .text('TOTAL', col.total, y + 6, { width: 75, align: 'right' });

      y += 22;
      doc.font('Helvetica').fontSize(9).fillColor('#222222');

      invoice.items.forEach((item, idx) => {
        const rowHeight = 22;
        if (idx % 2 === 0) {
          doc.rect(50, y, 495, rowHeight).fill('#f7f8fc');
          doc.fillColor('#222222');
        }
        doc
          .text(item.productName, col.name + 8, y + 6, { width: 240 })
          .text(String(item.quantity), col.qty, y + 6, { width: 60, align: 'right' })
          .text(money(item.unitPrice), col.price, y + 6, { width: 80, align: 'right' })
          .text(money(item.total), col.total, y + 6, { width: 75, align: 'right' });
        y += rowHeight;
      });

      doc.moveTo(50, y).lineTo(545, y).strokeColor('#dddddd').stroke();
      y += 12;

      // ---- Totals ----
      const totalsX = 350;
      const addTotalRow = (label, value, bold = false) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 11 : 9.5)
          .fillColor('#222222')
          .text(label, totalsX, y, { width: 100 })
          .text(value, totalsX + 100, y, { width: 95, align: 'right' });
        y += bold ? 20 : 16;
      };

      addTotalRow('Subtotal', money(invoice.subtotal));
      if (invoice.discountAmount > 0) {
        addTotalRow(`Discount (${invoice.discountPercent}%)`, `- ${money(invoice.discountAmount)}`);
      }
      addTotalRow(`GST (${invoice.gstPercent}%)`, money(invoice.gstAmount));
      doc.moveTo(totalsX, y).lineTo(545, y).strokeColor('#cccccc').stroke();
      y += 6;
      addTotalRow('Grand Total', money(invoice.grandTotal), true);
      addTotalRow('Paid', money(invoice.paidAmount));
      addTotalRow('Balance Due', money(invoice.remainingAmount), true);

      // ---- QR Code + Signature ----
      const qrY = y + 20;
      if (invoice.qrCodeDataUrl) {
        try {
          const base64Data = invoice.qrCodeDataUrl.split(',')[1];
          const qrBuffer = Buffer.from(base64Data, 'base64');
          doc.image(qrBuffer, 50, qrY, { width: 90, height: 90 });
          doc
            .fontSize(8)
            .fillColor('#666666')
            .text('Scan to pay', 50, qrY + 92, { width: 90, align: 'center' });
        } catch (e) {
          // If QR image fails for any reason, skip silently rather than break PDF generation
        }
      }

      doc
        .fontSize(9)
        .fillColor('#666666')
        .text('Authorized Signature', 400, qrY + 60, { width: 145, align: 'center' });
      doc.moveTo(400, qrY + 55).lineTo(545, qrY + 55).strokeColor('#999999').stroke();

      // ---- Footer ----
      doc
        .fontSize(8)
        .fillColor('#999999')
        .text('Thank you for your business!', 50, 760, { width: 495, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateInvoicePdf };
