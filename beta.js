// Beta testers: sign in, ask for access, and (once approved) download the preview APK.
// Talks to the shared StockFlow/Shopflow Supabase project with its public key only. What a person may see is decided
// on the server: beta_status() / beta_request_access() and the beta-download Edge Function.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://fpshdyotujchfdwasqxn.supabase.co';
  var SUPABASE_KEY = 'sb_publishable__hAxNx0fuuoCQOAmRkkR3A_7nmyksie';
  // The same script runs the StockFlow beta (index.html), the Shopflow beta (shopflow/) and the
  // Dropflow beta (dropflow/). <section id="beta" data-app="shopflow|dropflow"> switches it to that
  // app's testers, builds and notes.
  var section = document.getElementById('beta');
  var asked = section && section.getAttribute('data-app');
  var APP = asked === 'shopflow' || asked === 'dropflow' ? asked : 'stockflow';
  var NAMES = { stockflow: 'StockFlow', shopflow: 'Shopflow', dropflow: 'Dropflow' };
  // Shopflow and Dropflow accounts are their own: a sign-in is claimed for that app.
  var OWN_ACCOUNT = APP !== 'stockflow';
  var RPC = APP === 'stockflow'
    ? { status: 'beta_status', request: 'beta_request_access', news: 'whats_new' }
    : { status: APP + '_beta_status', request: APP + '_beta_request_access', news: APP + '_whats_new' };
  var RETURN_FLAG = APP + '.beta.return';
  var OTHER_APP_TEXT = 'This email is used for another app. ' + NAMES[APP] + ' needs its own account: sign out and use a different email.';

  var card = document.querySelector('#beta .beta-card');
  if (!card) return;
  var $ = function (sel) { return card.querySelector(sel); };
  var states = card.querySelectorAll('.beta-state');

  function show(name) {
    states.forEach(function (el) { el.hidden = el.getAttribute('data-state') !== name; });
  }

  function message(el, text, isError) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('err', !!isError);
  }

  function friendlySize(bytes) {
    if (!bytes) return '';
    return ' · ' + (bytes / 1048576).toFixed(0) + ' MB';
  }

  function friendlyDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  if (!window.supabase || !window.supabase.createClient) {
    show('signed-out');
    message($('[data-beta="status-msg"]'), 'Sign-in could not load. Check your connection and refresh the page.', true);
    return;
  }

  // PKCE: the sign-in comes back as ?code=… on this page, which supabase-js exchanges for a session.
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
  });

  // What's new: release notes the team writes in the StockFlow Console. Anyone can read them (whats_new()).
  var NEWS_GROUPS = [['new', 'New', 'var(--green)'], ['improved', 'Improved', 'var(--drop)'], ['fixed', 'Fixed', 'var(--shop)']];
  var NEWS_SHOWN = 3;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function newsItem(r, open) {
    var notes = r.notes || {};
    var details = el('details');
    details.open = open;
    var summary = el('summary');
    var head = el('span');
    var title = el('strong', '', r.title || 'Test version update');
    if (r.kind === 'build') title.appendChild(el('span', 'news-tag', 'New install'));
    head.appendChild(title);
    head.appendChild(el('small', '', friendlyDate(r.created_at) + (r.app_version ? ' · version ' + r.app_version : '')));
    summary.appendChild(head);
    details.appendChild(summary);
    var any = false;
    NEWS_GROUPS.forEach(function (g) {
      var items = Array.isArray(notes[g[0]]) ? notes[g[0]] : [];
      if (!items.length) return;
      any = true;
      var group = el('div', 'news-group');
      var label = el('b', '', g[1]);
      label.style.setProperty('--c', g[2]);
      group.appendChild(label);
      var list = el('ul');
      items.forEach(function (s) { list.appendChild(el('li', '', s)); });
      group.appendChild(list);
      details.appendChild(group);
    });
    if (!any) details.appendChild(el('p', '', 'Small fixes and improvements.'));
    return details;
  }

  async function loadNews() {
    var box = document.getElementById('whats-new');
    if (!box) return;
    var res = await sb.rpc(RPC.news, { p_limit: 12 });
    var items = (!res.error && Array.isArray(res.data)) ? res.data : [];
    if (!items.length) return;
    var list = box.querySelector('[data-news="list"]');
    var more = box.querySelector('[data-news="more"]');
    list.textContent = '';
    items.forEach(function (r, i) {
      var item = newsItem(r, i === 0);
      item.hidden = i >= NEWS_SHOWN;
      list.appendChild(item);
    });
    more.hidden = items.length <= NEWS_SHOWN;
    more.onclick = function () {
      list.querySelectorAll('details[hidden]').forEach(function (d) { d.hidden = false; });
      more.hidden = true;
    };
    box.hidden = false;
  }

  loadNews().catch(function () { /* no news is fine: the panel stays hidden */ });

  function returnUrl() {
    // Use the hostname that is actually serving this page. This works on GitHub Pages,
    // the Vercel production domain, Vercel preview deployments, and a custom domain.
    var url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.origin + url.pathname;
  }

  function authErrorText(error) {
    var detail = error && (error.message || error.error_description || error.code);
    return detail ? String(detail).replace(/\s+/g, ' ').slice(0, 260) : 'The authentication request could not be completed.';
  }

  function showAuthRedirectError() {
    var search = new URLSearchParams(window.location.search);
    var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var detail = search.get('error_description') || hash.get('error_description')
      || search.get('error_code') || hash.get('error_code')
      || search.get('error') || hash.get('error');
    if (!detail) return;

    detail = String(detail).replace(/\s+/g, ' ').slice(0, 260);
    var hint = /redirect|not allowed|allow.?list/i.test(detail)
      ? ' Add this Vercel domain to Supabase Authentication → URL Configuration → Redirect URLs.'
      : '';
    message($('[data-beta="msg"]'), 'Sign-in did not complete: ' + detail + '.' + hint, true);
  }

  showAuthRedirectError();

  async function refresh() {
    var statusMsg = $('[data-beta="status-msg"]');
    message(statusMsg, '');
    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data && sessionResult.data.session;
    var who = $('[data-beta="who"]');
    if (!session) {
      who.hidden = true;
      show('signed-out');
      return;
    }
    who.hidden = false;
    $('[data-beta="who-email"]').textContent = 'Signed in as ' + (session.user.email || 'you');

    // Shopflow and Dropflow accounts are separate from the others: claim this sign-in for this app,
    // or say plainly that this email already belongs to another one.
    if (OWN_ACCOUNT) {
      var claim = await sb.rpc('claim_app_account', { p_app: APP });
      if (!claim.error && claim.data === 'other_app') {
        show('none');
        $('[data-beta="request-form"]').hidden = true;
        message(statusMsg, OTHER_APP_TEXT, true);
        return;
      }
      $('[data-beta="request-form"]').hidden = false;
    }

    var res = await sb.rpc(RPC.status);
    if (res.error) {
      show('none');
      message(statusMsg, 'We couldn’t check your access right now. Please refresh in a moment.', true);
      return;
    }
    var status = (res.data && res.data.status) || 'none';
    if (status === 'approved') {
      var build = res.data.latest_build;
      $('[data-beta="build-line"]').textContent = build
        ? 'Android · version ' + (build.app_version || 'preview') + ', ' + friendlyDate(build.created_at) + friendlySize(build.apk_size)
        : 'The first test build is on its way. Check back soon.';
      $('[data-beta="download"]').disabled = !build;
    }
    show(status === 'approved' || status === 'pending' || status === 'revoked' ? status : 'none');
  }

  // Coming back from Google or an email link: bring the beta section into view.
  try {
    if (sessionStorage.getItem(RETURN_FLAG)) {
      sessionStorage.removeItem(RETURN_FLAG);
      setTimeout(function () { document.getElementById('beta').scrollIntoView({ behavior: 'smooth' }); }, 300);
    }
  } catch (e) { /* storage blocked: nothing to scroll back to */ }

  function markReturn() {
    try { sessionStorage.setItem(RETURN_FLAG, '1'); } catch (e) { /* storage blocked */ }
  }

  $('[data-beta="google"]').addEventListener('click', async function () {
    var button = this;
    var label = button.textContent;
    button.disabled = true;
    button.textContent = 'Opening Google…';
    message($('[data-beta="msg"]'), '');
    markReturn();

    try {
      var res = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: returnUrl(), queryParams: { prompt: 'select_account' } },
      });
      if (res.error) throw res.error;
    } catch (error) {
      button.disabled = false;
      button.textContent = label;
      var detail = authErrorText(error);
      var hint = /redirect|not allowed|allow.?list/i.test(detail)
        ? ' Add this Vercel domain to Supabase Authentication → URL Configuration → Redirect URLs.'
        : '';
      message($('[data-beta="msg"]'), 'Google sign-in could not start: ' + detail + '.' + hint, true);
    }
  });

  $('[data-beta="email-form"]').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    var button = form.querySelector('button');
    var email = form.elements.namedItem('email').value.trim();
    if (!email) return;
    button.disabled = true;
    markReturn();
    var otpOptions = { emailRedirectTo: returnUrl() };
    // A new account made here belongs to this app from the start.
    if (OWN_ACCOUNT) otpOptions.data = { signup_app: APP };
    var res = await sb.auth.signInWithOtp({ email: email, options: otpOptions });
    button.disabled = false;
    message(
      $('[data-beta="msg"]'),
      res.error
        ? 'We couldn’t send the link. Check the address and try again in a minute.'
        : 'Check your email for a sign-in link. Open it in this same browser.',
      !!res.error,
    );
  });

  $('[data-beta="request-form"]').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    var button = form.querySelector('button');
    button.disabled = true;
    var res = await sb.rpc(RPC.request);
    button.disabled = false;
    if (res.error) {
      var usedElsewhere = OWN_ACCOUNT && /stockflow|another app/i.test(res.error.message || '');
      message($('[data-beta="status-msg"]'), usedElsewhere ? OTHER_APP_TEXT : 'We couldn’t send your request. Please try again.', true);
      return;
    }
    await refresh();
  });

  $('[data-beta="download"]').addEventListener('click', async function () {
    var button = this;
    var label = button.textContent;
    button.disabled = true;
    button.textContent = 'Getting your download…';
    var res = await sb.functions.invoke('beta-download', { body: { app: APP } });
    button.disabled = false;
    button.textContent = label;
    var data = res.data;
    if (res.error || !data || !data.url) {
      var detail = '';
      try { detail = (await res.error.context.json()).error || ''; } catch (err) { /* no body */ }
      message($('[data-beta="status-msg"]'), detail || 'The download isn’t available right now. Please try again.', true);
      return;
    }
    message($('[data-beta="status-msg"]'), data.expires_in ? 'Your download has started. The link works for 10 minutes.' : 'Your download has started.');
    window.location.href = data.url;
  });

  $('[data-beta="signout"]').addEventListener('click', async function () {
    await sb.auth.signOut();
    await refresh();
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void refresh();
  });

  refresh().catch(function () {
    show('signed-out');
    message($('[data-beta="status-msg"]'), 'Something went wrong. Please refresh the page.', true);
  });
})();
