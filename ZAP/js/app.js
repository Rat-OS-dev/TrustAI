/**
 * Trust AI × Zap — shared auth, balance-gated plans, working settings
 *
 * Billing rules:
 * - Charged the exact second you subscribed, every month (anniversary).
 * - Upgrade → charged immediately, new plan starts now.
 * - Downgrade / cancel → keep current plan until period end, then switch.
 * - Must have enough balance to start or renew a paid plan.
 */

const STORAGE_KEY = 'trustai_zap_user';

const PLANS = {
  free: { id: 'free', label: 'Free', price: 0 },
  pro: { id: 'pro', label: 'Pro', price: 19 },
  team: { id: 'team', label: 'Team', price: 49 },
};

const PLAN_RANK = { free: 0, pro: 1, team: 2 };

function getUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function defaultSettings() {
  return { emailNotif: true, agentAlerts: true, darkMode: true };
}

function ensureUserShape(user) {
  if (!user) return null;
  if (typeof user.balance !== 'number' || !Number.isFinite(user.balance)) user.balance = 0;
  if (!user.plan) user.plan = 'free';
  if (!user.settings) user.settings = defaultSettings();
  if (!user.billing) {
    user.billing = {
      periodStart: user.createdAt || new Date().toISOString(),
      nextBillAt: null,
      pending: null,
    };
  }
  return user;
}

function planLabel(plan) {
  return PLANS[plan]?.label || 'Free';
}

function planPrice(plan) {
  return PLANS[plan]?.price ?? 0;
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || '\u2014';
  return addr.slice(0, 6) + '\u2026' + addr.slice(-4);
}

function toast(msg, ms) {
  ms = ms || 3200;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, ms);
}

function formatMoney(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
}

function formatWhen(iso) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function computeNextBillAt(periodStartIso) {
  const start = new Date(periodStartIso);
  if (Number.isNaN(start.getTime())) return null;
  const next = new Date(start.getTime());
  const month = next.getMonth();
  next.setMonth(month + 1);
  if (next.getMonth() !== (month + 1) % 12) {
    next.setDate(0);
  }
  return next.toISOString();
}

function isUpgrade(from, to) {
  return (PLAN_RANK[to] || 0) > (PLAN_RANK[from] || 0);
}

function isDowngradeOrCancel(from, to) {
  return (PLAN_RANK[to] || 0) < (PLAN_RANK[from] || 0);
}

function processBilling(user, now) {
  now = now || new Date();
  user = ensureUserShape(user);
  const messages = [];
  const nowMs = now.getTime();

  if (user.billing.pending) {
    const effective = new Date(user.billing.pending.effectiveAt).getTime();
    if (effective <= nowMs) {
      const from = user.plan;
      const to = user.billing.pending.plan;
      user.plan = to;
      user.billing.pending = null;
      user.billing.periodStart = new Date(effective).toISOString();
      if (planPrice(to) > 0) {
        user.billing.nextBillAt = computeNextBillAt(user.billing.periodStart);
      } else {
        user.billing.nextBillAt = null;
      }
      messages.push('Plan changed from ' + planLabel(from) + ' to ' + planLabel(to) + ' (scheduled).');
    }
  }

  if (planPrice(user.plan) > 0 && user.billing.nextBillAt) {
    var guard = 0;
    while (user.billing.nextBillAt && new Date(user.billing.nextBillAt).getTime() <= nowMs && guard < 24) {
      guard += 1;
      var price = planPrice(user.plan);
      if (user.balance >= price) {
        user.balance = Math.round((user.balance - price) * 100) / 100;
        user.billing.periodStart = user.billing.nextBillAt;
        user.billing.nextBillAt = computeNextBillAt(user.billing.periodStart);
        messages.push('Renewed ' + planLabel(user.plan) + ' (\u2212' + formatMoney(price) + ').');
      } else {
        var failed = user.plan;
        user.plan = 'free';
        user.billing.nextBillAt = null;
        user.billing.pending = null;
        user.billing.periodStart = new Date(nowMs).toISOString();
        messages.push('Renewal failed for ' + planLabel(failed) + ' (need ' + formatMoney(price) + '). Switched to Free.');
        break;
      }
    }
  }

  saveUser(user);
  return { user: user, messages: messages };
}

