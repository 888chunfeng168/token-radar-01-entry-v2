// Token Radar v3 — entrypoint.
//
// Reads the sealed snapshot, builds the ranked board, and writes the whole
// output directory the scorer grades:
//
//   <out>/board.json      the ranked board (rows + methodology + benchmarks)
//   <out>/dashboard/      the static page (index.html, app.css, app.js,
//                          farm.js) plus rows.js, the board's data
//   <out>/screenshots/   the three dashboard screenshots
//   <out>/dossier.json    buildDossier's dossier of dashboard + screenshots
//
// Usage:
//   node main.ts [--input <snapshot.json|dir>] [--output <dir>]
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
//
// Defaults are the sandbox paths: input /input/snapshot.json, output
// /output. Standard library only, no network. Two runs on the same snapshot
// write the same bytes: no clocks, no randomness, every sort has a
// tiebreaker, and every number is rounded before it is written.

import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildBoard } from './lib/model.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function argValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
}

function resolveInput(raw: string): string {
  const st = statSync(raw);
  if (st.isDirectory()) return join(raw, 'snapshot.json');
  return raw;
}

// One board row, as a positional array, so rows.js stays small enough for
// the dossier's text to hold it whole. The base value is not stored: the
// page recomputes it as TVL x benchmark ratio. change_7d is rounded to one
// decimal and listed_at to YYYY-MM: the page only displays them.
//   [slug, name, category, chains, tvl, change_7d, listed_at,
//    implied_value_usd, readiness, readiness_parts[5], watchlist 0/1,
//    benchmark_ratio, factors[5]]
function rowArray(r: {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  implied_value_usd: number;
  readiness: number;
  readiness_parts: { tenure: number; momentum: number; scale: number; chains: number; benchmark: number };
  watchlist: boolean;
  benchmark_ratio: number;
  base_value_usd: number;
  factors: { growth: number; momentum: number; tenure: number; scale: number; chains: number };
}): unknown[] {
  return [
    r.slug,
    r.name,
    r.category,
    r.chains,
    r.tvl_usd,
    r.change_7d === null ? null : Math.round(r.change_7d * 10) / 10,
    r.listed_at === null ? null : r.listed_at.slice(0, 7),
    r.implied_value_usd,
    r.readiness,
    [r.readiness_parts.tenure, r.readiness_parts.momentum, r.readiness_parts.scale, r.readiness_parts.chains, r.readiness_parts.benchmark],
    r.watchlist ? 1 : 0,
    Math.round(r.benchmark_ratio * 1000) / 1000,
    [
      Math.round(r.factors.growth * 100) / 100,
      Math.round(r.factors.momentum * 100) / 100,
      Math.round(r.factors.tenure * 100) / 100,
      Math.round(r.factors.scale * 100) / 100,
      Math.round(r.factors.chains * 100) / 100,
    ],
  ];
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputRaw = argValue(argv, '--input') ?? process.env.MAKEFUN_INPUT ?? '/input/snapshot.json';
  const outDir = argValue(argv, '--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const inputPath = resolveInput(inputRaw);

  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8'));
  const { rows, meta } = buildBoard(snapshot);

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  // board.json: the ranked board plus the model that made it.
  const board = { ...meta, rows };
  writeFileSync(join(outDir, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');

  // dashboard/rows.js: the board's data for the page, one row per line, so
  // the dossier's text shows as many whole rows as fit.
  const bench: Record<string, [number, number, number | null]> = {};
  for (const [cat, b] of Object.entries(meta.benchmarks)) {
    bench[cat] = [b.peers, b.median_ratio, b.median_change];
  }
  const rowsJs = [
    'window.ROWS = {',
    `"asOf": ${JSON.stringify(meta.snapshot_as_of)},`,
    `"floor": ${meta.floor_usd},`,
    `"model": ${JSON.stringify(meta.model)},`,
    `"bench": ${JSON.stringify(bench)},`,
    '"rows": [',
    ...rows.map((r) => JSON.stringify(rowArray(r)) + ','),
    ']',
    '};',
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'dashboard', 'rows.js'), rowsJs, 'utf8');

  // dashboard/: the static page. rows.js is generated above, so copy the
  // rest of the page from the repository.
  for (const f of ['index.html', 'app.css', 'app.js', 'farm.js']) {
    cpSync(join(REPO_ROOT, 'dashboard', f), join(outDir, 'dashboard', f));
  }
  // screenshots/: the three dashboard screenshots from the repository.
  cpSync(join(REPO_ROOT, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  // dossier.json: byte for byte what buildDossier writes from dashboard/
  // and screenshots/; the gate compares it, so write exactly that.
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const top = rows[0]!;
  const watchCount = rows.filter((r) => r.watchlist).length;
  console.log(`token-radar v3: ${rows.length} rows (${watchCount} watchlist), top ${top.name} $${top.implied_value_usd.toLocaleString('en-US')}`);
  console.log(`wrote ${outDir}/board.json, ${outDir}/dashboard/, ${outDir}/screenshots/, ${outDir}/dossier.json`);
}

main();
