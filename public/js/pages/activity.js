/* global window, document */
(function () {
  const { esc, debounce, dateTime, api } = window.appHelpers;

  const state = { page: 1, limit: 20, action: '', search: '' };

  async function renderActivity() {
    const el = document.getElementById('pageContent');
    document.getElementById('topbarSub').textContent = 'A complete audit trail of what happened';

    let actions = [];
    try {
      const res = await api('/api/activity-logs/actions');
      actions = res.data;
    } catch (err) {
      /* non-fatal - filter dropdown just stays empty */
    }

    el.innerHTML = `
      <div class="toolbar">
        <div class="search-box"><input type="text" id="activitySearch" placeholder="Search description..." value="${esc(state.search)}" /></div>
        <select id="actionFilter">
          <option value="">All Actions</option>
          ${actions.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
        </select>
        <div class="spacer"></div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Description</th><th>Invoice</th><th>Customer</th></tr></thead>
            <tbody id="activityTableBody"><tr><td colspan="5" class="loading-row">Loading...</td></tr></tbody>
          </table>
        </div>
        <div class="card-pad"><div class="pagination" id="activityPagination"></div></div>
      </div>
    `;

    document.getElementById('actionFilter').value = state.action;
    document.getElementById('actionFilter').addEventListener('change', (e) => {
      state.action = e.target.value;
      state.page = 1;
      loadActivity();
    });
    document.getElementById('activitySearch').addEventListener(
      'input',
      debounce((e) => {
        state.search = e.target.value;
        state.page = 1;
        loadActivity();
      }, 350)
    );

    await loadActivity();
  }

  async function loadActivity() {
    const tbody = document.getElementById('activityTableBody');
    tbody.innerHTML = `<tr><td colspan="5" class="loading-row">Loading...</td></tr>`;
    try {
      const res = await api('/api/activity-logs', {
        params: { action: state.action, search: state.search, page: state.page, limit: state.limit },
      });
      const logs = res.data;

      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="emoji">🕒</div>No activity recorded yet.</div></td></tr>`;
      } else {
        tbody.innerHTML = logs
          .map(
            (log) => `
          <tr>
            <td class="text-muted" style="white-space:nowrap;">${dateTime(log.timestamp)}</td>
            <td><span class="badge badge-neutral">${esc(log.action)}</span></td>
            <td>${esc(log.description)}</td>
            <td class="text-muted">${esc(log.relatedInvoice?.invoiceNumber) || '-'}</td>
            <td class="text-muted">${esc(log.relatedCustomer?.companyName || log.relatedCustomer?.name) || '-'}</td>
          </tr>
        `
          )
          .join('');
      }

      renderPagination(res.pagination);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Failed to load: ${esc(err.message)}</div></td></tr>`;
    }
  }

  function renderPagination(pagination) {
    const el = document.getElementById('activityPagination');
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
    if (prev) prev.addEventListener('click', () => { state.page -= 1; loadActivity(); });
    if (next) next.addEventListener('click', () => { state.page += 1; loadActivity(); });
  }

  window.pages = window.pages || {};
  window.pages.renderActivity = renderActivity;
})();
