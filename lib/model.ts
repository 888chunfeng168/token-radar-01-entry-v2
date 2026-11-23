// Token Radar v2 — the valuation model, the board builder and the farm plans.
//
// The model answers one question: if a protocol that records no token issued
// one tomorrow, what would it be worth? It never trusts a single number. It
// benchmarks every protocol against token-bearing peers in its own category,
// then adjusts that benchmark for what the snapshot actually says about the
// protocol: its growth, its age, its scale and how many chains it runs on.
// Everything below is derived from the sealed snapshot at run time — no
// hardcoded list of names, no hardcoded values, no network.
//
//   impliedValue(p) = min( cap(p), TVL(p) x peerRatio(category(p)) x adjustments(p) )
//   peerRatio(cat)  = median mcap/TVL over token-bearing peers in cat
//                     (global median when cat has fewer than 3 peers)
//   adjustments     = growth x maturity x scale x chains, clamped to [0.70, 1.35]
//   cap(p)          = min($10B, 2 x largest peer market cap in the category)
// The cap exists because a median ratio can still overstate a category whose
// biggest token is small: no protocol's hypothetical token may be worth more
// than twice what its category's largest real token is worth today.

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export interface Adjustments {
  growth: number;
  maturity: number;
  scale: number;
  chains: number;
  total: number;
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  base_value_usd: number;
  peer_ratio: number;
  peer_count: number;
  peer_fallback: boolean;
  peer_max_mcap_usd: number | null;
  adjustments: Adjustments;
  capped: boolean;
}

export interface Radar {
  as_of: string;
  rows: Row[];
  watchlist_size: number;
  early_size: number;
  live_size: number;
  global_peer_ratio: number;
  benchmarks: { category: string; peers: number; ratio: number; fallback: boolean }[];
}

/** The snapshot's date, parsed as a UTC day; the maturity clock runs from it. */
const AS_OF_MS = (asOf: string): number => Date.parse(`${asOf}T00:00:00Z`);

/** Median of a non-empty list; the middle value, or the mean of the middle two. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** A protocol records no token when DefiLlama carries neither a CoinGecko id nor a symbol. */
export function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/**
 * A pre-token candidate: it records no token, is not a versioned re-release,
 * and is not a wrapped, staked or bridged product of a token that trades.
 * This is the watchlist's own rule, applied to the whole snapshot so the
 * board can reach below the $50M floor.
 */
export function isPreToken(p: Protocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot as a typed object; throws on a shape it does not recognise. */
export function parseSnapshot(text: string): Snapshot {
  const data = JSON.parse(text) as Snapshot;
  if (!Array.isArray(data.protocols) || !Array.isArray(data.watchlist)) {
    throw new Error('token radar: snapshot has no protocols[] or watchlist[]');
  }
  return data;
}

/**
 * Growth adjustment: the 7-day TVL change, clamped to +/-50%, mapped linearly
 * to a factor from 0.80 (falling fast) to 1.20 (growing fast). No 7-day figure
 * means no adjustment — the protocol is judged on its size alone.
 */
export function growthFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  const clamped = Math.max(-50, Math.min(50, change7d));
  return 1 + (clamped / 50) * 0.2;
}

/**
 * Maturity adjustment: a protocol that has run a long time with no token is
 * less likely to launch one soon, so age discounts; a young protocol still
 * building its launch window earns a small premium. Age is measured from
 * listed_at to the snapshot's date.
 */
