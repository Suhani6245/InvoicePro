/* global window, document */
(function () {
  const { money, esc, debounce, toast, openModal, closeModal, riskBadge, api } = window.appHelpers;

  const state = { page: 1, limit: 10, search: '' };

  async function renderCustomers() {
    const el = document.getElementById('pageContent');
    document.getElementById('topbarSub').textContent = 'Manage customers, view reliability & risk';

    el.innerHTML = `
      <div class="toolbar">
        <div class="search-box"><input type="text" id="customerSearch" placeholder="Search by name, email, phone, company..." value="${esc(state.search)}" /></div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="addCustomerBtn">+ Add Customer</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Reliability</th><th>Risk</th><th></th></tr></thead>
            <tbody id="customerTableBody"><tr><td colspan="7" class="loading-row">Loading...</td></tr></tbody>
          </table>
        </div>
        <div class="card-pad"><div class="pagination" id="customerPagination"></div></div>
      </div>
    `;

    document.getElementById('addCustomerBtn').addEventListener('click', () => openCustomerForm());
    document.getElementById('customerSearch').addEventListener('input', debounce((e) => {
      state.search = e.target.value;
      state.page = 1;
      loadCustomers();
    }, 350));

    await loadCustomers();
  }

  async function loadCustomers() {
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">Loading...</td></tr>`;
    try {
      const res = await api('/api/customers', { params: { search: state.search, page: state.page, limit: state.limit } });
      const customers = res.data;

      if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="emoji">👥</div>No customers found.</div></td></tr>`;
      } else {
        tbody.innerHTML = customers.map((c) => `
          <tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${esc(c.companyName) || '<span class="text-muted">-</span>'}</td>
            <td>${esc(c.email)}</td>
            <td>${esc(c.phone)}</td>
            <td><span class="reliability-stars">${'★'.repeat(Math.round(c.reliabilityScore / 20)) + '☆'.repeat(5 - Math.round(c.reliabilityScore / 20))}</span> <span class="text-muted" style="font-size:12px;">${c.reliabilityScore}</span></td>
            <td>${riskBadge(c.paymentRisk)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-outline btn-sm" data-view="${c._id}">View</button>
              <button class="btn btn-outline btn-sm" data-edit="${c._id}">Edit</button>
              <button class="btn btn-danger btn-sm" data-delete="${c._id}">Delete</button>
            </td>
          </tr>
        `).join('');
      }

      renderPagination(res.pagination);
      attachRowHandlers(customers);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">Failed to load: ${esc(err.message)}</div></td></tr>`;
    }
  }

  function renderPagination(pagination) {
    const el = document.getElementById('customerPagination');
    if (!pagination || pagination.totalPages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <span class="text-muted">Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)</span>
      <button class="btn btn-outline btn-sm" ${pagination.page <= 1 ? 'disabled' : ''} id="prevPage">Prev</button>
      <button class="btn btn-outline btn-sm" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} id="nextPage">Next</button>
    `;
    const prev = document.getElementById('prevPage');
    const next = document.getElementById('nextPage');
    if (prev) prev.addEventListener('click', () => { state.page -= 1; loadCustomers(); });
    if (next) next.addEventListener('click', () => { state.page += 1; loadCustomers(); });
  }

  function attachRowHandlers(customers) {
    document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => viewCustomer(btn.getAttribute('data-view'))));
    document.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
      const c = customers.find((x) => x._id === btn.getAttribute('data-edit'));
      openCustomerForm(c);
    }));
    document.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', () => deleteCustomer(btn.getAttribute('data-delete'))));
  }

  function openCustomerForm(customer) {
    const isEdit = !!customer;
    openModal({
      title: isEdit ? 'Edit Customer' : 'Add Customer',
      bodyHtml: `
        <form id="customerForm">
          <div class="form-grid">
            <div class="field"><label>Full Name *</label><input name="name" required value="${esc(customer?.name)}" /></div>
            <div class="field"><label>Company Name</label><input name="companyName" value="${esc(customer?.companyName)}" /></div>
            <div class="field"><label>Email *</label><input type="email" name="email" required value="${esc(customer?.email)}" /></div>
            <div class="field"><label>Phone *</label><input name="phone" required value="${esc(customer?.phone)}" /></div>
            <div class="field"><label>GST Number</label><input name="gstNumber" value="${esc(customer?.gstNumber)}" /></div>
          </div>
          <div class="field"><label>Address</label><textarea name="address">${esc(customer?.address)}</textarea></div>
        </form>
      `,
      footerHtml: `
        <button class="btn btn-outline" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="saveCustomerBtn">${isEdit ? 'Save Changes' : 'Create Customer'}</button>
      `,
    });

    document.getElementById('saveCustomerBtn').addEventListener('click', async () => {
      const form = document.getElementById('customerForm');
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const btn = document.getElementById('saveCustomerBtn');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        if (isEdit) {
          await api(`/api/customers/${customer._id}`, { method: 'PUT', body: payload });
          toast('Customer updated', 'success');
        } else {
          await api('/api/customers', { method: 'POST', body: payload });
          toast('Customer created', 'success');
        }
        closeModal();
        loadCustomers();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = isEdit ? 'Save Changes' : 'Create Customer';
      }
    });
  }

  async function viewCustomer(id) {
    openModal({ title: 'Customer Details', bodyHtml: `<div class="loading-row">Loading...</div>` });
    try {
      const res = await api(`/api/customers/${id}`);
      const { customer: c, invoiceSummary: s } = res.data;
      document.querySelector('.modal-body').innerHTML = `
        <div class="detail-grid">
          <div><div class="label">Name</div>${esc(c.name)}</div>
          <div><div class="label">Company</div>${esc(c.companyName) || '-'}</div>
          <div><div class="label">Email</div>${esc(c.email)}</div>
          <div><div class="label">Phone</div>${esc(c.phone)}</div>
          <div><div class="label">GST Number</div>${esc(c.gstNumber) || '-'}</div>
          <div><div class="label">Address</div>${esc(c.address) || '-'}</div>
        </div>
        <div class="section-title">Reliability & Risk</div>
        <div class="detail-grid">
          <div><div class="label">Score</div><span class="reliability-stars">${'★'.repeat(Math.round(c.reliabilityScore / 20))}</span> ${c.reliabilityScore}/100</div>
          <div><div class="label">Risk</div>${riskBadge(c.paymentRisk)}</div>
          <div style="grid-column:1/-1;"><div class="label">Reason</div>${esc(c.riskReason) || '-'}</div>
          <div style="grid-column:1/-1;"><div class="label">Recommendation</div><strong>${esc(c.riskRecommendation) || '-'}</strong></div>
        </div>
        <div class="section-title">Invoice Summary</div>
        <div class="detail-grid">
          <div><div class="label">Total Invoices</div>${s.totalInvoices}</div>
          <div><div class="label">Total Billed</div>${money(s.totalBilled)}</div>
          <div><div class="label">Total Paid</div>${money(s.totalPaid)}</div>
          <div><div class="label">Outstanding</div>${money(s.totalOutstanding)}</div>
        </div>
      `;
    } catch (err) {
      document.querySelector('.modal-body').innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    }
  }

  async function deleteCustomer(id) {
    openModal({
      title: 'Delete Customer',
      bodyHtml: `<p>This will soft-delete the customer. Their invoice history is preserved but they'll no longer appear in lists. Continue?</p>`,
      footerHtml: `
        <button class="btn btn-outline" data-close-modal>Cancel</button>
        <button class="btn btn-danger" id="confirmDeleteBtn">Delete</button>
      `,
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
      try {
        await api(`/api/customers/${id}`, { method: 'DELETE' });
        toast('Customer deleted', 'success');
        closeModal();
        loadCustomers();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  window.pages = window.pages || {};
  window.pages.renderCustomers = renderCustomers;
})();
