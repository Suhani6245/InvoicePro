/* global window, document, Chart */
(function () {
  const { money, shortDate, esc, statusBadge, api, toast } = window.appHelpers;

  async function renderDashboard() {
    const el = document.getElementById('pageContent');
    document.getElementById('topbarSub').textContent = 'Business overview at a glance';

    try {
      const [dashRes, decisionsRes] = await Promise.all([
        api('/api/dashboard'),
        api('/api/decisions'),
      ]);
      const d = dashRes.data;
      const decisions = decisionsRes.data;

      el.innerHTML = `
        <div class="stat-grid">
          <div class="card stat-tile"><div class="stat-icon">👥</div><div class="stat-label">Total Customers</div><div class="stat-value">${d.totalCustomers}</div></div>
          <div class="card stat-tile"><div class="stat-icon">🧾</div><div class="stat-label">Total Invoices</div><div class="stat-value">${d.totalInvoices}</div></div>
          <div class="card stat-tile"><div class="stat-icon">💰</div><div class="stat-label">Revenue Collected</div><div class="stat-value tiny">${money(d.revenue)}</div></div>
          <div class="card stat-tile"><div class="stat-icon">⏳</div><div class="stat-label">Outstanding Balance</div><div class="stat-value tiny">${money(d.outstandingBalance)}</div></div>
          <div class="card stat-tile"><div class="stat-icon">📈</div><div class="stat-label">Collection Efficiency</div><div class="stat-value">${d.collectionEfficiency}%</div></div>
          <div class="card stat-tile"><div class="stat-icon">⏱️</div><div class="stat-label">Avg Collection Time</div><div class="stat-value">${d.averageCollectionTime}<span style="font-size:13px;">d</span></div></div>
        </div>

        <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="card stat-tile"><div class="stat-label">Pending</div><div class="stat-value tiny">${d.statusCounts.Pending}</div></div>
          <div class="card stat-tile"><div class="stat-label">Partial</div><div class="stat-value tiny">${d.statusCounts.Partial}</div></div>
          <div class="card stat-tile"><div class="stat-label">Paid</div><div class="stat-value tiny">${d.statusCounts.Paid}</div></div>
          <div class="card stat-tile"><div class="stat-label">Overdue</div><div class="stat-value tiny">${d.statusCounts.Overdue}</div></div>
        </div>

        <div class="two-col">
          <div class="card">
            <div class="card-header"><h3>Revenue - Last 6 Months</h3></div>
            <div class="card-pad"><canvas id="revenueChart" height="110"></canvas></div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Decision Engine</h3><span class="badge badge-neutral">${decisions.length} alerts</span></div>
            <div class="card-pad" style="max-height:340px;overflow-y:auto;">
              ${decisions.length === 0
                ? `<div class="empty-state"><div class="emoji">✅</div>Nothing needs your attention right now.</div>`
                : decisions.slice(0, 12).map((dec) => `
                  <div class="decision-item">
                    <div class="decision-severity-dot ${dec.severity}"></div>
                    <div>
                      <strong style="font-size:13px;">${esc(dec.title)}</strong>
                      <div style="font-size:12.5px;color:var(--color-text-muted);margin-top:2px;">${esc(dec.recommendation)}</div>
                    </div>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>

        <div class="three-col" style="margin-top:16px;">
          <div class="card card-pad">
            <div class="section-title" style="margin-top:0;">Highest Paying Customer</div>
            ${d.highestPayingCustomer
              ? `<strong>${esc(d.highestPayingCustomer.companyName || d.highestPayingCustomer.name)}</strong><div class="text-muted" style="font-size:12.5px;margin-top:2px;">${money(d.highestPayingCustomer.totalPaid)} paid to date</div>`
              : `<span class="text-muted">No payments recorded yet</span>`}
          </div>
          <div class="card card-pad">
            <div class="section-title" style="margin-top:0;">Most Delayed Customer</div>
            ${d.mostDelayedCustomer
              ? `<strong>${esc(d.mostDelayedCustomer.companyName || d.mostDelayedCustomer.name)}</strong><div class="text-muted" style="font-size:12.5px;margin-top:2px;">${d.mostDelayedCustomer.avgDaysLate} days late on average · ${money(d.mostDelayedCustomer.totalOverdue)} overdue</div>`
              : `<span class="text-muted">No overdue invoices</span>`}
          </div>
          <div class="card card-pad">
            <div class="section-title" style="margin-top:0;">Highest Selling Product</div>
            ${d.highestSellingProduct
              ? `<strong>${esc(d.highestSellingProduct.productName)}</strong><div class="text-muted" style="font-size:12.5px;margin-top:2px;">${money(d.highestSellingProduct.totalRevenue)} · ${d.highestSellingProduct.totalQuantity} units</div>`
              : `<span class="text-muted">No sales data yet</span>`}
          </div>
        </div>

        <div class="card card-pad" style="margin-top:16px;">
          <div class="section-title" style="margin-top:0;">Predicted Next Month Collection</div>
          <div class="stat-value">${money(d.predictedCollection)}</div>
          <div class="text-muted" style="font-size:12px;margin-top:4px;">Based on the trailing 3-month average of collected revenue.</div>
        </div>
      `;

      const ctx = document.getElementById('revenueChart');
      if (ctx && window.Chart) {
        // eslint-disable-next-line no-new
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: d.revenueGraph.map((m) => m.label),
            datasets: [{
              label: 'Revenue',
              data: d.revenueGraph.map((m) => m.revenue),
              borderColor: '#2c3e88',
              backgroundColor: 'rgba(44,62,136,0.08)',
              tension: 0.35,
              fill: true,
              pointRadius: 3,
              pointBackgroundColor: '#2c3e88',
            }],
          },
          options: {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => 'Rs. ' + v } } },
          },
        });
      }
    } catch (err) {
      el.innerHTML = `<div class="empty-state">Could not load dashboard: ${esc(err.message)}</div>`;
      toast(err.message, 'error');
    }
  }

  window.pages = window.pages || {};
  window.pages.renderDashboard = renderDashboard;
})();
