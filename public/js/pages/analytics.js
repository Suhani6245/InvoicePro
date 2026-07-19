/* global window, document, Chart */
(function () {
  const { money, esc, toast, riskBadge, api } = window.appHelpers;

  let growthChart = null;

  async function renderAnalytics() {
    const el = document.getElementById('pageContent');
    document.getElementById('topbarSub').textContent = 'AI-style spending insights & customer risk analysis';

    el.innerHTML = `<div class="loading-row">Loading insights...</div>`;

    try {
      const [insightsRes, reliabilityRes] = await Promise.all([
        api('/api/analytics/insights'),
        api('/api/analytics/reliability'),
      ]);
      renderContent(insightsRes.data, reliabilityRes.data);
    } catch (err) {
      el.innerHTML = `<div class="empty-state">Could not load analytics: ${esc(err.message)}</div>`;
    }
  }

  function pct(n) {
    if (n === null || n === undefined) return '<span class="text-muted">—</span>';
    const cls = n >= 0 ? 'success' : 'danger';
    const arrow = n >= 0 ? '▲' : '▼';
    return `<span style="color:var(--color-${cls});font-weight:700;">${arrow} ${Math.abs(n)}%</span>`;
  }

  function renderContent(insights, reliability) {
    const el = document.getElementById('pageContent');
    const perf = insights.recentBusinessPerformance;

    el.innerHTML = `
      <div class="stat-grid">
        <div class="card stat-tile">
          <div class="stat-label">Collection Efficiency</div>
          <div class="stat-value">${insights.collectionEfficiency}%</div>
        </div>
        <div class="card stat-tile">
          <div class="stat-label">Avg Collection Time</div>
          <div class="stat-value">${insights.averageCollectionTime}<span style="font-size:13px;">d</span></div>
        </div>
        <div class="card stat-tile">
          <div class="stat-label">Predicted Next Month</div>
          <div class="stat-value tiny">${money(insights.predictedCollection)}</div>
        </div>
        <div class="card stat-tile">
          <div class="stat-label">Collected (Last 30d)</div>
          <div class="stat-value tiny">${money(perf.last30Days.collected)}</div>
          <div style="margin-top:4px;font-size:12px;">${pct(perf.collectedChangePercent)} vs prior 30d</div>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-header"><h3>Monthly Revenue Growth</h3></div>
          <div class="card-pad"><canvas id="growthChart" height="130"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Top 5 Customers</h3></div>
          <div class="card-pad" style="padding-top:8px;">
            ${
              insights.topCustomers.length === 0
                ? `<div class="empty-state"><div class="emoji">🏆</div>No payments recorded yet.</div>`
                : `<table>
                    <tbody>
                      ${insights.topCustomers
                        .map(
                          (c, i) => `
                        <tr>
                          <td class="text-muted" style="width:24px;">${i + 1}</td>
                          <td><strong>${esc(c.companyName || c.name)}</strong></td>
                          <td class="text-right mono">${money(c.totalPaid)}</td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>`
            }
          </div>
        </div>
      </div>

      <div class="three-col" style="margin-top:16px;">
        <div class="card card-pad">
          <div class="section-title" style="margin-top:0;">Highest Paying Customer</div>
          ${
            insights.highestPayingCustomer
              ? `<strong>${esc(insights.highestPayingCustomer.companyName || insights.highestPayingCustomer.name)}</strong>
                 <div class="text-muted" style="font-size:12.5px;margin-top:2px;">${money(insights.highestPayingCustomer.totalPaid)} paid to date</div>`
              : `<span class="text-muted">No payments recorded yet</span>`
          }
        </div>
        <div class="card card-pad">
          <div class="section-title" style="margin-top:0;">Most Delayed Customer</div>
          ${
            insights.mostDelayedCustomer
              ? `<strong>${esc(insights.mostDelayedCustomer.companyName || insights.mostDelayedCustomer.name)}</strong>
                 <div class="text-muted" style="font-size:12.5px;margin-top:2px;">${insights.mostDelayedCustomer.avgDaysLate} days late on average · ${money(insights.mostDelayedCustomer.totalOverdue)} overdue</div>`
              : `<span class="text-muted">No overdue invoices</span>`
          }
        </div>
        <div class="card card-pad">
          <div class="section-title" style="margin-top:0;">Highest Selling Product</div>
          ${
            insights.highestSellingProduct
              ? `<strong>${esc(insights.highestSellingProduct.productName)}</strong>
                 <div class="text-muted" style="font-size:12.5px;margin-top:2px;">${money(insights.highestSellingProduct.totalRevenue)} · ${insights.highestSellingProduct.totalQuantity} units</div>`
              : `<span class="text-muted">No sales data yet</span>`
          }
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-header">
          <h3>Smart Customer Reliability &amp; Payment Risk</h3>
          <button class="btn btn-outline btn-sm" id="recalcReliabilityBtn">Recalculate All</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Score</th><th>Rating</th><th>Risk</th><th>Reason</th><th>Recommendation</th></tr></thead>
            <tbody id="reliabilityTableBody">${reliabilityRows(reliability)}</tbody>
          </table>
        </div>
      </div>
    `;

    const ctx = document.getElementById('growthChart');
    if (ctx && window.Chart) {
      if (growthChart) growthChart.destroy();
      growthChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: insights.monthlyGrowth.map((m) => m.label),
          datasets: [
            {
              label: 'Revenue',
              data: insights.monthlyGrowth.map((m) => m.revenue),
              backgroundColor: '#2c3e88',
              borderRadius: 4,
              maxBarThickness: 36,
            },
          ],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { callback: (v) => 'Rs. ' + v } } },
        },
      });
    }

    document.getElementById('recalcReliabilityBtn').addEventListener('click', recalcReliability);
  }

  function reliabilityRows(customers) {
    if (customers.length === 0) {
      return `<tr><td colspan="6"><div class="empty-state"><div class="emoji">🛡️</div>No customers to analyze yet.</div></td></tr>`;
    }
    return customers
      .map((c) => {
        const stars = Math.max(1, Math.round((c.reliabilityScore || 0) / 20));
        return `
        <tr>
          <td><strong>${esc(c.companyName || c.name)}</strong></td>
          <td class="mono">${c.reliabilityScore}/100</td>
          <td><span class="reliability-stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span></td>
          <td>${riskBadge(c.paymentRisk)}</td>
          <td class="text-muted" style="max-width:220px;">${esc(c.riskReason) || '-'}</td>
          <td><strong>${esc(c.riskRecommendation) || '-'}</strong></td>
        </tr>
      `;
      })
      .join('');
  }

  async function recalcReliability() {
    const btn = document.getElementById('recalcReliabilityBtn');
    btn.disabled = true;
    btn.textContent = 'Recalculating...';
    try {
      await api('/api/analytics/reliability/recalculate', { method: 'POST' });
      const res = await api('/api/analytics/reliability');
      document.getElementById('reliabilityTableBody').innerHTML = reliabilityRows(res.data);
      toast('Reliability scores recalculated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Recalculate All';
    }
  }

  window.pages = window.pages || {};
  window.pages.renderAnalytics = renderAnalytics;
})();
