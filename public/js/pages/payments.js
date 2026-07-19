/* global window, document */
(function () {
  const { money, shortDate, esc, debounce, toast, openModal, closeModal, api } = window.appHelpers;

  const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'QR Payment', 'Other'];
  const state = { page: 1, limit: 10, method: '' };

  async function renderPayments() {
    const el = document.getElementById('pageContent');
    document.getElementById('topbarSub').textContent = 'Record and review incoming payments';

    el.innerHTML = `
      <div class="toolbar">
        <select id="methodFilter">
          <option value="">All Payment Methods</option>
          ${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="recordPaymentBtn">+ Record Payment</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Invoice #</th><th>Customer</th><th class="text-right">Amount</th>
                <th>Method</th><th>Transaction ID</th>
              </tr>
            </thead>
            <tbody id="paymentTableBody"><tr><td colspan="6" class="loading-row">Loading...</td></tr></tbody>
          </table>
        </div>
        <div class="card-pad"><div class="pagination" id="paymentPagination"></div></div>
      </div>
    `;

    document.getElementById('methodFilter').value = state.method;
    document.getElementById('methodFilter').addEventListener('change', (e) => {
      state.method = e.target.value;
      state.page = 1;
      loadPayments();
    });
    document.getElementById('recordPaymentBtn').addEventListener('click', () => openPaymentForm());

    await loadPayments();
  }

  async function loadPayments() {
    const tbody = document.getElementById('paymentTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Loading...</td></tr>`;
    try {
      const res = await api('/api/payments', {
        params: { paymentMethod: state.method, page: state.page, limit: state.limit },
      });
      const payments = res.data;

      if (payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="emoji">💳</div>No payments recorded yet.</div></td></tr>`;
      } else {
        tbody.innerHTML = payments
          .map(
            (p) => `
          <tr>
            <td>${shortDate(p.date)}</td>
            <td><strong>${esc(p.invoice?.invoiceNumber || '-')}</strong></td>
            <td>${esc(p.customer?.companyName || p.customer?.name || '-')}</td>
            <td class="text-right mono">${money(p.amount)}</td>
            <td>${esc(p.paymentMethod)}</td>
            <td class="text-muted">${esc(p.transactionId) || '-'}</td>
          </tr>
        `
          )
          .join('');
      }

      renderPagination(res.pagination);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Failed to load: ${esc(err.message)}</div></td></tr>`;
    }
  }

  function renderPagination(pagination) {
    const el = document.getElementById('paymentPagination');
    if (!pagination || pagination.totalPages <= 1) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <span class="text-muted">Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)</span>
      <button class="btn btn-outline btn-sm" ${pagination.page <= 1 ? 'disabled' : ''} id="prevPage">Prev</button>
      <button class="btn btn-outline btn-sm" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} id="nextPage">Next</button>
    `;
    const prev = document.getElementById('prevPage');
    const next = document.getElementById('nextPage');
    if (prev) prev.addEventListener('click', () => { state.page -= 1; loadPayments(); });
    if (next) next.addEventListener('click', () => { state.page += 1; loadPayments(); });
  }

  // ------------------------------------------------------------------
  // Record Payment (generic entry point - lets you pick any invoice
  // with an outstanding balance)
  // ------------------------------------------------------------------
  async function openPaymentForm() {
    let invoices = [];
    try {
      const res = await api('/api/invoices', { params: { limit: 100 } });
      invoices = res.data.filter((inv) => inv.remainingAmount > 0);
    } catch (err) {
      toast('Could not load invoices: ' + err.message, 'error');
      return;
    }

    if (invoices.length === 0) {
      toast('No invoices currently have an outstanding balance', 'error');
      return;
    }

    openModal({
      title: 'Record Payment',
      bodyHtml: `
        <form id="paymentForm">
          <div class="field">
            <label>Invoice *</label>
            <select name="invoice" id="paymentInvoiceSelect" required>
              ${invoices
                .map(
                  (inv) =>
                    `<option value="${inv._id}" data-remaining="${inv.remainingAmount}">${esc(inv.invoiceNumber)} — ${esc(
                      inv.customer?.companyName || inv.customer?.name || ''
                    )} (Balance: ${money(inv.remainingAmount)})</option>`
                )
                .join('')}
            </select>
          </div>
          ${paymentFormFieldsHtml()}
        </form>
      `,
      footerHtml: `
        <button class="btn btn-outline" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="savePaymentBtn">Record Payment</button>
      `,
    });

    wirePaymentForm(null, () => {
      closeModal();
      loadPayments();
    });
  }

  /**
   * Entry point used from the Invoice detail modal - the invoice is already
   * known, so it's shown read-only instead of as a picker.
   */
  function openPaymentFormForInvoice(invoice, onSuccess) {
    openModal({
      title: `Record Payment — ${invoice.invoiceNumber}`,
      bodyHtml: `
        <form id="paymentForm">
          <div class="detail-grid" style="margin-bottom:14px;">
            <div><div class="label">Customer</div>${esc(invoice.customer?.companyName || invoice.customer?.name || '-')}</div>
            <div><div class="label">Balance Due</div>${money(invoice.remainingAmount)}</div>
          </div>
          ${paymentFormFieldsHtml(invoice.remainingAmount)}
        </form>
      `,
      footerHtml: `
        <button class="btn btn-outline" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="savePaymentBtn">Record Payment</button>
      `,
    });

    wirePaymentForm(invoice._id, onSuccess);
  }

  function paymentFormFieldsHtml(maxAmount) {
    return `
      <div class="form-grid">
        <div class="field">
          <label>Amount *</label>
          <input type="number" name="amount" min="0.01" step="0.01" ${maxAmount ? `max="${maxAmount}"` : ''} required />
        </div>
        <div class="field">
          <label>Payment Method *</label>
          <select name="paymentMethod" required>
            ${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Transaction ID</label>
          <input type="text" name="transactionId" placeholder="Optional" />
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
      </div>
      <div class="field-hint">Recording a payment updates the invoice's paid amount, balance, and status automatically.</div>
    `;
  }

  function wirePaymentForm(fixedInvoiceId, onSuccess) {
    const invoiceSelect = document.getElementById('paymentInvoiceSelect');
    if (invoiceSelect) {
      const amountInput = document.querySelector('[name="amount"]');
      const syncMax = () => {
        const opt = invoiceSelect.options[invoiceSelect.selectedIndex];
        const remaining = opt ? opt.getAttribute('data-remaining') : null;
        if (remaining && amountInput) amountInput.max = remaining;
      };
      invoiceSelect.addEventListener('change', syncMax);
      syncMax();
    }

    document.getElementById('savePaymentBtn').addEventListener('click', async () => {
      const form = document.getElementById('paymentForm');
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      if (fixedInvoiceId) payload.invoice = fixedInvoiceId;
      payload.amount = Number(payload.amount);
      if (!payload.date) delete payload.date;
      if (!payload.transactionId) delete payload.transactionId;

      const btn = document.getElementById('savePaymentBtn');
      btn.disabled = true;
      btn.textContent = 'Recording...';
      try {
        await api('/api/payments', { method: 'POST', body: payload });
        toast('Payment recorded successfully', 'success');
        if (onSuccess) onSuccess();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Record Payment';
      }
    });
  }

  window.pages = window.pages || {};
  window.pages.renderPayments = renderPayments;
  window.pages.openPaymentFormForInvoice = openPaymentFormForInvoice;
})();
