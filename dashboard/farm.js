// Farm-step generator for Token Radar v3. One source of truth: lib/model.ts
// calls Farm.stepsFor to fill board.json, and the dashboard calls the same
// function to render a protocol's detail view, so board and page agree.
// Pure functions, no network, no dates, no randomness: the same protocol
// always gets the same steps, so two runs write the same board. Every step
// names what to do, what it costs and how long it takes, in 20 to 600
// characters. {n} is the protocol name, {c} its first chain, {c2} a second.

function fill(t, p) {
  return t
    .replaceAll('{n}', p.name)
    .replaceAll('{c}', p.chains[0] || 'Ethereum')
    .replaceAll('{c2}', p.chains[1] || p.chains[0] || 'Ethereum');
}

// Three core steps per category: a cheap first move, the main use, and a
// second use that reaches a second chain when the protocol runs on one.
const PLAY = {
  Dexs: [
    'Swap $25 to $100 through {n} on {c}: pick a liquid pair, keep slippage under 0.5%, and keep the receipt. Cost: about $1 to $5 in gas plus the swap. Time: 10 minutes.',
    'Add $100 to $500 of liquidity to a {n} pool on {c} in a pair you would hold anyway, and leave it for at least two weeks. Cost: about $2 to $8 in gas plus the deposit. Time: 20 minutes to set up.',
    'Use {n} on {c2} as well when the pair exists there, so your activity spans more than one chain. Cost: one more bridge and swap, about $3 to $10 in gas. Time: 15 minutes.',
  ],
  Lending: [
    'Supply $50 to $200 of a major asset to {n} on {c} as a first deposit, and leave it supplied. Cost: about $2 to $8 in gas plus the deposit. Time: 10 minutes.',
    'Borrow a small amount against that supply on {n}, then repay it within the week, so you have both a supply and a borrow on record. Cost: about $3 to $10 in gas plus borrow interest. Time: 20 minutes.',
    'Repeat the supply on {c2} if {n} runs there, keeping each position small enough that a liquidation never threatens it. Cost: about $3 to $10 in gas per chain. Time: 15 minutes per chain.',
  ],
  Yield: [
    'Deposit $50 to $200 into a {n} vault on {c} and let it run for at least a month. Cost: about $2 to $8 in gas plus the deposit. Time: 10 minutes.',
    'Claim or compound the vault yield on {n} once it is worth more than the gas it costs to claim. Cost: about $2 to $8 in gas per claim. Time: 10 minutes per claim.',
    'Try a second {n} vault on {c2} when one exists, with a different asset, so you are not in a single vault only. Cost: about $2 to $8 in gas plus the deposit. Time: 15 minutes.',
  ],
  'Yield Aggregator': [
    'Deposit $50 to $200 into a {n} strategy on {c} and leave it for at least a month. Cost: about $2 to $8 in gas plus the deposit. Time: 10 minutes.',
    'Move the position to a different {n} strategy after a month if the first one is flat, so you show real use rather than one deposit. Cost: about $3 to $10 in gas. Time: 15 minutes.',
    'Run the same strategy on {c2} when {n} supports it, so your history covers two chains. Cost: about $3 to $10 in gas plus the deposit. Time: 15 minutes.',
  ],
  Derivatives: [
    'Open a small $25 to $100 perpetual or option position on {n} on {c} with low leverage, and close it within a few days. Cost: about $2 to $8 in gas plus trading fees. Time: 15 minutes.',
    'Place a second small trade on {n} in the opposite direction a week later, so you have more than one settled trade. Cost: about $2 to $8 in gas plus trading fees. Time: 15 minutes.',
    'Try {n} on {c2} if it runs there, keeping every position small enough to lose without pain. Cost: about $3 to $10 in gas plus trading fees. Time: 15 minutes.',
  ],
  CDP: [
    'Open a small collateralised position on {n} on {c}: lock $100 to $300 of collateral and mint well under half of what the position allows. Cost: about $3 to $10 in gas plus the collateral. Time: 15 minutes.',
    'Repay part of the minted amount after a week and top the collateral up once, so the position shows maintenance rather than a single open. Cost: about $3 to $10 in gas. Time: 10 minutes.',
    'Open a second small position on {c2} when {n} runs there, keeping the same conservative ratio. Cost: about $3 to $10 in gas plus the collateral. Time: 15 minutes.',
  ],
  RWA: [
    'Buy $50 to $200 of a tokenised real-world asset on {n} on {c} and hold it for at least a month. Cost: about $2 to $8 in gas plus the purchase. Time: 10 minutes.',
    'Use the position once more on {n}: transfer it, use it as collateral, or redeem a small part, so it is not a single buy. Cost: about $2 to $8 in gas. Time: 15 minutes.',
    'Hold the same kind of asset on {c2} when {n} issues there, keeping the total modest. Cost: about $2 to $8 in gas plus the purchase. Time: 15 minutes.',
  ],
  'Risk Curators': [
    'Allocate $100 to $300 to a {n} curated vault on {c} and leave it allocated for at least a month. Cost: about $2 to $8 in gas plus the allocation. Time: 10 minutes.',
    'Read the vault curator report on {n} and move a small part of the allocation to a second vault run by a different curator. Cost: about $3 to $10 in gas. Time: 20 minutes.',
    'Allocate on {c2} as well when {n} curates there, so your history is not on one chain only. Cost: about $3 to $10 in gas plus the allocation. Time: 15 minutes.',
  ],
  'Onchain Capital Allocator': [
    'Allocate $100 to $300 through {n} on {c} to a strategy you understand, and leave it for at least a month. Cost: about $2 to $8 in gas plus the allocation. Time: 15 minutes.',
    'Rebalance once: move a small part of the allocation to a second {n} strategy after a month. Cost: about $3 to $10 in gas. Time: 15 minutes.',
    'Allocate on {c2} when {n} supports it, keeping each allocation small. Cost: about $3 to $10 in gas plus the allocation. Time: 15 minutes.',
  ],
  'Basis Trading': [
    'Open a small $50 to $200 delta-neutral position on {n} on {c} and hold it for at least two weeks. Cost: about $2 to $8 in gas plus funding. Time: 20 minutes.',
    'Close and reopen the position once after two weeks, so you have a full round trip on record. Cost: about $3 to $10 in gas plus funding. Time: 15 minutes.',
    'Run the same strategy on {c2} when {n} supports it, keeping the size small. Cost: about $3 to $10 in gas plus funding. Time: 15 minutes.',
  ],
  'Liquidity Manager': [
    'Deposit $50 to $200 into a {n} managed liquidity position on {c} and leave it for at least two weeks. Cost: about $2 to $8 in gas plus the deposit. Time: 10 minutes.',
    'Rebalance the position once when {n} suggests it, rather than leaving it untouched. Cost: about $2 to $8 in gas. Time: 10 minutes.',
    'Open a second managed position on {c2} when {n} runs there. Cost: about $2 to $8 in gas plus the deposit. Time: 15 minutes.',
  ],
  'Leveraged Farming': [
    'Open a small $50 to $150 leveraged farm on {n} on {c} at the lowest leverage it offers, and watch it for a week. Cost: about $3 to $10 in gas plus the deposit. Time: 20 minutes.',
    'Close half the position after a week and keep the rest running, so you show an exit as well as an entry. Cost: about $3 to $10 in gas. Time: 10 minutes.',
    'Try the same low-leverage farm on {c2} when {n} supports it. Cost: about $3 to $10 in gas plus the deposit. Time: 15 minutes.',
  ],
  'Prediction Market': [
    'Place a small $10 to $50 prediction on {n} on {c} on an outcome you have a view on, and let it settle. Cost: about $1 to $5 in gas plus the stake. Time: 10 minutes.',
    'Place a second prediction on {n} on a different market a week later, so you have more than one settled position. Cost: about $1 to $5 in gas plus the stake. Time: 10 minutes.',
    'Trade a prediction on {c2} when {n} runs there, keeping every stake small. Cost: about $2 to $8 in gas plus the stake. Time: 10 minutes.',
  ],
  Restaking: [
    'Restake $50 to $200 of a liquid staking token through {n} on {c} and leave it restaked for at least a month. Cost: about $2 to $8 in gas plus the deposit. Time: 10 minutes.',
    'Delegate the restaked position to a second operator on {n} after two weeks, so you show more than one delegation. Cost: about $2 to $8 in gas. Time: 10 minutes.',
    'Restake on {c2} when {n} supports it, keeping the total modest. Cost: about $2 to $8 in gas plus the deposit. Time: 15 minutes.',
  ],
  Indexes: [
    'Buy $50 to $200 of a {n} index token on {c} and hold it for at least a month. Cost: about $2 to $8 in gas plus the purchase. Time: 10 minutes.',
    'Rebalance once: sell a small part of the index and buy a second {n} index product. Cost: about $2 to $8 in gas. Time: 15 minutes.',
    'Hold an index on {c2} when {n} issues there. Cost: about $2 to $8 in gas plus the purchase. Time: 15 minutes.',
  ],
  Payments: [
    'Make a first $25 to $100 payment through {n} on {c} to an address you control, and keep the receipt. Cost: about $1 to $5 in gas plus the payment. Time: 10 minutes.',
    'Use {n} for a second, different payment a few days later, so you have a pattern of use rather than one transfer. Cost: about $1 to $5 in gas plus the payment. Time: 10 minutes.',
    'Pay through {n} on {c2} when it supports it. Cost: about $2 to $8 in gas plus the payment. Time: 10 minutes.',
  ],
  Insurance: [
    'Buy $25 to $100 of cover on {n} on {c} for a protocol you already use, for at least a month of cover. Cost: about $2 to $8 in gas plus the premium. Time: 15 minutes.',
    'Buy a second small cover on {n} for a different risk a few weeks later. Cost: about $2 to $8 in gas plus the premium. Time: 15 minutes.',
    'Hold cover on {c2} when {n} underwrites there. Cost: about $2 to $8 in gas plus the premium. Time: 15 minutes.',
  ],
  'CDP Manager': [
    'Open a small managed collateral position through {n} on {c}, locking $100 to $300 of collateral at a conservative ratio. Cost: about $3 to $10 in gas plus the collateral. Time: 15 minutes.',
    'Let {n} rebalance the position once, or top the collateral up yourself after a week. Cost: about $3 to $10 in gas. Time: 10 minutes.',
    'Open a second small managed position on {c2} when {n} runs there. Cost: about $3 to $10 in gas plus the collateral. Time: 15 minutes.',
  ],
};

