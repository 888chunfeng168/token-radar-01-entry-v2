# Token Radar v2 — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/888chunfeng168/token-radar-01-entry-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/888chunfeng168/token-radar-01-entry-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for the [make.fun bounty "Build the best token launch radar"](https://make.fun/bounty/token-radar-01)
($1,325 in rewards, closes 2026-12-14 10:00 UTC).

The radar reads a sealed DefiLlama snapshot (758 protocols, TVL ≥ $5M, frozen
2026-11-14), finds every protocol that records no token, and ranks it by what
its token would be worth if it launched tomorrow — then hands you a dashboard
with the board, a detail view for every protocol, and a concrete farm plan for each.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
```

Node 22+, standard library only, no network. `main.ts` writes `out/board.json`
(the ranked board), `out/data.js` (the dashboard's data), `out/dashboard/`,
`out/screenshots/` and `out/dossier.json`. Two runs on the same snapshot write
the same bytes. Open `out/dashboard/index.html` in a browser.

## What it ranks

- **198 rows**: all 40 protocols on the snapshot's watchlist (TVL ≥ $50M, no
  token recorded) plus the 158 pre-token protocols below the floor (TVL ≥ $5M).
  The watchlist is the floor, never the ceiling.
- Every row carries an implied value in whole dollars and 3–8 farm steps.
- The dashboard sorts by implied value / TVL / 7-day change, filters by
  category and chain, searches by name, and opens a detail view per protocol
  with the full valuation breakdown.

## METHODOLOGY

The implied value is this radar's own estimate, derived entirely from the
snapshot at run time. No list of names and no value is hardcoded.

### 1. Peer benchmark — the category's own market

For each protocol, look at the token-bearing protocols in the **same category**
from the snapshot. Compute each peer's market-cap / TVL ratio and take the
**median** peer ratio as the category benchmark. The median is robust to
outliers: one category in this snapshot has a peer whose token trades at 400×
its TVL, which would wreck a mean. A category with fewer than 3 token-bearing
peers falls back to the **global median ratio** across all token-bearing
protocols (0.205 in this snapshot). The benchmark table is shown on the
dashboard itself.

```
base value = TVL × category median mcap/TVL ratio
```

### 2. Bounded adjustments — what the snapshot says about this protocol

Four multiplicative adjustments, each small and each shown in the detail view:

| Factor | Rule | Range |
| --- | --- | --- |
| Growth | 7-day TVL change, clamped to ±50%, mapped linearly | 0.80 – 1.20 |
| Maturity | Listed < 1y ago +8%; 1–2y +4%; 2–4y 0; > 4y with no token −8%; unknown 0 | 0.92 – 1.08 |
| Scale | TVL > $1B −10%; $500M–$1B −5%; $100M–$500M 0; $25M–$100M +5%; < $25M +8% | 0.90 – 1.08 |
| Chains | 1 chain 0; 2–3 chains +4%; 4+ chains +8% | 1.00 – 1.08 |

The four multiply together and the product is clamped to **0.70 – 1.35**, so no
protocol's value is ever mostly adjustment: the peer benchmark does the work.

### 3. A cap

No implied value exceeds **$10B**, or **twice the largest peer market cap in
its category**, whichever is smaller. Values are rounded to the nearest
$10,000, and neighbours are nudged so the value never rises as rank ascends.

### 4. Farm plans

Each protocol gets 3–8 steps generated from its own category and chains:
Dexs get swap / liquidity steps, Lending gets supply / borrow, Yield and RWA
get vault deposits, CDP gets collateralised positions, Derivatives get small
trades, Bridges get cross-chain routes, and so on. Every step names the chain
and the action, what it costs (gas plus any deposit) and how long it takes,
and the last step is always a warning: a protocol that records no token may
never launch one — never pay for a "pre-sale" token.

### What this is not

"Records no token" means DefiLlama carries neither a CoinGecko id nor a symbol
for the protocol. That is not proof it has no token or will ever launch one,
and the implied value is an estimate, never a promise. Wrapped, staked and
bridged products of tokens that already trade are excluded, as are versioned
re-releases — the same rule that defines the watchlist, applied to the whole
snapshot.

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier.
- `lib/model.ts` — the model: peer benchmarks, adjustments, farm plans, board builder.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged from the kit.
- `dashboard/` — `index.html`, `app.css`, `app.js`: static page, no network.
- `screenshots/` — board, protocol detail, and filtered views of the dashboard.

## License

MIT — see [LICENSE](LICENSE).