function changePlan(user, targetPlan, now) {
  now = now || new Date();
  user = ensureUserShape(user);
  var current = user.plan || 'free';
  targetPlan = PLANS[targetPlan] ? targetPlan : 'free';

  if (targetPlan === current && !user.billing.pending) {
    return { ok: false, message: 'Already on ' + planLabel(current) + '.', user: user };
  }

  if (targetPlan === current && user.billing.pending) {
    user.billing.pending = null;
    saveUser(user);
    return { ok: true, message: 'Pending plan change cancelled. You stay on ' + planLabel(current) + '.', user: user };
  }

  var price = planPrice(targetPlan);
  var nowIso = now.toISOString();

  if (isUpgrade(current, targetPlan) || (current === 'free' && targetPlan !== 'free')) {
    if (price > 0 && user.balance < price) {
      return {
        ok: false,
        message: 'Need ' + formatMoney(price) + ' in balance to switch to ' + planLabel(targetPlan) + '. Current balance: ' + formatMoney(user.balance) + '.',
        user: user,
      };
    }
    if (price > 0) {
      user.balance = Math.round((user.balance - price) * 100) / 100;
    }
    user.plan = targetPlan;
    user.billing.periodStart = nowIso;
    user.billing.nextBillAt = price > 0 ? computeNextBillAt(nowIso) : null;
    user.billing.pending = null;
    saveUser(user);
    return {
      ok: true,
      message: price > 0
        ? 'Upgraded to ' + planLabel(targetPlan) + '. Charged ' + formatMoney(price) + '. Next bill: ' + formatWhen(user.billing.nextBillAt) + '.'
        : 'Switched to ' + planLabel(targetPlan) + '.',
      user: user,
    };
  }

  if (isDowngradeOrCancel(current, targetPlan)) {
    var effectiveAt = user.billing.nextBillAt || computeNextBillAt(user.billing.periodStart || nowIso) || nowIso;

    if (planPrice(current) === 0) {
      user.plan = targetPlan;
      user.billing.pending = null;
      user.billing.nextBillAt = null;
      user.billing.periodStart = nowIso;
      saveUser(user);
      return { ok: true, message: 'Switched to ' + planLabel(targetPlan) + '.', user: user };
    }

    user.billing.pending = { plan: targetPlan, effectiveAt: effectiveAt };
    saveUser(user);
    return {
      ok: true,
      message: 'Scheduled ' + planLabel(targetPlan) + ' starting ' + formatWhen(effectiveAt) + '. You keep ' + planLabel(current) + ' until then.',
      user: user,
    };
  }

  user.plan = targetPlan;
  saveUser(user);
  return { ok: true, message: 'Plan set to ' + planLabel(targetPlan) + '.', user: user };
}

async function connectWallet() {
  if (!window.ethereum) {
    toast('No wallet detected. Using a demo address.');
    var demo = '0x' + Array.from({ length: 40 }, function () {
      return Math.floor(Math.random() * 16).toString(16);
    }).join('');
    return demo;
  }
  try {
    var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts[0]) throw new Error('No account returned');
    return accounts[0];
  } catch (err) {
    console.error(err);
    toast(err.message || 'Wallet connection rejected');
    return null;
  }
}

