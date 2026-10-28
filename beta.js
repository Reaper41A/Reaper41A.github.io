// Beta testers: sign in, ask for access, and (once approved) download the preview APK.
// Talks to StockFlow's Supabase project with its public key only. What a person may see is decided
// on the server: beta_status() / beta_request_access() and the beta-download Edge Function.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://fpshdyotujchfdwasqxn.supabase.co';
  var SUPABASE_KEY = 'sb_publishable__hAxNx0fuuoCQOAmRkkR3A_7nmyksie';
  var RETURN_FLAG = 'stockflow.beta.return';

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
    var res = await sb.rpc('whats_new', { p_limit: 12 });
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
    return location.origin + location.pathname;
  }

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

    var res = await sb.rpc('beta_status');
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
    markReturn();
    var res = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl(), queryParams: { prompt: 'select_account' } },
    });
    if (res.error) message($('[data-beta="msg"]'), 'Google sign-in isn’t available right now. Use the email link instead.', true);
  });

  $('[data-beta="email-form"]').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    var button = form.querySelector('button');
    var email = form.elements.namedItem('email').value.trim();
    if (!email) return;
    button.disabled = true;
    markReturn();
    var res = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: returnUrl() } });
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
    var res = await sb.rpc('beta_request_access');
    button.disabled = false;
    if (res.error) {
      message($('[data-beta="status-msg"]'), 'We couldn’t send your request. Please try again.', true);
      return;
    }
    await refresh();
  });

  $('[data-beta="download"]').addEventListener('click', async function () {
    var button = this;
    var label = button.textContent;
    button.disabled = true;
    button.textContent = 'Getting your download…';
    var res = await sb.functions.invoke('beta-download', { body: {} });
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