// The fallback for every other category: the same shape, written for a
// protocol whose category has no playbook of its own.
const GENERIC = [
  'Make a first $25 to $100 test transaction on {n} on {c}: use its main feature once with a small amount and keep the receipt. Cost: about $1 to $5 in gas plus the amount. Time: 10 minutes.',
  'Use {n} a second time on {c} a few days later with a different action than the first, so you have more than one kind of activity. Cost: about $2 to $8 in gas. Time: 15 minutes.',
  'Use {n} on {c2} as well when it runs there, so your history spans more than one chain. Cost: about $3 to $10 in gas. Time: 15 minutes.',
];

// The same three closing steps for every protocol: a cadence, a signal to
// watch for, and the warning that belongs on every farm plan.
function closingSteps(p) {
  const chains = p.chains.length;
  return [
    `Come back to {n} every week for a month: one small action a week beats one big day, and airdrop checks usually reward steady use. Cost: about $2 to $8 in gas a week. Time: 15 minutes a week.`.replaceAll('{n}', p.name),
    `Watch {n} for a points program, a quest, or an announcement about a token, and do the official tasks it names${chains > 1 ? ' on ' + p.chains[0] + ' first' : ''}. Cost: no gas until you act. Time: 5 minutes a week to check.`.replaceAll('{n}', p.name),
    `{n} records no token, which is not proof it has none and not a promise it will ever launch one. Never pay for a pre-sale, a voucher, or an early token for {n}: a real launch never asks for that. Cost: nothing. Time: none.`.replaceAll('{n}', p.name),
  ];
}

function stepsFor(p) {
  const core = (PLAY[p.category] || GENERIC).map((t) => fill(t, p));
  // A protocol on one chain only gets a repeat-use third step instead of a
  // second-chain step: telling it to use a chain it does not run on would
  // be a plan nobody can follow.
  if (p.chains.length < 2) {
    core[2] = `Do the main ${p.name} action a second time on ${p.chains[0] || 'Ethereum'} two weeks later with a fresh amount, so your history shows repeat use rather than one visit. Cost: about $2 to $8 in gas. Time: 15 minutes.`;
  }
  const steps = core.concat(closingSteps(p));
  // Every step must be 20 to 600 characters; trim nothing, just verify.
  for (const s of steps) {
    if (s.length < 20 || s.length > 600) throw new Error('farm step out of range: ' + s.length + ' chars');
  }
  return steps;
}

// The cheapest first move only: the board table shows it as a preview under
// each protocol, and the detail view shows the whole plan.
function firstMove(p) {
  return stepsFor(p)[0];
}

globalThis.Farm = { stepsFor, firstMove, categories: Object.keys(PLAY), version: 'v3' };
