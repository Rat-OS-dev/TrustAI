/**
 * Trust AI × Zap — shared auth + wallet connect demo
 * One account works for both products.
 */

const STORAGE_KEY = 'trustai_zap_user';

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

function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || '\u2014';
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function toast(msg, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function planLabel(plan) {
  const map = { free: 'Free', pro: 'Pro', team: 'Team' };
  return map[plan] || 'Free';
}

async function connectWallet() {
  if (!window.ethereum) {
    toast('No wallet detected. Install Trust Wallet or MetaMask.');
    const demo = '0x' + Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return demo;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts[0]) throw new Error('No account returned');
    return accounts[0];
  } catch (err) {
    console.error(err);
    toast(err.message || 'Wallet connection rejected');
    return null;
  }
}

function initAuthPage() {
  const existing = getUser();
  if (existing && existing.loggedIn) {
    window.location.href = 'dashboard.html';
    return;
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });

  document.querySelectorAll('.plan-card[data-plan]').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.plan-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  let connectedAddress = null;

  const btnConnect = document.getElementById('btn-connect-wallet');
  const btnLoginWallet = document.getElementById('btn-login-wallet');
  const walletStatus = document.getElementById('wallet-status');
  const walletAddressEl = document.getElementById('wallet-address');
  const btnDisconnect = document.getElementById('btn-disconnect');

  async function doConnect(fromLogin = false) {
    const addr = await connectWallet();
    if (!addr) return;

    connectedAddress = addr;
    if (walletStatus) {
      walletStatus.classList.remove('hidden');
      walletAddressEl.textContent = shortAddr(addr);
    }
    toast('Wallet connected');

    if (fromLogin) {
      let user = getUser();
      if (!user || user.wallet?.toLowerCase() !== addr.toLowerCase()) {
        user = {
          loggedIn: true,
          name: 'Wallet User',
          email: '',
          wallet: addr,
          plan: 'free',
          createdAt: new Date().toISOString(),
        };
      } else {
        user.loggedIn = true;
        user.wallet = addr;
      }
      saveUser(user);
      window.location.href = 'dashboard.html';
    }
  }

  if (btnConnect) btnConnect.addEventListener('click', () => doConnect(false));
  if (btnLoginWallet) btnLoginWallet.addEventListener('click', () => doConnect(true));

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      connectedAddress = null;
      walletStatus?.classList.add('hidden');
      toast('Wallet disconnected');
    });
  }

  const btnSignup = document.getElementById('btn-signup');
  if (btnSignup) {
    btnSignup.addEventListener('click', () => {
      const email = document.getElementById('signup-email')?.value?.trim() || '';
      const password = document.getElementById('signup-password')?.value || '';
      const name = document.getElementById('signup-name')?.value?.trim() || 'User';
      const planRadio = document.querySelector('input[name="plan"]:checked');
      const plan = planRadio ? planRadio.value : 'free';

      if (!connectedAddress && !email) {
        toast('Connect a wallet or enter an email');
        return;
      }
      if (email && password.length < 8) {
        toast('Password must be at least 8 characters');
        return;
      }

      const user = {
        loggedIn: true,
        name: name || (email ? email.split('@')[0] : 'Wallet User'),
        email: email,
        wallet: connectedAddress || null,
        plan,
        hasPassword: !!password,
        createdAt: new Date().toISOString(),
      };
      saveUser(user);
      toast(`Account created on ${planLabel(plan)} plan`);
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 600);
    });
  }

  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      let user = getUser();

      if (!user || (user.email && user.email !== email)) {
        user = {
          loggedIn: true,
          name: email.split('@')[0] || 'User',
          email,
          wallet: user?.wallet || null,
          plan: user?.plan || 'free',
          hasPassword: true,
          createdAt: user?.createdAt || new Date().toISOString(),
        };
      } else {
        user.loggedIn = true;
        user.email = email;
      }
      saveUser(user);
      toast('Logged in');
      window.location.href = 'dashboard.html';
    });
  }

  document.getElementById('btn-header-login')?.addEventListener('click', () => {
    document.querySelector('.tab[data-tab="login"]')?.click();
    document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth' });
  });
}

function initDashboard() {
  let user = getUser();
  if (!user || !user.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  function refreshUI() {
    user = getUser();
    if (!user) return;

    const name = user.name || 'User';
    const email = user.email || (user.wallet ? shortAddr(user.wallet) : 'No email');
    const plan = planLabel(user.plan || 'free');
    const wallet = user.wallet ? shortAddr(user.wallet) : 'Not connected';

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('account-name', name);
    set('account-email', email);
    set('account-plan', `${plan} plan`);
    set('account-avatar', (name[0] || 'U').toUpperCase());
    set('welcome-name', name);
    set('stat-plan', plan);
    set('stat-wallet', wallet);
    set('wallet-chip', wallet);
    set('banner-plan', plan);
    set('acc-wallet', user.wallet || 'Not connected');

    const nameInput = document.getElementById('acc-name');
    const emailInput = document.getElementById('acc-email');
    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';

    document.querySelectorAll('.plan-grid.billing .plan-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.plan === (user.plan || 'free'));
    });
  }

  refreshUI();

  function showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('active');
    const nav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (nav) nav.classList.add('active');
    const titles = {
      home: 'Home',
      chat: 'Trust AI Chat',
      zap: 'Zap Automations',
      agents: 'Agents',
      account: 'Account',
      billing: 'Subscription & Billing',
      settings: 'Settings',
    };
    const titleEl = document.getElementById('dash-title');
    if (titleEl) titleEl.textContent = titles[viewId] || 'Dashboard';
    document.getElementById('sidebar')?.classList.remove('open');
  }

  document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      showView(item.dataset.view);
    });
  });

  document.querySelectorAll('.qa-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.getElementById('btn-upgrade-header')?.addEventListener('click', () => {
    showView('billing');
  });

  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
  });
  document.getElementById('sidebar-close')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
  });

  document.getElementById('btn-save-account')?.addEventListener('click', () => {
    const name = document.getElementById('acc-name')?.value?.trim();
    const email = document.getElementById('acc-email')?.value?.trim();
    user = getUser();
    if (name) user.name = name;
    if (email !== undefined) user.email = email;
    saveUser(user);
    refreshUI();
    toast('Account updated (applies to Trust AI & Zap)');
  });

  document.getElementById('btn-reconnect')?.addEventListener('click', async () => {
    const addr = await connectWallet();
    if (!addr) return;
    user = getUser();
    user.wallet = addr;
    saveUser(user);
    refreshUI();
    toast('Wallet reconnected');
  });

  document.querySelectorAll('.plan-select-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      user = getUser();
      user.plan = plan;
      saveUser(user);
      refreshUI();
      toast(`Switched to ${planLabel(plan)} plan`);
    });
  });

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    user = getUser();
    if (user) {
      user.loggedIn = false;
      saveUser(user);
    }
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('auth-card')) {
    initAuthPage();
  } else if (document.querySelector('.dashboard-body')) {
    initDashboard();
  }
});