function initAuthPage() {
  var existing = getUser();
  if (existing) {
    existing = ensureUserShape(existing);
    var processed = processBilling(existing);
    existing = processed.user;
    if (existing.loggedIn) {
      window.location.href = 'dashboard.html';
      return;
    }
  }

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('.plan-card[data-plan]').forEach(function (card) {
    card.addEventListener('click', function () {
      document.querySelectorAll('.plan-card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      var radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  var connectedAddress = null;
  var walletStatus = document.getElementById('wallet-status');
  var walletAddressEl = document.getElementById('wallet-address');

  async function doConnect(fromLogin) {
    var addr = await connectWallet();
    if (!addr) return;
    connectedAddress = addr;
    if (walletStatus) {
      walletStatus.classList.remove('hidden');
      walletAddressEl.textContent = shortAddr(addr);
    }
    toast('Wallet connected');

    if (fromLogin) {
      var user = getUser();
      var now = new Date().toISOString();
      if (!user || (user.wallet && user.wallet.toLowerCase() !== addr.toLowerCase())) {
        user = ensureUserShape({
          loggedIn: true,
          name: 'Wallet User',
          email: '',
          wallet: addr,
          plan: 'free',
          balance: (user && user.balance) || 0,
          createdAt: now,
          settings: defaultSettings(),
          billing: { periodStart: now, nextBillAt: null, pending: null },
        });
      } else {
        user.loggedIn = true;
        user.wallet = addr;
        user = ensureUserShape(user);
      }
      saveUser(user);
      window.location.href = 'dashboard.html';
    }
  }

  var btnConnect = document.getElementById('btn-connect-wallet');
  var btnLoginWallet = document.getElementById('btn-login-wallet');
  if (btnConnect) btnConnect.addEventListener('click', function () { doConnect(false); });
  if (btnLoginWallet) btnLoginWallet.addEventListener('click', function () { doConnect(true); });
  var btnDisconnect = document.getElementById('btn-disconnect');
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', function () {
      connectedAddress = null;
      if (walletStatus) walletStatus.classList.add('hidden');
      toast('Wallet disconnected');
    });
  }

  var btnSignup = document.getElementById('btn-signup');
  if (btnSignup) {
    btnSignup.addEventListener('click', function () {
      var emailEl = document.getElementById('signup-email');
      var passEl = document.getElementById('signup-password');
      var nameEl = document.getElementById('signup-name');
      var email = (emailEl && emailEl.value.trim()) || '';
      var password = (passEl && passEl.value) || '';
      var name = (nameEl && nameEl.value.trim()) || 'User';
      var planRadio = document.querySelector('input[name="plan"]:checked');
      var plan = planRadio ? planRadio.value : 'free';
      if (!PLANS[plan]) plan = 'free';

      if (!connectedAddress && !email) {
        toast('Connect a wallet or enter an email');
        return;
      }
      if (email && password.length < 8) {
        toast('Password must be at least 8 characters');\n        return;
      }

      var now = new Date();
      var nowIso = now.toISOString();
      var user = ensureUserShape({
        loggedIn: true,
        name: name || (email ? email.split('@')[0] : 'Wallet User'),
        email: email,
        wallet: connectedAddress || null,
        plan: 'free',
        balance: 0,
        hasPassword: !!password,
        createdAt: nowIso,
        settings: defaultSettings(),
        billing: { periodStart: nowIso, nextBillAt: null, pending: null },
      });

      if (plan !== 'free') {
        var price = planPrice(plan);
        if (user.balance < price) {
          saveUser(user);
          toast('Account created on Free. Add ' + formatMoney(price) + ' balance to unlock ' + planLabel(plan) + '.');
          setTimeout(function () { window.location.href = 'dashboard.html'; }, 900);
          return;
        }
        var result = changePlan(user, plan, now);
        user = result.user;
        toast(result.message);
      } else {
        saveUser(user);
        toast('Account created on Free plan');
      }

      setTimeout(function () { window.location.href = 'dashboard.html'; }, 600);
    });
  }

  var formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('login-email').value.trim();
      var user = getUser();
      var nowIso = new Date().toISOString();

      if (!user || (user.email && user.email !== email)) {
        user = ensureUserShape({
          loggedIn: true,
          name: email.split('@')[0] || 'User',
          email: email,
          wallet: (user && user.wallet) || null,
          plan: (user && user.plan) || 'free',
          balance: (user && user.balance) || 0,
          hasPassword: true,
          createdAt: (user && user.createdAt) || nowIso,
          settings: (user && user.settings) || defaultSettings(),
          billing: (user && user.billing) || { periodStart: nowIso, nextBillAt: null, pending: null },
        });
      } else {
        user.loggedIn = true;
        user.email = email;
        user = ensureUserShape(user);
      }
      saveUser(user);
      processBilling(user);
      toast('Logged in');
      window.location.href = 'dashboard.html';
    });
  }

  var btnHeaderLogin = document.getElementById('btn-header-login');
  if (btnHeaderLogin) {
    btnHeaderLogin.addEventListener('click', function () {
      var t = document.querySelector('.tab[data-tab="login"]');
      if (t) t.click();
      var card = document.getElementById('auth-card');
      if (card) card.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

function initDashboard() {
  var user = getUser();
  if (!user || !user.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  user = ensureUserShape(user);
  var processed = processBilling(user);
  user = processed.user;
  processed.messages.forEach(function (m) { toast(m); });

  function refreshUI() {
    user = ensureUserShape(getUser());
    if (!user) return;

    var name = user.name || 'User';
    var email = user.email || (user.wallet ? shortAddr(user.wallet) : 'No email');
    var plan = planLabel(user.plan || 'free');
    var wallet = user.wallet ? shortAddr(user.wallet) : 'Not connected';
    var balance = formatMoney(user.balance);

    function set(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    }

    set('account-name', name);
    set('account-email', email);
    set('account-plan', plan + ' plan');
    set('account-avatar', (name[0] || 'U').toUpperCase());
    set('welcome-name', name);
    set('stat-plan', plan);
    set('stat-wallet', wallet);
    set('stat-balance', balance);
    set('wallet-chip', wallet);
    set('banner-plan', plan);
    set('acc-wallet', user.wallet || 'Not connected');
    set('billing-balance', balance);
    set('billing-next', user.billing && user.billing.nextBillAt ? formatWhen(user.billing.nextBillAt) : '\u2014');
    set('billing-period-start', user.billing && user.billing.periodStart ? formatWhen(user.billing.periodStart) : '\u2014');

    var pendingEl = document.getElementById('billing-pending');
    if (pendingEl) {
      if (user.billing && user.billing.pending) {
        pendingEl.textContent = planLabel(user.billing.pending.plan) + ' starts ' + formatWhen(user.billing.pending.effectiveAt);
        pendingEl.classList.remove('muted');
      } else {
        pendingEl.textContent = 'None';
        pendingEl.classList.add('muted');
      }
    }

    var nameInput = document.getElementById('acc-name');
    var emailInput = document.getElementById('acc-email');
    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';

    var s = user.settings || defaultSettings();
    var emailNotif = document.getElementById('set-email-notif');
    var agentAlerts = document.getElementById('set-agent-alerts');
    var darkMode = document.getElementById('set-dark');
    if (emailNotif) emailNotif.checked = !!s.emailNotif;
    if (agentAlerts) agentAlerts.checked = !!s.agentAlerts;
    if (darkMode) darkMode.checked = !!s.darkMode;
    document.body.classList.toggle('light-mode', !s.darkMode);

    document.querySelectorAll('.plan-grid.billing .plan-card').forEach(function (card) {
      var id = card.dataset.plan;
      card.classList.toggle('selected', id === (user.plan || 'free'));
      var btn = card.querySelector('.plan-select-btn');
      if (!btn) return;
      if (id === user.plan && !(user.billing && user.billing.pending)) {
        btn.textContent = 'Current plan';
        btn.disabled = true;
      } else if (user.billing && user.billing.pending && user.billing.pending.plan === id) {
        btn.textContent = 'Scheduled';
        btn.disabled = false;
      } else if (isUpgrade(user.plan, id) || (user.plan === 'free' && id !== 'free')) {
        btn.textContent = id === 'free' ? 'Select Free' : 'Upgrade to ' + planLabel(id);
        btn.disabled = false;
      } else {
        btn.textContent = id === 'free' ? 'Cancel to Free' : 'Switch to ' + planLabel(id);
        btn.disabled = false;
      }
    });
  }

  refreshUI();

  function showView(viewId) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    var view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    var nav = document.querySelector('.nav-item[data-view="' + viewId + '"]');
    if (nav) nav.classList.add('active');
    var titles = {
      home: 'Home', chat: 'Trust AI Chat', zap: 'Zap Automations', agents: 'Agents',
      account: 'Account', billing: 'Subscription & Billing', settings: 'Settings',
    };
    var titleEl = document.getElementById('dash-title');
    if (titleEl) titleEl.textContent = titles[viewId] || 'Dashboard';
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }

  document.querySelectorAll('.nav-item[data-view]').forEach(function (item) {
    item.addEventListener('click', function (e) {
      e.preventDefault();
      showView(item.dataset.view);
    });
  });
  document.querySelectorAll('.qa-btn[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () { showView(btn.dataset.view); });
  });
  var btnUpgradeHeader = document.getElementById('btn-upgrade-header');
  if (btnUpgradeHeader) btnUpgradeHeader.addEventListener('click', function () { showView('billing'); });
  var menuToggle = document.getElementById('menu-toggle');
  if (menuToggle) menuToggle.addEventListener('click', function () {
    document.getElementById('sidebar').classList.add('open');
  });
  var sidebarClose = document.getElementById('sidebar-close');
  if (sidebarClose) sidebarClose.addEventListener('click', function () {
    document.getElementById('sidebar').classList.remove('open');
  });

  var btnSaveAccount = document.getElementById('btn-save-account');
  if (btnSaveAccount) {
    btnSaveAccount.addEventListener('click', function () {
      var nameEl = document.getElementById('acc-name');
      var emailEl = document.getElementById('acc-email');
      var name = nameEl && nameEl.value.trim();
      var email = emailEl && emailEl.value.trim();
      user = ensureUserShape(getUser());
      if (name) user.name = name;
      if (email !== undefined) user.email = email;
      saveUser(user);
      refreshUI();
      toast('Account updated (Trust AI & Zap)');
    });
  }

  var btnReconnect = document.getElementById('btn-reconnect');
  if (btnReconnect) {
    btnReconnect.addEventListener('click', async function () {
      var addr = await connectWallet();
      if (!addr) return;
      user = ensureUserShape(getUser());
      user.wallet = addr;
      saveUser(user);
      refreshUI();
      toast('Wallet reconnected');
    });
  }

  var btnAddFunds = document.getElementById('btn-add-funds');
  if (btnAddFunds) {
    btnAddFunds.addEventListener('click', function () {
      var input = document.getElementById('add-funds-amount');
      var amount = parseFloat((input && input.value) || '0');
      if (!Number.isFinite(amount) || amount <= 0) {
        toast('Enter a positive amount');
        return;
      }
      amount = Math.round(amount * 100) / 100;
      user = ensureUserShape(getUser());
      user.balance = Math.round((user.balance + amount) * 100) / 100;
      saveUser(user);
      if (input) input.value = '';
      refreshUI();
      toast('Added ' + formatMoney(amount) + '. Balance: ' + formatMoney(user.balance));
    });
  }

  document.querySelectorAll('.plan-select-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var plan = btn.dataset.plan;
      user = ensureUserShape(getUser());
      var result = changePlan(user, plan);
      toast(result.message);
      refreshUI();
    });
  });

  var btnCancelPending = document.getElementById('btn-cancel-pending');
  if (btnCancelPending) {
    btnCancelPending.addEventListener('click', function () {
      user = ensureUserShape(getUser());
      if (!user.billing || !user.billing.pending) {
        toast('No pending plan change');
        return;
      }
      user.billing.pending = null;
      saveUser(user);
      refreshUI();
      toast('Pending plan change cancelled');
    });
  }

  function bindSetting(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () {
      user = ensureUserShape(getUser());
      user.settings = user.settings || defaultSettings();
      user.settings[key] = !!el.checked;
      saveUser(user);
      if (key === 'darkMode') {
        document.body.classList.toggle('light-mode', !user.settings.darkMode);
      }
      toast('Setting saved');
    });
  }
  bindSetting('set-email-notif', 'emailNotif');
  bindSetting('set-agent-alerts', 'agentAlerts');
  bindSetting('set-dark', 'darkMode');

  var btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      user = getUser();
      if (user) {
        user.loggedIn = false;
        saveUser(user);
      }
      window.location.href = 'index.html';
    });
  }

  setInterval(function () {
    user = ensureUserShape(getUser());
    if (!user || !user.loggedIn) return;
    var result = processBilling(user);
    if (result.messages.length) {
      result.messages.forEach(function (m) { toast(m); });
      refreshUI();
    }
  }, 30000);
}

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('auth-card')) {
    initAuthPage();
  } else if (document.querySelector('.dashboard-body')) {
    initDashboard();
  }
});
