(function() {
  'use strict';

  // ---------- State ----------
  let token = localStorage.getItem('auth_token') || null;
  let transactions = [];
  let summary = { total_income: 0, total_expense: 0, balance: 0, expenses_by_category: {} };
  let budgets = {};
  let currentDashboardChart = 'bar';   // 'bar' or 'doughnut'

  // Date range for dashboard summary
  let dashboardStartDate = null;  // if null, API defaults to current month
  let dashboardEndDate = null;

  const API_BASE = '/api';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- Helpers ----------
  function formatCurrency(amount) { return '$' + parseFloat(amount || 0).toFixed(2); }
  function escapeHtml(text) { return String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' }; }

  

  // ---------- Token Expiry ----------
  function handleAuthFailure() {
    localStorage.removeItem('auth_token');
    token = null;
    showApp(false);
    transactions = [];
    summary = { total_income: 0, total_expense: 0, balance: 0, expenses_by_category: {} };
    budgets = {};
  }

  async function checkAuth() {
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/user`, { headers: authHeaders() });
      if (res.ok) return true;
      if (res.status === 401) handleAuthFailure();
      return false;
    } catch (e) { return false; }
  }

  function showApp(show) {
    const main = document.getElementById('main-app');
    const modal = document.getElementById('auth-modal');
    if (main) main.style.display = show ? 'block' : 'none';
    if (modal) modal.style.display = show ? 'none' : 'flex';
  }

  // ---------- API Wrappers (with query string support) ----------
  async function apiGet(path, params = {}) {
    const url = new URL(`${window.location.origin}${API_BASE}${path}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 401) { handleAuthFailure(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
    if (res.status === 401) { handleAuthFailure(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function apiDelete(path) {
    const res = await fetch(`${API_BASE}${path}`, { method:'DELETE', headers: authHeaders() });
    if (res.status === 401) { handleAuthFailure(); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error(await res.text());
  }

  // ---------- Data Loading ----------
  async function loadTransactions() { transactions = await apiGet('/transactions'); }

  async function loadSummary(start = null, end = null) {
    const params = {};
    if (start && end) {
      params.start = start;
      params.end = end;
    }
    summary = await apiGet('/summary', params);
  }

  async function loadBudgets() { try { budgets = await apiGet('/budgets'); } catch(e) { budgets = {}; } }

  // ---------- Rendering ----------
  function animateBalance() {
    const el = document.getElementById('balanceAmount');
    if (!el) return;
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
  }

  function updateDashboardNumbers() {
    document.getElementById('totalIncome').textContent = formatCurrency(summary.total_income);
    document.getElementById('totalExpense').textContent = formatCurrency(summary.total_expense);
    const balEl = document.getElementById('balanceAmount');
    const newBal = formatCurrency(summary.balance);
    if (balEl) {
      if (balEl.textContent !== newBal) { balEl.textContent = newBal; animateBalance(); }
      else balEl.textContent = newBal;
    }
  }

  // ---------- Chart Toggle + Range Logic ----------
  function renderDashboardChart() {
    const barContainer = document.getElementById('barChartContainer');
    const doughnutContainer = document.getElementById('doughnutChartContainer');

    if (barContainer) barContainer.classList.remove('active');
    if (doughnutContainer) doughnutContainer.classList.remove('active');

    if (currentDashboardChart === 'bar') {
      renderBarChart('barChart', summary.expenses_by_category);
      if (barContainer) barContainer.classList.add('active');
    } else {
      renderDoughnutChart('doughnutChartDashboard', 'doughnutLegendDashboard', summary.expenses_by_category);
      if (doughnutContainer) doughnutContainer.classList.add('active');
    }
  }

  function updateToggleButtons() {
    $$('.chart-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.chart === currentDashboardChart);
    });
  }

  async function applyDashboardDateRange() {
    const startInput = document.getElementById('dashboardStartDate');
    const endInput = document.getElementById('dashboardEndDate');
    dashboardStartDate = startInput ? startInput.value : null;
    dashboardEndDate = endInput ? endInput.value : null;

    // Reload summary with range (or current month if empty)
    await loadSummary(dashboardStartDate || null, dashboardEndDate || null);
    updateDashboardNumbers();
    renderDashboardChart();
  }

  // ---------- Bar Chart ----------
  function renderBarChart(id, data) {
    const c = document.getElementById(id);
    if (!c) return;
    const entries = Object.entries(data || {});
    if (!entries.length) { c.innerHTML = '<p class="empty-state">No expense data yet.</p>'; return; }
    const max = Math.max(...entries.map(([,v])=>v), 0.01);
    entries.sort(([,a],[,b])=>b-a);
    c.innerHTML = entries.map(([cat,amt])=>`
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(cat)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(amt/max)*100}%"></div></div>
        <span class="bar-amount">${formatCurrency(amt)}</span>
      </div>
    `).join('');
  }

  // ---------- Doughnut Chart (reusable) ----------
  function renderDoughnutChart(svgId, legendId, data) {
    const svg = document.getElementById(svgId);
    const legend = document.getElementById(legendId);
    if (!svg || !legend) return;
    const colors = ['#0F766E','#059669','#D97706','#DC2626','#7C3AED','#DB2777','#0891B2','#4F46E5'];
    const entries = Object.entries(data||{}).sort(([,a],[,b])=>b-a);
    if (!entries.length) { svg.innerHTML=''; legend.innerHTML='<p>No expenses this month.</p>'; return; }
    const total = entries.reduce((s,[,v])=>s+v,0);
    const circ = 2*Math.PI*60;
    let offset=0;
    svg.innerHTML = '<circle cx="100" cy="100" r="60" fill="none" stroke="#E2E8F0" stroke-width="20"/>';
    legend.innerHTML='';
    entries.forEach(([cat,amt],i)=>{
      const pct = amt/total;
      const len = pct*circ;
      const color = colors[i%colors.length];
      svg.innerHTML += `<circle cx="100" cy="100" r="60" fill="none" stroke="${color}" stroke-width="20" stroke-dasharray="${len} ${circ-len}" stroke-dashoffset="-${offset}" transform="rotate(-90 100 100)"/>`;
      offset+=len;
      legend.innerHTML += `<div class="legend-item"><span class="legend-color" style="background:${color}"></span> ${escapeHtml(cat)}: ${formatCurrency(amt)} (${(pct*100).toFixed(0)}%)</div>`;
    });
  }

  // ---------- Transactions List ----------
  function renderTxnItem(txn) {
    const typeClass = txn.type === 'income' ? 'income' : 'expense';
    const sign = txn.type === 'income' ? '+' : '-';
    return `
      <div class="transaction-item" data-id="${escapeHtml(txn.id)}">
        <div class="transaction-info">
          <div class="transaction-meta">
            <span class="transaction-type ${typeClass}">${escapeHtml(txn.type)}</span>
            <span>${escapeHtml(txn.category)}</span>
            <span>${escapeHtml(txn.date)}</span>
          </div>
          ${txn.note ? `<small style="color:var(--text-secondary);">${escapeHtml(txn.note)}</small>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:1rem;">
          <span class="transaction-amount ${typeClass}">${sign}${formatCurrency(txn.amount)}</span>
          <button class="delete-btn" data-id="${escapeHtml(txn.id)}">Delete</button>
        </div>
      </div>
    `;
  }

  function renderRecent() {
    const list = document.getElementById('recentTransactionList');
    if (!list) return;
    if (!transactions.length) { list.innerHTML = '<p class="empty-state">No transactions recorded.</p>'; return; }
    const recent = [...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
    list.innerHTML = recent.map(renderTxnItem).join('');
  }

  function renderAll(filtered=null) {
    const list = document.getElementById('allTransactionList');
    if (!list) return;
    const data = filtered || transactions;
    if (!data.length) { list.innerHTML = '<p class="empty-state">No transactions.</p>'; return; }
    const sorted = [...data].sort((a,b)=>new Date(b.date)-new Date(a.date));
    list.innerHTML = sorted.map(renderTxnItem).join('');
  }

  function applyFilters() {
    const type = document.getElementById('filterType')?.value || 'all';
    const cat = document.getElementById('filterCategory')?.value || 'all';
    const from = document.getElementById('filterDateFrom')?.value;
    const to = document.getElementById('filterDateTo')?.value;
    let filtered = transactions;
    if (type !== 'all') filtered = filtered.filter(t=>t.type===type);
    if (cat !== 'all') filtered = filtered.filter(t=>t.category===cat);
    if (from) filtered = filtered.filter(t=>t.date>=from);
    if (to) filtered = filtered.filter(t=>t.date<=to);
    renderAll(filtered);
  }

  function populateCatFilter() {
    const sel = document.getElementById('filterCategory');
    if (!sel) return;
    const cats = [...new Set(transactions.map(t=>t.category))].filter(Boolean);
    sel.innerHTML = '<option value="all">All categories</option>' + cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  // ---------- Budgets ----------
  function renderBudgetForm() {
    const f = document.getElementById('budgetFields');
    if (!f) return;
    const cats = ['Food','Transport','Utilities','Entertainment','Others'];
    f.innerHTML = cats.map(c=>`
      <div class="form-group">
        <label>${escapeHtml(c)}</label>
        <input type="number" step="0.01" min="0" class="budget-input" data-category="${escapeHtml(c)}" value="${budgets[c]||''}" placeholder="0.00">
      </div>
    `).join('');
  }

  function renderBudgetProgress() {
    const c = document.getElementById('budgetProgress');
    if (!c) return;
    if (!Object.keys(budgets).length) { c.innerHTML='<p class="empty-state">No budgets set.</p>'; return; }
    const spent = summary.expenses_by_category||{};
    const cats = ['Food','Transport','Utilities','Entertainment','Others'];
    c.innerHTML = cats.map(cat=>{
      const budget = budgets[cat]||0;
      const spentAmt = spent[cat]||0;
      const pct = budget>0 ? Math.min((spentAmt/budget)*100,100) : 0;
      return `<div class="progress-item">
        <div class="progress-label"><span>${escapeHtml(cat)}</span><span>${formatCurrency(spentAmt)} / ${formatCurrency(budget)}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  async function renderAnalytics() {
    const c = document.getElementById('analyticsChart');
    if (!c) return;
    try {
      const monthly = await apiGet('/analytics/monthly');
      if (!monthly.length) { c.innerHTML='<p class="empty-state">No data.</p>'; return; }
      const max = Math.max(...monthly.map(m=>Math.max(m.income,m.expense)),0.01);
      c.innerHTML = monthly.map(m=>`
        <div class="dual-bar-row">
          <span class="dual-bar-label">${escapeHtml(m.month)}</span>
          <div class="dual-bar-group">
            <div class="dual-bar dual-bar-income" style="width:${(m.income/max)*100}%"></div><span class="dual-bar-value">${formatCurrency(m.income)}</span>
            <div class="dual-bar dual-bar-expense" style="width:${(m.expense/max)*100}%"></div><span class="dual-bar-value">${formatCurrency(m.expense)}</span>
          </div>
        </div>
      `).join('');
    } catch(e) { c.innerHTML='<p class="empty-state">Failed to load analytics.</p>'; }
  }

  // ---------- Optimistic Delete ----------
  async function handleDelete(e) {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm('Delete this transaction?')) return;

    const itemEl = btn.closest('.transaction-item');
    if (itemEl) itemEl.remove();
    const oldTransactions = [...transactions];
    transactions = transactions.filter(t => t.id !== id);
    renderRecent();
    applyFilters();

    try {
      await apiDelete(`/transactions/${id}`);
    } catch (error) {
      transactions = oldTransactions;
      try {
        await refreshAll();
      } catch (refreshError) {
        alert('Failed to delete. Please try again.');
        await loadTransactions();
        renderRecent();
        applyFilters();
      }
    }
  }

  // ---------- Validation ----------
  function validateTransaction(txn) {
    if (!txn.type || !['income','expense'].includes(txn.type)) {
      alert('Transaction type must be income or expense.'); return false;
    }
    const amount = parseFloat(txn.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Amount must be a positive number.'); return false;
    }
    if (!txn.category) {
      alert('Please select a category.'); return false;
    }
    if (!txn.date || !/^\d{4}-\d{2}-\d{2}$/.test(txn.date)) {
      alert('Date must be in YYYY-MM-DD format.'); return false;
    }
    const today = new Date().toISOString().slice(0,10);
    if (txn.date > today) {
      if (!confirm('Date is in the future. Are you sure?')) return false;
    }
    return true;
  }

  function validatePasswordChange(oldPass, newPass) {
    if (!oldPass) { alert('Current password is required.'); return false; }
    if (!newPass || newPass.length < 6) {
      alert('New password must be at least 6 characters.'); return false;
    }
    return true;
  }

  // ---------- Event Handlers ----------
  function setupDeleteListeners() {
    document.getElementById('recentTransactionList')?.addEventListener('click', handleDelete);
    document.getElementById('allTransactionList')?.addEventListener('click', handleDelete);
  }

  async function handleAddTransaction(e) {
    e.preventDefault();
    const form = e.target;
    const txn = {
      type: form.type.value,
      amount: form.amount.value.trim(),
      category: form.category.value,
      date: form.date.value,
      note: form.note.value.trim()
    };
    if (!validateTransaction(txn)) return;
    try {
      await apiPost('/transactions', {
        type: txn.type,
        amount: parseFloat(txn.amount),
        category: txn.category,
        date: txn.date,
        note: txn.note
      });
      form.reset();
      document.getElementById('date').valueAsDate = new Date();
      await refreshAll();
    } catch (err) {
      alert('Failed to add transaction: ' + (err.message || 'Server error'));
    }
  }

  async function handleBudgetSave(e) {
    e.preventDefault();
    const inputs = document.querySelectorAll('.budget-input');
    const nb = {};
    inputs.forEach(inp => {
      const val = inp.value.trim();
      if (val) {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0) {
          alert(`Invalid amount for ${inp.dataset.category}.`);
          throw new Error('Validation error');
        }
        nb[inp.dataset.category] = num;
      }
    });
    try {
      await apiPost('/budgets', nb);
      budgets = nb;
      renderBudgetProgress();
      alert('Budgets saved.');
    } catch (err) {
      if (err.message !== 'Validation error') alert('Failed to save budgets.');
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    const oldPass = document.getElementById('oldPassword')?.value || '';
    const newPass = document.getElementById('newPassword')?.value || '';
    if (!validatePasswordChange(oldPass, newPass)) return;
    try {
      await apiPost('/change-password', { old_password: oldPass, new_password: newPass });
      alert('Password updated. Please login again.');
      logout();
    } catch (err) {
      alert('Password change failed.');
    }
  }

  // ---------- Tab Navigation ----------
  function switchTab(id) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${id}`));
    if (id === 'dashboard') {
      renderDashboardChart();
    }
    if (id === 'analytics') renderAnalytics();
    if (id === 'budget') {
      loadBudgets().then(() => {
        renderBudgetForm();
        renderBudgetProgress();
      });
    }
  }

  // ---------- Auth Flow ----------
  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('email')?.value.trim().toLowerCase();
    const password = document.getElementById('password')?.value;
    const isLogin = document.getElementById('auth-title')?.textContent === 'Login';
    const endpoint = isLogin ? '/login' : '/register';
    if (!email || !password) { alert('Email and password are required.'); return; }
    if (!isLogin && password.length < 6) { alert('Password must be at least 6 characters.'); return; }
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Authentication failed');
      }
      const data = await res.json();
      token = data.token;
      localStorage.setItem('auth_token', token);
      showApp(true);
      await initializeApp();
    } catch (err) { alert(err.message); }
  }

  function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-submit-btn');
    const link = document.getElementById('toggle-auth');
    if (!title) return;
    if (title.textContent === 'Login') {
      title.textContent = 'Register'; btn.textContent = 'Register'; link.textContent = 'Login';
    } else {
      title.textContent = 'Login'; btn.textContent = 'Login'; link.textContent = 'Register';
    }
  }

  function logout() {
    localStorage.removeItem('auth_token'); token = null;
    showApp(false);
    transactions = [];
    summary = { total_income: 0, total_expense: 0, balance: 0, expenses_by_category: {} };
    budgets = {};
  }

  // ---------- Refresh All (Dashboard uses current range) ----------
  async function refreshAll() {
    // Load transactions for the recent list and filters (all time)
    await loadTransactions();
    // Load summary respecting the currently selected date range
    await loadSummary(dashboardStartDate || null, dashboardEndDate || null);
    updateDashboardNumbers();
    renderDashboardChart();
    renderRecent();
    populateCatFilter();
    applyFilters();
    if (document.getElementById('tab-budget')?.classList.contains('active')) {
      renderBudgetForm();
      renderBudgetProgress();
    }
  }

  // ---------- App Initialization ----------
  async function initializeApp() {
    document.getElementById('date').valueAsDate = new Date();

    // Tab listeners
    $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    // Form listeners
    document.getElementById('transactionForm')?.addEventListener('submit', handleAddTransaction);
    document.getElementById('budgetForm')?.addEventListener('submit', handleBudgetSave);
    document.getElementById('changePasswordForm')?.addEventListener('submit', handlePasswordChange);
    document.getElementById('applyFilterBtn')?.addEventListener('click', applyFilters);
    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Chart toggle listeners
    document.getElementById('chartToggle')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.chart-toggle-btn');
      if (!btn) return;
      currentDashboardChart = btn.dataset.chart;
      updateToggleButtons();
      renderDashboardChart();
    });

    // Date range Apply button
    document.getElementById('applyDateRangeBtn')?.addEventListener('click', applyDashboardDateRange);

    setupDeleteListeners();
    switchTab('dashboard');
    await refreshAll();
  }

  // ---------- Entry Point ----------
  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('auth-form')?.addEventListener('submit', handleAuthSubmit);
    document.getElementById('toggle-auth')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleAuthMode();
    });

    const authed = await checkAuth();
    showApp(authed);
    if (authed) {
      try {
        await initializeApp();
      } catch (err) {
        alert('Failed to load application. Please refresh.');
        console.error(err);
      }
    }
  });
})();