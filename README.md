# Token Radar v3 — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/888chunfeng168/token-radar-01-entry-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/888chunfeng168/token-radar-01-entry-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for the [make.fun bounty "Build the best token launch radar"](https://make.fun/bounty/token-radar-01)
($1,325 in rewards, closes 2026-12-14 10:00 UTC).

v3 rebuild: a readiness score beside the implied value, tenure and
category-relative momentum in the model, and one shared farm-step module so
the board and the dashboard can never disagree.

The radar reads a sealed DefiLlama snapshot (758 protocols, TVL ≥ $5M, frozen
2026-11-14), finds every protocol that records no token, and ranks it by what
its token would be worth if it launched tomorrow — then hands you a dashboard
with the board, a detail view for every protocol, and a concrete farm plan for each.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
```

Node 22+, standard library only, no network. `main.ts` writes `out/board.json`
(the ranked board), `out/dashboard/` (the page plus `rows.js`, the board's
data), `out/screenshots/` and `out/dossier.json`. Two runs on the same
snapshot write the same bytes (verified: `board.json`, `rows.js` and
`dossier.json` are byte-identical across runs). Open
`out/dashboard/index.html` in a browser.

## What it ranks

- **198 rows**: every protocol in the snapshot that records no token and is
  not a wrapped, staked or bridged product of one that trades — all 40 on
  the snapshot's watchlist (TVL ≥ $50M), the 138 pre-token protocols below
  the floor, and 20 more above the floor that record no token. The watchlist
  is the floor, never the ceiling.
- Every row carries an implied value in whole dollars, a readiness score
  (0–100), and 6 farm steps with what each costs and how long it takes.
- The dashboard sorts by implied value / TVL / 7-day change / readiness /
  longest with no token, filters by category and chain, searches by name,
  and opens a detail view per protocol with the full valuation breakdown.

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
protocols (0.214 in this snapshot), and the dashboard says so wherever it
applies. The benchmark table is shown on the dashboard itself.

```
base value = TVL × category median mcap/TVL ratio
```

### 2. Bounded adjustments — what the snapshot says about this protocol

Five multiplicative adjustments, each small and each shown in the detail view:

| Factor | Rule | Range |
| --- | --- | --- |
| Growth | 7-day TVL change, clamped to ±50%, mapped linearly | 0.80 – 1.20 |
| Momentum | 7-day change vs the category median: +5% when 10 points ahead, −5% when 10 behind | 0.95 – 1.05 |
| Tenure | Listed < 6 mo +2%; 6–18 mo +8%; 18–36 mo +10%; 3–5 y +4%; > 5 y −6%; unknown 0 | 0.94 – 1.10 |
| Scale | TVL > $1B −10%; $500M–$1B −5%; $100M–$500M 0; $25M–$100M +5%; < $25M +8% | 0.90 – 1.08 |
| Chains | 1 chain 0; 2–3 chains +4%; 4+ chains +8% | 1.00 – 1.08 |

The five multiply together and the product is clamped to **0.70 – 1.40**, so no
protocol's value is ever mostly adjustment: the peer benchmark does the work.

### 3. A cap

No implied value exceeds **$10B**. Where a category has 3 or more
token-bearing peers, the cap is also **twice the largest peer market cap in
its category**, whichever is smaller — a category with fewer peers already
falls back to the global median for its benchmark, so one small peer's market
cap does not get to dictate the value of the category's giants. Values are
rounded to the nearest $10,000, and neighbours are nudged so the value never
rises as rank ascends. Ties break by readiness, then TVL.

### 4. Readiness — a second dimension, not a second value

Readiness (0–100) scores how farmable a protocol looks right now: token-less
tenure 30%, 7-day momentum 25%, TVL scale 20%, chain breadth 15%, benchmark
strength 10%. The board still sorts by implied value; readiness is the
tiebreaker for attention, and the dashboard's "Early finds" strip lists the
highest-readiness protocols below the $50M floor.

### 5. Farm plans

Each protocol gets 6 steps from its own category's playbook (18 playbooks,
one per category family, plus a generic fallback): a cheap first move, the
main uses, a second chain where the protocol runs on one, a weekly cadence, a
signal to watch for, and a warning. Every step names the chain and the action,
what it costs (gas plus any deposit) and how long it takes. The plans are
generated by `dashboard/farm.js`, the one module both the program and the page
use, so the board and the dashboard can never disagree. A protocol on one
chain only gets a repeat-use step instead of a second-chain step it could not
follow.

### What this is not

"Records no token" means DefiLlama carries neither a CoinGecko id nor a symbol
for the protocol. That is not proof it has no token or will ever launch one,
and the implied value is an estimate, never a promise. Wrapped, staked and
bridged products of tokens that already trade are excluded, as are versioned
re-releases — the same rule that defines the watchlist, applied to the whole
snapshot with only the snapshot's ten fields (DefiLlama's parent-protocol
record is not one of them).

## Layout

- `main.ts` — entrypoint: reads the snapshot, writes the board, data, dashboard, screenshots and dossier.
- `lib/model.ts` — the model: peer benchmarks, adjustments, readiness, board builder.
- `dashboard/farm.js` — the farm-step generator, shared by the program and the page.
- `dashboard/` — `index.html`, `app.css` and `app.js`: static page, no network. `rows.js` is generated by `main.ts` into the output dashboard.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged from the kit.
- `screenshots/` — board, protocol detail, and filtered views of the dashboard.

## License

MIT — see [LICENSE](LICENSE).
