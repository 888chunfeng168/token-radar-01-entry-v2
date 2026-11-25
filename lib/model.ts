// Token Radar v3 — the value model.
//
// The board answers one question: which pre-token protocol is worth farming
// next, and what is its token worth if it launched tomorrow. Everything is
// derived from the snapshot at run time: no list of names and no value is
// hardcoded, so the same program ranks a future snapshot's protocols.
//
// The model, in four steps:
//   1. Peer benchmark — the category's own market. For each category, the
//      median market-cap / TVL ratio of its token-bearing peers (three or
//      more peers, else the global median). The median is robust: one peer
//      in this snapshot trades at 400x its TVL and would wreck a mean.
//   2. Bounded adjustments — growth, momentum against the category,
//      token-less tenure, scale and chain breadth. Each is small, each is
//      shown in the detail view, and their product is clamped to 0.70–1.40,
//      so the peer benchmark does the work, never the adjustments.
//   3. A cap — no value above $10B, or twice the largest peer market cap
//      in its category, whichever is smaller.
//   4. A readiness score (0–100) — how farmable this protocol looks right
//      now: tenure, momentum, scale, chain breadth and benchmark strength.
//      It is a second dimension, not a second value: the board still sorts
//      by implied value.
//
// Farm plans come from dashboard/farm.js, the one source of truth the
// dashboard also uses, so the board and the page can never disagree.

import '../dashboard/farm.js';

const Farm = (globalThis as any).Farm as {
  stepsFor: (p: { name: string; category: string | null; chains: string[] }) => string[];
};

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  readiness: number;
  readiness_parts: { tenure: number; momentum: number; scale: number; chains: number; benchmark: number };
  benchmark_ratio: number;
  benchmark_peers: number;
  base_value_usd: number;
  adjustment: number;
  category_median_change: number | null;
  factors: { growth: number; momentum: number; tenure: number; scale: number; chains: number };
}

export interface CategoryBench {
  peers: number;
  median_ratio: number;
  median_change: number | null;
  max_peer_mcap: number | null;
}

// The watchlist's own exclusion rule, applied with only the snapshot's ten
// fields (parentProtocol is not one of them): a wrapped, staked or bridged
// product of a token that already trades, a versioned re-release, or an
// exchange's own product is not a protocol still waiting on a launch.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = new Set(['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini']);
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.has(p.name.split(' ')[0] as string)) return false;
  return true;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function ageYears(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const ms = Date.parse(asOf + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z');
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / (365.25 * 24 * 3600 * 1000);
}

function tenureFactor(age: number | null): number {
  if (age === null) return 1.0;
  if (age < 0.5) return 1.02;
  if (age < 1.5) return 1.08;
  if (age < 3) return 1.1;
  if (age < 5) return 1.04;
  return 0.94;
}

function tenureScore(age: number | null): number {
  if (age === null) return 50;
  if (age < 0.5) return 40;
  if (age < 1.5) return 75;
  if (age < 3) return 100;
  if (age < 5) return 65;
  return 35;
}

function momentumScore(change: number | null): number {
  if (change === null) return 50;
  if (change <= -20) return 20;
  if (change < 0) return 40;
  if (change < 10) return 60;
  if (change < 25) return 85;
  return 100;
}

function scaleFactor(tvl: number): number {
  if (tvl > 1_000_000_000) return 0.9;
  if (tvl > 500_000_000) return 0.95;
  if (tvl > 100_000_000) return 1.0;
  if (tvl > 25_000_000) return 1.05;
  return 1.08;
}

function scaleScore(tvl: number): number {
  if (tvl > 1_000_000_000) return 100;
  if (tvl > 500_000_000) return 90;
  if (tvl > 100_000_000) return 75;
  if (tvl > 25_000_000) return 55;
  return 40;
}

function chainsFactor(n: number): number {
  if (n >= 4) return 1.08;
  if (n >= 2) return 1.04;
  return 1.0;
}

function chainsScore(n: number): number {
  if (n >= 4) return 100;
  if (n >= 2) return 70;
  return 40;
}

function benchmarkScore(ratio: number): number {
  if (ratio >= 0.3) return 100;
  if (ratio >= 0.15) return 75;
  if (ratio >= 0.08) return 50;
  return 30;
}

export function peerBenchmarks(protocols: SnapshotProtocol[]): {
  byCategory: Map<string, CategoryBench>;
  globalMedian: number;
} {
  const byCategory = new Map<string, CategoryBench>();
  const allRatios: number[] = [];
  const cats = new Map<string, SnapshotProtocol[]>();
  for (const p of protocols) {
    const key = p.category ?? 'Uncategorised';
    const arr = cats.get(key);
    if (arr) arr.push(p);
    else cats.set(key, [p]);
  }
  for (const p of protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      allRatios.push(p.mcap_usd / p.tvl_usd);
    }
  }
  const globalMedian = median(allRatios);
  for (const [cat, members] of cats) {
    const peerRatios: number[] = [];
    let maxPeerMcap: number | null = null;
    const changes: number[] = [];
    for (const p of members) {
      if (p.change_7d !== null) changes.push(p.change_7d);
      if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
        peerRatios.push(p.mcap_usd / p.tvl_usd);
        maxPeerMcap = maxPeerMcap === null ? p.mcap_usd : Math.max(maxPeerMcap, p.mcap_usd);
      }
    }
    byCategory.set(cat, {
      peers: peerRatios.length,
      median_ratio: peerRatios.length >= 3 ? Math.min(median(peerRatios), 2.0) : globalMedian,
      median_change: changes.length > 0 ? median(changes) : null,
      max_peer_mcap: maxPeerMcap,
    });
  }
  return { byCategory, globalMedian };
}

