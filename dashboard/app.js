// Token Radar v3 — dashboard logic. Static page, no network: every number
// comes from rows.js, every farm plan from farm.js.
//
// A rows.js row is positional:
//   [slug, name, category, chains, tvl, change_7d, listed_at (YYYY-MM),
//    implied_value_usd, readiness, readiness_parts[5], watchlist 0/1,
//    benchmark_ratio, factors[5]]
// readiness_parts are [tenure, momentum, scale, chains, benchmark];
// factors are [growth, momentum, tenure, scale, chains]. The base value is
// TVL x benchmark ratio, recomputed here.
// The bench table maps a category to [peers, median_ratio, median_change].

(function () {
  'use strict';

  var DATA = typeof window !== 'undefined' ? window.ROWS : null;
  var ROWS = DATA ? DATA.rows : [];
  var FLOOR = DATA ? DATA.floor : 50000000;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(x) {
    if (x === null || x === undefined) return '–';
    var s = (x >= 0 ? '+' : '') + x.toFixed(1) + '%';
    return s;
  }
  function pctCls(x) {
    if (x === null || x === undefined) return '';
    return x >= 0 ? 'up' : 'down';
  }
  function chainsShort(chains) {
    if (chains.length <= 2) return chains.join(', ');
    return chains.slice(0, 2).join(', ') + ' +' + (chains.length - 2);
  }
  function ageText(listed) {
    if (!listed) return 'unknown';
    var days = Math.round((Date.parse(DATA.asOf + 'T00:00:00Z') - Date.parse(listed + 'T00:00:00Z')) / 86400000);
    if (days < 365) return Math.max(1, Math.round(days / 30)) + ' mo';
    return (days / 365).toFixed(1) + ' y';
  }

  // Index the rows once, with their board rank (rows.js is in rank order).
  var INDEX = ROWS.map(function (r, i) {
    return {
      slug: r[0], name: r[1], cat: r[2], chains: r[3], tvl: r[4], chg: r[5],
      listed: r[6], value: r[7], ready: r[8], parts: r[9], watch: r[10],
      bench: r[11], base: r[4] * r[11], factors: r[12], rank: i + 1,
    };
  });

  var state = { q: '', cat: '', chain: '', sort: 'value', watch: false, early: false };

  function readHash() {
    var h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get('cat')) state.cat = h.get('cat');
    if (h.get('chain')) state.chain = h.get('chain');
    if (['value', 'tvl', 'chg', 'ready', 'age'].indexOf(h.get('sort')) >= 0) state.sort = h.get('sort');
    if (h.get('watch') === '1') state.watch = true;
    if (h.get('early') === '1') state.early = true;
    return h.get('detail');
  }

  function sortRows(list) {
    var s = state.sort;
    var key = {
      value: function (a, b) { return b.value - a.value; },
      tvl: function (a, b) { return b.tvl - a.tvl; },
      chg: function (a, b) { return (b.chg === null ? -1e9 : b.chg) - (a.chg === null ? -1e9 : a.chg); },
      ready: function (a, b) { return b.ready - a.ready || b.value - a.value; },
      age: function (a, b) {
        var da = a.listed ? Date.parse(a.listed) : Infinity;
        var db = b.listed ? Date.parse(b.listed) : Infinity;
        return da - db;
      },
    }[s] || function (a, b) { return b.value - a.value; };
    return list.slice().sort(key);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return INDEX.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (state.cat && r.cat !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.watch && !r.watch) return false;
      if (state.early && r.tvl >= FLOOR) return false;
      return true;
    });
  }

  function render() {
    var list = sortRows(filtered());
    var tb = $('rows');
    if (!DATA) {
      tb.innerHTML = '<tr><td colspan="8" class="nodata">No data yet — run the program first: node main.ts --input &lt;snapshot.json&gt; --output out, then open out/dashboard/index.html.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td>' + esc(r.name) + (r.watch ? '<span class="badge">WATCHLIST</span>' : '') + '</td>' +
        '<td>' + esc(r.cat || '–') + '</td>' +
        '<td>' + esc(chainsShort(r.chains)) + '</td>' +
        '<td class="num">' + money(r.tvl) + '</td>' +
        '<td class="num ' + pctCls(r.chg) + '">' + pct(r.chg) + '</td>' +
        '<td class="num">' + money(r.value) + '</td>' +
        '<td class="num"><span class="bar"><i style="width:' + r.ready + '%"></i></span>' + r.ready + '</td>' +
        '</tr>';
    }).join('');
    $('count').textContent = list.length + ' of ' + INDEX.length + ' shown';
  }

  function renderMeta() {
    if (!DATA) return;
    var top = INDEX[0];
    var watchN = INDEX.filter(function (r) { return r.watch; }).length;
    var readyN = INDEX.filter(function (r) { return r.ready >= 70; }).length;
    $('meta-line').textContent = 'Snapshot ' + DATA.asOf + ' · ' + INDEX.length +
      ' pre-token protocols · floor $' + (FLOOR / 1e6) + 'M · ' + (DATA.model || '');
    $('stat-rows').textContent = INDEX.length;
    $('stat-watch').textContent = watchN;
    $('stat-top').textContent = top ? money(top.value) : '–';
    $('stat-ready').textContent = readyN;
  }

  function renderEarly() {
    if (!DATA) return;
    var early = INDEX.filter(function (r) { return r.tvl < FLOOR; })
      .slice().sort(function (a, b) { return b.ready - a.ready || b.value - a.value; })
      .slice(0, 5);
    $('top-early').innerHTML = early.map(function (r) {
      return '<li><b>#' + r.rank + ' ' + esc(r.name) + '</b> — readiness ' + r.ready +
        ', ' + money(r.value) + ' implied, ' + money(r.tvl) + ' TVL</li>';
    }).join('');
  }

  function renderBench() {
    if (!DATA) return;
    var cats = Object.keys(DATA.bench).sort(function (a, b) {
      return DATA.bench[b][1] - DATA.bench[a][1];
    });
    $('bench-body').innerHTML = cats.map(function (c) {
      var b = DATA.bench[c];
      return '<tr><td>' + esc(c) + '</td><td class="num">' + b[0] + '</td>' +
        '<td class="num">' + b[1].toFixed(3) + '</td><td class="num ' + pctCls(b[2]) + '">' + pct(b[2]) + '</td></tr>';
    }).join('');
  }

  function fillSelects() {
    var cats = [], chains = [];
    INDEX.forEach(function (r) {
      if (cats.indexOf(r.cat) < 0) cats.push(r.cat);
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort().forEach(function (c) {
      $('cat').appendChild(new Option(c, c));
    });
    chains.sort().forEach(function (c) {
      $('chain').appendChild(new Option(c, c));
    });
    $('cat').value = state.cat;
    $('chain').value = state.chain;
    $('sort').value = state.sort;
    $('watch').checked = state.watch;
    $('early').checked = state.early;
  }

  var PART_NAMES = ['Tenure', 'Momentum', 'Scale', 'Chain breadth', 'Benchmark'];
  var FACTOR_NAMES = ['Growth', 'Momentum vs category', 'Tenure', 'Scale', 'Chains'];

  function openDetail(slug) {
    var r = null;
    INDEX.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var steps = window.Farm ? window.Farm.stepsFor({ name: r.name, category: r.cat, chains: r.chains }) : [];
    var bench = DATA.bench[r.cat || 'Uncategorised'] || [0, 0, null];
    var html = '<h2>' + esc(r.name) + (r.watch ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">#' + r.rank + ' · ' + esc(r.cat || '–') + ' · ' + esc(r.chains.join(', ')) +
      ' · listed ' + (r.listed || 'unknown') + ' (' + ageText(r.listed) + ' with no token)</p>' +
      '<h3>Valuation</h3><dl class="kv">' +
      '<dt>TVL</dt><dd>' + money(r.tvl) + '</dd>' +
      '<dt>Peer benchmark (' + bench[0] + ' peers' + (bench[0] < 3 ? ', global median' : '') + ')</dt><dd>' + r.bench.toFixed(3) + ' × TVL</dd>' +
      '<dt>Base value</dt><dd>' + money(r.base) + '</dd>';
    r.factors.forEach(function (f, i) {
      html += '<dt>' + FACTOR_NAMES[i] + '</dt><dd>× ' + f.toFixed(2) + '</dd>';
    });
    html += '<dt>Implied value</dt><dd><b>' + money(r.value) + '</b></dd></dl>' +
      '<h3>Readiness ' + r.ready + ' / 100</h3>' +
      r.parts.map(function (v, i) {
        return '<div>' + PART_NAMES[i] + ' <span class="bar"><i style="width:' + v + '%"></i></span>' + v + '</div>';
      }).join('') +
      '<h3>Farm plan — ' + steps.length + ' steps</h3><ol>' +
      steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol>' +
      '<p class="fine">Implied value is this radar\u2019s own estimate from the snapshot, never a promise. ' +
      'The protocol records no token — that is not proof it has none.</p>';
    $('detail-body').innerHTML = html;
    $('detail').hidden = false;
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.classList.toggle('sel', tr.getAttribute('data-slug') === slug);
    });
  }

  function closeDetail() {
    $('detail').hidden = true;
    document.querySelectorAll('#rows tr').forEach(function (tr) { tr.classList.remove('sel'); });
  }

  function bind() {
    $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    $('cat').addEventListener('change', function (e) { state.cat = e.target.value; render(); });
    $('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    $('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    $('watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
    $('early').addEventListener('change', function (e) { state.early = e.target.checked; render(); });
    $('rows').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-slug]');
      if (tr) openDetail(tr.getAttribute('data-slug'));
    });
    document.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        state.sort = th.getAttribute('data-sort');
        $('sort').value = state.sort;
        render();
      });
    });
    $('detail-close').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDetail();
    });
  }

  var detailSlug = readHash();
  fillSelects();
  renderMeta();
  renderEarly();
  renderBench();
  render();
  bind();
  if (detailSlug) openDetail(detailSlug);
})();
