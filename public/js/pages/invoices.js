/* global window, document */
(function () {
  const { money, shortDate, esc, debounce, toast, openModal, closeModal, statusBadge, riskBadge, api, Auth } = window.appHelpers;

  const state = { page: 1, limit: 10, search: '', status: '' };
  let itemRowCount = 0;

  async function renderInvoices() {
    const el = document.getElementById('pageContent');
    document.getElementById('topbarSub').textContent = 'Create, track and collect on invoices';

    el.innerHTML = `
      <div class="toolbar">
        <div class="search-box"><input type="text" id="invoiceSearch" placeholder="Search invoice number..." value="${esc(state.search)}" /></div>
        <select id="statusFilter">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="createInvoiceBtn">+ Create Invoice</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Due</th><th class="text-right">Total</th><th class="text-right">Balance</th><th>Status</th><th>Risk</th><th></th></tr></thead>
            <tbody id="invoiceTableBody"><tr><td colspan="9" class="loading-row">Loading...</td></tr></tbody>
          </table>
        </div>
        <div class="card-pad"><div class="pagination" id="invoicePagination"></div></div>
      </div>
    `;

    document.getElementById('statusFilter').value = state.status;
    document.getElementById('createInvoiceBtn').addEventListener('click', () => openInvoiceForm());
    document.getElementById('invoiceSearch').addEventListener('input', debounce((e) => {
      state.search = e.target.value; state.page = 1; loadInvoices();
    }, 350));
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      state.status = e.target.value; state.page = 1; loadInvoices();
    });

    await loadInvoices();
  }

  async function loadInvoices() {
    const tbody = document.getElementById('invoiceTableBody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading-row">Loading...</td></tr>`;
    try {
      const res = await api('/api/invoices', { params: { search: state.search, status: state.status, page: state.page, limit: state.limit } });
      const invoices = res.data;

      if (invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="emoji">🧾</div>No invoices found.</div></td></tr>`;
      } else {
        tbody.innerHTML = invoices.map((inv) => `
          <tr>
            <td><strong>${esc(inv.invoiceNumber)}</strong></td>
            <td>${esc(inv.customer?.companyName || inv.customer?.name || '-')}</td>
            <td>${shortDate(inv.invoiceDate)}</td>
            <td>${shortDate(inv.dueDate)}</td>
            <td class="text-right mono">${money(inv.grandTotal)}</td>
            <td class="text-right mono">${money(inv.remainingAmount)}</td>
            <td>${statusBadge(inv.status)}</td>
            <td>${inv.fraudRisk !== 'Low' ? riskBadge(inv.fraudRisk) : '<span class="text-muted">-</span>'}</td>
            <td style="white-space:nowrap;"><button class="btn btn-outline btn-sm" data-view="${inv._id}">View</button></td>
          </tr>
        `).join('');
      }

      renderPagination(res.pagination);
      document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => viewInvoice(btn.getAttribute('data-view'))));
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">Failed to load: ${esc(err.message)}</div></td></tr>`;
    }
  }

  function renderPagination(pagination) {
    const el = document.getElementById('invoicePagination');
    if (!pagination || pagination.totalPages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <span class="text-muted">Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)</span>
      <button class="btn btn-outline btn-sm" ${pagination.page <= 1 ? 'disabled' : ''} id="prevPage">Prev</button>
      <button class="btn btn-outline btn-sm" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} id="nextPage">Next</button>
    `;
    const prev = document.getElementById('prevPage');
    const next = document.getElementById('nextPage');
    if (prev) prev.addEventListener('click', () => { state.page -= 1; loadInvoices(); });
    if (next) next.addEventListener('click', () => { state.page += 1; loadInvoices(); });
  }

  // ------------------------------------------------------------------
  // Create Invoice
  // ------------------------------------------------------------------
  function itemRowHtml(idx) {
    return `
      <div class="item-row" data-item-row="${idx}">
        <input type="text" placeholder="Product name" data-item-name required />
        <input type="number" placeholder="Qty" min="1" value="1" data-item-qty required />
        <input type="number" placeholder="Unit Price" min="0" step="0.01" data-item-price required />
        <div class="mono" data-item-total style="font-weight:600;">Rs. 0.00</div>
        <button type="button" class="btn btn-outline btn-icon" data-remove-row>&times;</button>
      </div>
    `;
  }

  function recalcItemRow(row) {
    const qty = Number(row.querySelector('[data-item-qty]').value) || 0;
    const price = Number(row.querySelector('[data-item-price]').value) || 0;
    row.querySelector('[data-item-total]').textContent = money(qty * price);
  }

  function recalcTotals(container) {
    const rows = [...container.querySelectorAll('[data-item-row]')];
    const subtotal = rows.reduce((sum, r) => {
      const qty = Number(r.querySelector('[data-item-qty]').value) || 0;
      const price = Number(r.querySelector('[data-item-price]').value) || 0;
      return sum + qty * price;
    }, 0);
    const gstPercent = Number(document.getElementById('gstPercentInput').value) || 0;
    const discountPercent = Number(document.getElementById('discountPercentInput').value) || 0;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxable = subtotal - discountAmount;
    const gstAmount = (taxable * gstPercent) / 100;
    const grandTotal = taxable + gstAmount;

    document.getElementById('totalsPreview').innerHTML = `
      <div class="totals-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <div class="totals-row"><span>Discount (${discountPercent}%)</span><span>- ${money(discountAmount)}</span></div>
      <div class="totals-row"><span>GST (${gstPercent}%)</span><span>${money(gstAmount)}</span></div>
      <div class="totals-row grand"><span>Grand Total</span><span>${money(grandTotal)}</span></div>
    `;
  }

  async function openInvoiceForm() {
    let customers = [];
    try {
      const res = await api('/api/customers', { params: { limit: 100 } });
      customers = res.data;
    } catch (err) {
      toast('Could not load customers: ' + err.message, 'error');
      return;
    }

    if (customers.length === 0) {
      toast('Add a customer before creating an invoice', 'error');
      return;
    }

    itemRowCount = 0;
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    openModal({
      title: 'Create Invoice',
      wide: true,
      bodyHtml: `
        <form id="invoiceForm">
          <div class="form-grid">
            <div class="field">
              <label>Customer *</label>
              <select name="customer" required>
                ${customers.map((c) => `<option value="${c._id}">${esc(c.companyName || c.name)} — ${esc(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Invoice Date</label><input type="date" name="invoiceDate" value="${today}" /></div>
            <div class="field"><label>Due Date *</label><input type="date" name="dueDate" value="${due}" required /></div>
            <div class="field"><label>Paid Amount (if any)</label><input type="number" name="paidAmount" min="0" step="0.01" value="0" /></div>
          </div>

          <div class="section-title">Items</div>
          <div class="item-row item-row-head"><span>Product</span><span>Qty</span><span>Unit Price</span><span>Total</span><span></span></div>
          <div id="itemsContainer"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addItemBtn" style="margin-top:6px;">+ Add Item</button>

          <div class="form-grid" style="margin-top:16px;">
            <div class="field"><label>GST %</label><input type="number" id="gstPercentInput" value="18" min="0" max="100" /></div>
            <div class="field"><label>Discount %</label><input type="number" id="discountPercentInput" value="0" min="0" max="100" /></div>
          </div>
          <div class="field"><label>Notes</label><textarea name="notes"></textarea></div>

          <div class="totals-box" id="totalsPreview"></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-outline" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="saveInvoiceBtn">Create Invoice</button>
      `,
    });

    const itemsContainer = document.getElementById('itemsContainer');
    const addRow = () => {
      itemRowCount += 1;
      itemsContainer.insertAdjacentHTML('beforeend', itemRowHtml(itemRowCount));
      const row = itemsContainer.lastElementChild;
      row.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { recalcItemRow(row); recalcTotals(itemsContainer); }));
      row.querySelector('[data-remove-row]').addEventListener('click', () => {
        if (itemsContainer.children.length > 1) { row.remove(); recalcTotals(itemsContainer); }
      });
    };
    addRow();
    document.getElementById('addItemBtn').addEventListener('click', addRow);
    document.getElementById('gstPercentInput').addEventListener('input', () => recalcTotals(itemsContainer));
    document.getElementById('discountPercentInput').addEventListener('input', () => recalcTotals(itemsContainer));
    recalcTotals(itemsContainer);

    document.getElementById('saveInvoiceBtn').addEventListener('click', () => submitInvoiceForm(false));
  }

  function collectInvoicePayload() {
    const form = document.getElementById('invoiceForm');
    const fd = new FormData(form);
    const items = [...document.querySelectorAll('[data-item-row]')].map((row) => ({
      productName: row.querySelector('[data-item-name]').value.trim(),
      quantity: Number(row.querySelector('[data-item-qty]').value),
      unitPrice: Number(row.querySelector('[data-item-price]').value),
    }));

    return {
      customer: fd.get('customer'),
      invoiceDate: fd.get('invoiceDate'),
      dueDate: fd.get('dueDate'),
      paidAmount: Number(fd.get('paidAmount')) || 0,
      notes: fd.get('notes'),
      items,
      gstPercent: Number(document.getElementById('gstPercentInput').value) || 0,
      discountPercent: Number(document.getElementById('discountPercentInput').value) || 0,
    };
  }

  async function submitInvoiceForm(forceCreate) {
    const form = document.getElementById('invoiceForm');
    if (!form.reportValidity()) return;

    const payload = collectInvoicePayload();
    if (payload.items.length === 0 || payload.items.some((i) => !i.productName || !i.quantity || i.unitPrice < 0)) {
      toast('Please fill in all item fields', 'error');
      return;
    }
    if (forceCreate) payload.forceCreate = true;

    const btn = document.getElementById('saveInvoiceBtn') || document.getElementById('continueAnywayBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      await api('/api/invoices', { method: 'POST', body: payload });
      toast('Invoice created successfully', 'success');
      closeModal();
      loadInvoices();
    } catch (err) {
      if (err.status === 409 && err.data?.duplicateWarning) {
        showDuplicateWarning(err.data.data, payload);
      } else {
        toast(err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Create Invoice'; }
      }
    }
  }

  function showDuplicateWarning(dup, payload) {
    openModal({
      title: 'Possible Duplicate Invoice',
      bodyHtml: `
        <p>This invoice looks similar to an existing one for this customer:</p>
        <div class="detail-grid" style="margin:12px 0;">
          <div><div class="label">Existing Invoice</div>${esc(dup.existingInvoice.invoiceNumber)}</div>
          <div><div class="label">Similarity Score</div>${dup.similarityScore}%</div>
          <div><div class="label">Amount</div>${money(dup.existingInvoice.grandTotal)}</div>
          <div><div class="label">Date</div>${shortDate(dup.existingInvoice.invoiceDate)}</div>
        </div>
        <p class="text-muted" style="font-size:12.5px;">You can cancel and review the existing invoice, or continue anyway if this is intentional.</p>
      `,
      footerHtml: `
        <button class="btn btn-outline" data-close-modal>Cancel</button>
        <button class="btn btn-danger" id="continueAnywayBtn">Continue Anyway</button>
      `,
    });
    document.getElementById('continueAnywayBtn').addEventListener('click', async () => {
      const btn = document.getElementById('continueAnywayBtn');
      btn.disabled = true; btn.textContent = 'Creating...';
      try {
        await api('/api/invoices', { method: 'POST', body: { ...payload, forceCreate: true } });
        toast('Invoice created successfully', 'success');
        closeModal();
        loadInvoices();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ------------------------------------------------------------------
  // View Invoice
  // ------------------------------------------------------------------
  async function viewInvoice(id) {
    openModal({ title: 'Invoice', wide: true, bodyHtml: `<div class="loading-row">Loading...</div>` });
    try {
      const res = await api(`/api/invoices/${id}`);
      const inv = res.data;
      document.querySelector('.modal-header h3').textContent = `Invoice ${inv.invoiceNumber}`;
      document.querySelector('.modal-body').innerHTML = `
        <div class="two-col">
          <div>
            <div class="detail-grid">
              <div><div class="label">Customer</div>${esc(inv.customer?.companyName || inv.customer?.name)}</div>
              <div><div class="label">Status</div>${statusBadge(inv.status)}</div>
              <div><div class="label">Invoice Date</div>${shortDate(inv.invoiceDate)}</div>
              <div><div class="label">Due Date</div>${shortDate(inv.dueDate)}</div>
            </div>

            <div class="section-title">Items</div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Product</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Total</th></tr></thead>
                <tbody>
                  ${inv.items.map((i) => `<tr><td>${esc(i.productName)}</td><td class="text-right">${i.quantity}</td><td class="text-right">${money(i.unitPrice)}</td><td class="text-right">${money(i.total)}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>

            <div class="totals-box">
              <div class="totals-row"><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
              <div class="totals-row"><span>Discount (${inv.discountPercent}%)</span><span>- ${money(inv.discountAmount)}</span></div>
              <div class="totals-row"><span>GST (${inv.gstPercent}%)</span><span>${money(inv.gstAmount)}</span></div>
              <div class="totals-row grand"><span>Grand Total</span><span>${money(inv.grandTotal)}</span></div>
              <div class="totals-row"><span>Paid</span><span>${money(inv.paidAmount)}</span></div>
              <div class="totals-row"><span>Balance Due</span><span>${money(inv.remainingAmount)}</span></div>
            </div>

            ${inv.fraudRisk !== 'Low' ? `
              <div class="section-title">Fraud Signal</div>
              <div class="card-pad" style="background:var(--color-danger-bg);border-radius:8px;">
                ${riskBadge(inv.fraudRisk)} <span class="text-muted" style="font-size:12.5px;">(score ${inv.fraudScore}/100)</span>
                <ul style="margin:8px 0 0;padding-left:18px;font-size:12.5px;">${(inv.fraudReasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
              </div>
            ` : ''}
          </div>
          <div>
            <div class="qr-box card">
              <img src="${inv.qrCodeDataUrl}" alt="Payment QR code" />
              <div class="text-muted" style="font-size:12px;margin-top:8px;">Scan to pay via the public payment page</div>
              <a href="${inv.paymentUrl}" target="_blank" style="font-size:11.5px;">${esc(inv.paymentUrl)}</a>
            </div>
          </div>
        </div>
      `;

      document.querySelector('.modal-footer')?.remove();
      document.querySelector('.modal').insertAdjacentHTML('beforeend', `
        <div class="modal-footer">
          <button class="btn btn-outline" id="downloadPdfBtn">Download PDF</button>
          <button class="btn btn-outline" id="emailInvoiceBtn">Email Invoice</button>
          ${inv.remainingAmount > 0 ? `<button class="btn btn-accent" id="recordPaymentBtn">Record Payment</button>` : ''}
          <button class="btn btn-danger" id="deleteInvoiceBtn">Delete</button>
        </div>
      `);

      document.getElementById('downloadPdfBtn').addEventListener('click', () => downloadInvoicePdf(inv._id, inv.invoiceNumber));
      document.getElementById('emailInvoiceBtn').addEventListener('click', () => emailInvoice(inv._id));
      document.getElementById('deleteInvoiceBtn').addEventListener('click', () => deleteInvoice(inv._id));
      const payBtn = document.getElementById('recordPaymentBtn');
      if (payBtn) payBtn.addEventListener('click', () => window.pages.openPaymentFormForInvoice(inv, () => { closeModal(); loadInvoices(); }));
    } catch (err) {
      document.querySelector('.modal-body').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    }
  }

  async function downloadInvoicePdf(id, invoiceNumber) {
    try {
      const res = await api(`/api/invoices/${id}/pdf`, { rawResponse: true });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast('Could not download PDF: ' + err.message, 'error');
    }
  }

  async function emailInvoice(id) {
    try {
      const res = await api(`/api/invoices/${id}/send-email`, { method: 'POST' });
      toast(res.message, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteInvoice(id) {
    openModal({
      title: 'Delete Invoice',
      bodyHtml: `<p>This will soft-delete the invoice. Continue?</p>`,
      footerHtml: `<button class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-danger" id="confirmDeleteInvoiceBtn">Delete</button>`,
    });
    document.getElementById('confirmDeleteInvoiceBtn').addEventListener('click', async () => {
      try {
        await api(`/api/invoices/${id}`, { method: 'DELETE' });
        toast('Invoice deleted', 'success');
        closeModal();
        loadInvoices();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  window.pages = window.pages || {};
  window.pages.renderInvoices = renderInvoices;
})();