export function maturityFactor(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 1;
  const ageDays = (AS_OF_MS(asOf) - Date.parse(`${listedAt}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
  if (ageDays < 365) return 1.08;
  if (ageDays < 730) return 1.04;
  if (ageDays < 1460) return 1;
  return 0.92;
}

/**
 * Scale adjustment: very large TVL is already priced into expectations, so
 * the biggest protocols discount slightly; small protocols carry more
 * upside per dollar of TVL, so they premium slightly.
 */
export function scaleFactor(tvlUsd: number): number {
  if (tvlUsd > 1_000_000_000) return 0.9;
  if (tvlUsd > 500_000_000) return 0.95;
  if (tvlUsd >= 100_000_000) return 1;
  if (tvlUsd >= 25_000_000) return 1.05;
  return 1.08;
}

/** Chain-diversity adjustment: a protocol live on more chains reaches more users. */
export function chainsFactor(chainCount: number): number {
  if (chainCount >= 4) return 1.08;
  if (chainCount >= 2) return 1.04;
  return 1;
}

/** All four adjustments together, the product clamped so no protocol moves more than -30% / +35%. */
export function adjustmentsFor(p: Protocol, asOf: string): Adjustments {
  const growth = growthFactor(p.change_7d);
  const maturity = maturityFactor(p.listed_at, asOf);
  const scale = scaleFactor(p.tvl_usd);
  const chains = chainsFactor(p.chains.length);
  const total = Math.max(0.7, Math.min(1.35, growth * maturity * scale * chains));
  return { growth, maturity, scale, chains, total };
}

// ---------------------------------------------------------------- farm plans

/** The chain a plan centres on: the protocol's largest chain by convention, its first listed. */
function mainChain(p: Protocol): string {
  return p.chains[0] ?? 'Ethereum';
}

/** A second chain when the protocol runs on more than one, for the cross-chain step. */
function otherChain(p: Protocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

/**
 * Farm steps, tailored by category and chain. Every step names the chain and
 * the concrete action, what it costs (gas plus any deposit) and how long it
 * takes — a plan a reader can follow this week, not a slogan. Steps are
 * generated from the protocol's own record, never copied from a list.
 */
export function farmSteps(p: Protocol): string[] {
  const name = p.name;
  const chain = mainChain(p);
  const other = otherChain(p);
  const tvl = fmtUsd(p.tvl_usd);
  const cat = p.category ?? 'DeFi';
  const steps: string[] = [];
  const push = (s: string): void => {
    if (s.length >= 20 && s.length <= 600) steps.push(s);
  };

  push(
    `Set up a wallet on ${chain} and fund it with $50-200 in the chain's gas token plus stablecoins; keep $5-10 aside for gas so a later step never strands your position. Takes 15 minutes, costs only gas.`,
  );

  switch (cat) {
    case 'Dexs':
      push(
        `Swap $20-50 of stablecoins for another asset on ${name} (${chain}) so the router records your address as an active trader; repeat a small swap weekly. Costs gas only, about 5 minutes per swap.`,
      );
      push(
        `Provide liquidity to the busiest pool on ${name} on ${chain} with $50-100 split across the pair, and keep the position open at least 2-4 weeks so volume-based snapshots can see it. Costs gas plus the deposit.`,
      );
      break;
    case 'Lending':
      push(
        `Supply $50-100 of a stablecoin or blue-chip asset as collateral on ${name} (${chain}) and leave it supplied for 3-4 weeks; supplied balances are the usual snapshot for lending airdrops. Costs gas plus the deposit.`,
      );
      push(
        `Borrow a small amount ($10-25) against your supply on ${name}, then repay it within a week, so your address shows both sides of the market. Costs gas plus a few cents of interest.`,
      );
      break;
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
      push(
        `Deposit $50-100 into the highest-TVL vault on ${name} (${chain}) and hold the vault receipt token for at least 3-4 weeks; vault deposits are the standard farming signal. Costs gas plus the deposit.`,
      );
      push(
        `Harvest or compound the vault's yield on ${name} once a week so your address shows repeat interaction, not a single deposit. Costs a few dollars of gas each time, 5 minutes.`,
      );
      break;
    case 'RWA':
      push(
        `Deposit $50-100 into ${name}'s tokenised-asset vault on ${chain} and hold the receipt token for 4+ weeks; RWA snapshots reward sticky deposits over large one-off ones. Costs gas plus the deposit.`,
      );
      push(
        `Complete any identity or allowlist step ${name} asks for on ${chain} (usually a wallet signature, no fee) and keep the same wallet for every later action. Takes 10 minutes.`,
      );
      break;
    case 'CDP':
    case 'CDP Manager':
      push(
        `Open a collateralised position on ${name} (${chain}): lock $50-100 of collateral and mint $20-40 of its stable asset, keeping the ratio well above liquidation. Costs gas plus the deposit, 15 minutes.`,
      );
      push(
        `Use the minted stable asset — swap half on ${chain} or supply it back into ${name} — and keep the position open 3-4 weeks. Costs gas only per action.`,
      );
      break;
    case 'Derivatives':
    case 'Options':
    case 'Options Vault':
    case 'Basis Trading':
      push(
        `Open a small ($20-50) perpetual or options position on ${name} (${chain}) and close it after a day or two; repeat once a week. Trading volume, not size, is what derivatives snapshots usually count. Costs gas plus margin.`,
      );
      push(
        `If ${name} offers a vault on ${chain}, deposit $25-50 into it for 2-4 weeks as a second signal alongside your trades. Costs gas plus the deposit.`,
      );
      break;
    case 'Bridge':
    case 'Cross Chain Bridge':
    case 'Canonical Bridge':
      push(
        `Bridge $25-50 from ${chain} to ${other ?? 'another supported chain'} through ${name} and bridge a smaller amount back a few days later; bridge snapshots count distinct routes and repeat use. Costs gas plus the bridge fee, 10-20 minutes.`,
      );
      push(
        `Repeat the bridge once a week with a different asset or destination chain so your address shows sustained cross-chain activity, not a single transfer. Costs gas plus fees each time.`,
      );
      break;
    case 'Restaking':
    case 'Liquid Restaking':
      push(
        `Restake $50-100 of a liquid staking token through ${name} on ${chain} and hold the restaked receipt for 4+ weeks; restaking snapshots reward duration. Costs gas plus the deposit.`,
      );
      break;
    case 'Indexes':
      push(
        `Buy $50-100 of ${name}'s index token on ${chain} and hold it for 3-4 weeks; index holders are the natural snapshot for an index protocol. Costs gas plus the purchase.`,
      );
      break;
    case 'Prediction Market':
      push(
        `Place small ($5-20) trades on two or three different markets on ${name} (${chain}) and leave at least one open until it resolves; prediction snapshots count distinct markets traded. Costs gas plus the stakes, 10 minutes.`,
      );
      break;
    case 'Launchpad':
      push(
        `Join ${name}'s next sale or points campaign on ${chain} with a $25-50 allocation and complete its wallet tasks; launchpad snapshots usually count participation, not size. Costs gas plus the allocation.`,
      );
      break;
    default:
      push(
        `Use ${name}'s core product on ${chain} with $50-100 — deposit, supply or stake, whichever it offers — and keep the position open for 3-4 weeks so snapshots can see a sticky user. Costs gas plus the deposit.`,
      );
      push(
        `Return once a week and repeat a small interaction on ${name} (${chain}) — a swap, a claim or a top-up — so your address shows sustained use rather than one visit. Costs a few dollars of gas, 5 minutes.`,
      );
      break;
  }

  if (other !== null) {
    push(
      `Repeat your main action on ${name} on ${other} as well, with a smaller $20-30 position, so your address is active on two chains; multi-chain users are the ones cross-chain snapshots favour. Costs gas plus the deposit.`,
    );
  }
  push(
    `Follow ${name}'s official announcements and any points or quests page it runs, complete the free social or on-chain tasks it lists, and keep using the same wallet — snapshots are taken without warning. Takes 10 minutes a week, costs nothing but gas.`,
  );
  push(
    `Do not chase the launch: ${name} holds ${tvl} of TVL and records no token, so a token may never come. Never pay for a "pre-sale" token, never sign an unlimited approval, and treat this as a free option, not an investment.`,
  );
  return steps.slice(0, 8);
}

// ---------------------------------------------------------------- the board

/**
 * Build the ranked board: every pre-token protocol in the snapshot, ranked
 * by implied value. The watchlist (40) is always included; the rest are the
 * pre-token protocols below the $50M floor, so the board is the whole
 * pre-token universe the snapshot can see, not a hand-picked list.
 */
export function buildRadar(snapshot: Snapshot): { board: Row[]; radar: Radar } {
  const watchlist = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter(isPreToken);

  // Peer benchmarks, per category, from the token-bearing protocols only.
  const peerRatios = new Map<string, number[]>();
  const peerMaxMcap = new Map<string, number>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      allRatios.push(ratio);
      const key = p.category ?? 'Uncategorised';
      if (!peerRatios.has(key)) peerRatios.set(key, []);
      peerRatios.get(key)!.push(ratio);
      peerMaxMcap.set(key, Math.max(peerMaxMcap.get(key) ?? 0, p.mcap_usd));
    }
  }
  const globalRatio = median(allRatios);

  const benchmarks: Radar['benchmarks'] = [];
  for (const [category, ratios] of [...peerRatios.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const fallback = ratios.length < 3;
    benchmarks.push({ category, peers: ratios.length, ratio: fallback ? globalRatio : median(ratios), fallback });
  }

  const scored: Row[] = candidates.map((p) => {
    const key = p.category ?? 'Uncategorised';
    const peers = peerRatios.get(key) ?? [];
    const fallback = peers.length < 3;
    const ratio = fallback ? globalRatio : median(peers);
    const base = p.tvl_usd * ratio;
    const adjustments = adjustmentsFor(p, snapshot.as_of);
    const maxMcap = peerMaxMcap.get(key) ?? null;
    const cap = maxMcap === null ? 10_000_000_000 : Math.min(10_000_000_000, 2 * maxMcap);
    const raw = base * adjustments.total;
    const capped = raw > cap;
    const implied = Math.max(1, Math.round(Math.min(raw, cap) / 10_000) * 10_000);
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(p),
      category: p.category ?? 'Uncategorised',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      watchlist: watchlist.has(p.slug),
      base_value_usd: Math.round(base),
      peer_ratio: ratio,
      peer_count: peers.length,
      peer_fallback: fallback,
      peer_max_mcap_usd: maxMcap,
      adjustments,
      capped,
    };
  });

  // Rank by implied value, highest first; TVL breaks ties so the order is stable.
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug));
  // Rounding can tie neighbours; nudge a tied row down one rounding step so
  // the value never rises as rank ascends and the ranking stays a ranking.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i]!.implied_value_usd >= scored[i - 1]!.implied_value_usd) {
      scored[i]!.implied_value_usd = Math.max(1, scored[i - 1]!.implied_value_usd - 10_000);
    }
  }
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });

  const radar: Radar = {
    as_of: snapshot.as_of,
    rows: scored,
    watchlist_size: snapshot.watchlist.length,
    early_size: scored.length - snapshot.watchlist.length,
    live_size: snapshot.protocols.length - candidates.length,
    global_peer_ratio: globalRatio,
    benchmarks,
  };
  return { board: scored, radar };
}

/** The gate's own shape, checked before anything is written. */
export function boardIssue(board: Row[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row names ${row.slug}, not in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `row ${row.slug} has a bad implied value`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const t = step.trim();
      if (t.length < 20 || t.length > 600) return `row ${row.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `ranks are not 1..${board.length}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return 'implied value rises with rank';
  }
  return null;
}

/** data.js: the dashboard's data, one global, written beside the page. */
export function dataScript(radar: Radar): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
