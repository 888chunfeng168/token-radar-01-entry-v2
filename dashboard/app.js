// Token Radar v2 — the dashboard. Reads window.RADAR (written by main.ts
// from the sealed snapshot), renders the sortable, filterable board and a
// detail view for every protocol with its full valuation breakdown.
// No network: every figure on this page comes from window.RADAR.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('rows').innerHTML =
      '<tr><td colspan="8">No board data loaded. Run main.ts to write data.js.</td></tr>';
    return;
  }
  var rows = R.rows;
  var $ = function (id) { return document.getElementById(id); };
  var fmtUsd = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  };
  var fmtPct = function (v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  };
  var fmtFactor = function (f) {
    return (f >= 1 ? '+' : '') + ((f - 1) * 100).toFixed(0) + '%';
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  $('asof').textContent = R.as_of;
  var top = rows[0];
  var med = rows.slice().sort(function (a, b) { return a.implied_value_usd - b.implied_value_usd; })[Math.floor(rows.length / 2)];
  $('stats').innerHTML =
    '<div class="stat"><b>' + rows.length + '</b><span>pre-token protocols ranked</span></div>' +
    '<div class="stat"><b>' + R.watchlist_size + '</b><span>on the watchlist (TVL ≥ $50M)</span></div>' +
    '<div class="stat"><b>' + R.early_size + '</b><span>early finds below the floor</span></div>' +
    '<div class="stat"><b>' + fmtUsd(top.implied_value_usd) + '</b><span>top implied value — ' + esc(top.name) + '</span></div>' +
    '<div class="stat"><b>' + fmtUsd(med.implied_value_usd) + '</b><span>median implied value</span></div>';

  // Filter controls, populated from the data itself.
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  $('cat').innerHTML += cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  $('chain').innerHTML += chains.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');

  $('bench').innerHTML = R.benchmarks.map(function (b) {
    return '<div><b>' + esc(b.category) + '</b>' + b.ratio.toFixed(3) + '× median mcap/TVL' +
      ' · ' + b.peers + ' peer' + (b.peers === 1 ? '' : 's') +
      (b.fallback ? ' · global fallback' : '') + '</div>';
  }).join('');

  var state = { q: '', cat: '', chain: '', watch: false, sort: 'implied' };
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    list.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'change') return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d);
      if (key === 'rank') return a.rank - b.rank;
      return b.implied_value_usd - a.implied_value_usd;
    });
    return list;
  }

  function render() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols';
    $('rows').innerHTML = list.map(function (r) {
      var chg = r.change_7d === null ? '<span class="down">—</span>'
        : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' +
        (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        '<span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td>' + r.chains.slice(0, 3).map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join('') +
        (r.chains.length > 3 ? '<span class="pill">+' + (r.chains.length - 3) + '</span>' : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + chg + '</td>' +
        '<td class="num"><strong>' + fmtUsd(r.implied_value_usd) + '</strong></td>' +
        '<td class="num">' + r.peer_ratio.toFixed(3) + '×</td></tr>';
    }).join('');
  }

  function detailHTML(r) {
    var a = r.adjustments;
    var benchNote = r.peer_fallback
      ? 'Only ' + r.peer_count + ' token-bearing peer(s) in ' + esc(r.category) + ', so the global median ratio is used.'
      : 'Median mcap/TVL across ' + r.peer_count + ' token-bearing peers in ' + esc(r.category) + '.';
    return '<button class="close" id="closeDetail">Close ✕</button>' +
      '<h2>' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">Rank #' + r.rank + ' · ' + esc(r.category) + ' · ' + r.chains.map(esc).join(', ') +
      ' · TVL ' + fmtUsd(r.tvl_usd) + ' · 7-day ' + fmtPct(r.change_7d) +
      ' · tracked since ' + (r.listed_at || 'unknown') + ' · records no token.</p>' +
      '<h3>Valuation breakdown</h3>' +
      '<table><tbody>' +
      '<tr><td>Peer benchmark — ' + benchNote + '</td><td class="num">' + r.peer_ratio.toFixed(3) + '×</td></tr>' +
      '<tr><td>Base value — TVL ' + fmtUsd(r.tvl_usd) + ' × ' + r.peer_ratio.toFixed(3) + '</td><td class="num">' + fmtUsd(r.base_value_usd) + '</td></tr>' +
      '<tr><td>Growth — 7-day TVL change ' + fmtPct(r.change_7d) + ' (clamped ±50% → ±20%)</td><td class="num">' + fmtFactor(a.growth) + '</td></tr>' +
      '<tr><td>Maturity — listed ' + (r.listed_at || 'unknown') + '</td><td class="num">' + fmtFactor(a.maturity) + '</td></tr>' +
      '<tr><td>Scale — TVL ' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtFactor(a.scale) + '</td></tr>' +
      '<tr><td>Chains — live on ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</td><td class="num">' + fmtFactor(a.chains) + '</td></tr>' +
      '<tr><td>Combined adjustments (product, clamped 0.70–1.35)</td><td class="num">×' + a.total.toFixed(3) + '</td></tr>' +
      (r.capped ? '<tr><td>Cap applied — at most $10B and at most 2× the largest peer market cap in this category</td><td class="num">capped</td></tr>' : '') +
      '<tr><td><strong>Implied value</strong></td><td class="num"><strong>' + fmtUsd(r.implied_value_usd) + '</strong></td></tr>' +
      '</tbody></table>' +
      '<h3>How to farm it — ' + r.farm_steps.length + ' steps</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="meta">This radar estimates what a token would be worth if ' + esc(r.name) +
      ' launched one; it does not predict a launch. Never pay for a pre-sale token.</p>';
  }

  var openSlug = null;
  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    openSlug = slug;
    var d = $('detail');
    d.innerHTML = detailHTML(r);
    d.hidden = false;
    $('closeDetail').addEventListener('click', closeDetail);
    var tr = document.querySelector('tr[data-slug="' + slug + '"]');
    if (tr) tr.classList.add('open');
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeDetail() {
    openSlug = null;
    $('detail').hidden = true;
    $('detail').innerHTML = '';
    var tr = document.querySelector('tr.open');
    if (tr) tr.classList.remove('open');
    if (location.hash.indexOf('#p=') === 0) history.replaceState(null, '', location.pathname);
  }

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    if (openSlug === slug) { closeDetail(); return; }
    closeDetail();
    location.hash = '#p=' + slug;
    openDetail(slug);
  });
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      state.sort = k === 'name' ? 'implied' : k;
      $('sort').value = state.sort;
      render();
    });
  });
  $('q').addEventListener('input', function () { state.q = this.value; render(); });
  $('cat').addEventListener('change', function () { state.cat = this.value; render(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; render(); });
  $('watch').addEventListener('change', function () { state.watch = this.checked; render(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; render(); });
  window.addEventListener('hashchange', function () {
    var m = location.hash.match(/^#p=([\w-]+)/);
    if (m) openDetail(m[1]); else closeDetail();
  });

  render();
  var m0 = location.hash.match(/^#p=([\w-]+)/);
  if (m0) openDetail(m0[1]);
})();