export function buildBoard(snapshot: Snapshot): {
  rows: BoardRow[];
  meta: {
    model: string;
    snapshot_as_of: string;
    floor_usd: number;
    watchlist_size: number;
    pre_token_count: number;
    global_median_ratio: number;
    benchmarks: Record<string, CategoryBench>;
    methodology: string;
  };
} {
  const { byCategory, globalMedian } = peerBenchmarks(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const pre = snapshot.protocols.filter(isPreToken);

  const scored: BoardRow[] = pre.map((p) => {
    const bench = byCategory.get(p.category ?? 'Uncategorised')!;
    const base = p.tvl_usd * bench.median_ratio;
    const change = p.change_7d ?? 0;
    const growth = 1 + clamp(change, -50, 50) / 250;
    const rel = bench.median_change === null ? 0 : change - bench.median_change;
    const momentum = rel > 10 ? 1.05 : rel < -10 ? 0.95 : 1.0;
    const age = ageYears(snapshot.as_of, p.listed_at);
    const tenure = tenureFactor(age);
    const scale = scaleFactor(p.tvl_usd);
    const chains = chainsFactor(p.chains.length);
    const adjustment = clamp(growth * momentum * tenure * scale * chains, 0.7, 1.4);
    // The cap only binds where the category has a real market to compare
    // against: twice the largest peer market cap, when the category has
    // three or more token-bearing peers. A category with fewer peers falls
    // back to the global median for its benchmark already; capping it at
    // twice one peer's market cap would let a single small token dictate
    // the value of the category's giants. Otherwise the cap is $10B.
    const cap =
      bench.peers >= 3 && bench.max_peer_mcap !== null
        ? Math.min(10_000_000_000, 2 * bench.max_peer_mcap)
        : 10_000_000_000;
    let value = Math.round(Math.min(base * adjustment, cap) / 10_000) * 10_000;
    if (value < 10_000) value = 10_000;

    const parts = {
      tenure: tenureScore(age),
      momentum: momentumScore(p.change_7d),
      scale: scaleScore(p.tvl_usd),
      chains: chainsScore(p.chains.length),
      benchmark: benchmarkScore(bench.median_ratio),
    };
    const readiness = Math.round(
      parts.tenure * 0.3 + parts.momentum * 0.25 + parts.scale * 0.2 + parts.chains * 0.15 + parts.benchmark * 0.1,
    );

    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: value,
      farm_steps: Farm.stepsFor(p),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      watchlist: watchlist.has(p.slug),
      readiness,
      readiness_parts: parts,
      benchmark_ratio: bench.median_ratio,
      benchmark_peers: bench.peers,
      base_value_usd: Math.round(base),
      adjustment: Math.round(adjustment * 1000) / 1000,
      category_median_change: bench.median_change,
      factors: {
        growth: Math.round(growth * 1000) / 1000,
        momentum: Math.round(momentum * 1000) / 1000,
        tenure: Math.round(tenure * 1000) / 1000,
        scale: Math.round(scale * 1000) / 1000,
        chains: Math.round(chains * 1000) / 1000,
      },
    };
  });

  // Rank by implied value. Ties break by readiness, then TVL, then slug,
  // so the order is stable and a tie still says something.
  scored.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.readiness - a.readiness ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : 1),
  );
  // Values never rise as rank ascends.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.implied_value_usd > scored[i - 1]!.implied_value_usd) {
      scored[i]!.implied_value_usd = scored[i - 1]!.implied_value_usd;
    }
  }
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });

  const benchmarks: Record<string, CategoryBench> = {};
  for (const [cat, b] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    benchmarks[cat] = {
      peers: b.peers,
      median_ratio: Math.round(b.median_ratio * 10000) / 10000,
      median_change: b.median_change === null ? null : Math.round(b.median_change * 100) / 100,
      max_peer_mcap: b.max_peer_mcap,
    };
  }

  return {
    rows: scored,
    meta: {
      model: 'token-radar v3: category peer-median benchmark, bounded adjustments, readiness score',
      snapshot_as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      watchlist_size: snapshot.watchlist.length,
      pre_token_count: pre.length,
      global_median_ratio: Math.round(globalMedian * 10000) / 10000,
      benchmarks,
      methodology:
        'Implied value = TVL x the median market-cap/TVL ratio of token-bearing peers in the same category ' +
        '(global median when a category has fewer than 3 peers), times bounded adjustments for 7-day growth, ' +
        'growth against the category median, token-less tenure, TVL scale and chain breadth (product clamped ' +
        '0.70-1.40), capped at $10B, or at twice the largest peer market cap where the category has 3 or more ' +
        'peers. Readiness (0-100) scores tenure 30%, momentum 25%, scale 20%, chain breadth 15% and benchmark ' +
        'strength 10%.',
    },
  };
}
