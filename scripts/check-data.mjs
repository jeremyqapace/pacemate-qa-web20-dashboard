#!/usr/bin/env node
/*
 * Checks that the files in data/ (or another folder) have what the dashboard needs.
 *
 *   node scripts/check-data.mjs            checks data/
 *   node scripts/check-data.mjs samples    checks samples/
 *   node scripts/check-data.mjs data --stale-hours 48
 *   node scripts/check-data.mjs data --fail-if-stale     stale data counts as an error
 *
 * Exit code 1 means the page would break or show nothing. Warnings mean it still
 * works but something looks off. No dependencies; needs Node 18 or newer.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const folder = path.resolve(root, args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || 'data');
const staleIdx = args.indexOf('--stale-hours');
const failIfStale = args.includes('--fail-if-stale');

// Read settings from config.js so this check uses the same rules as the page.
let cfg = { excludeTypes: ['API'], staleAfterHours: 24 };
try {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), sandbox);
    cfg = Object.assign(cfg, sandbox.window.DASHBOARD_CONFIG || {});
} catch { /* config.js missing or broken: use defaults */ }
const staleHours = staleIdx >= 0 ? Number(args[staleIdx + 1]) : Number(cfg.staleAfterHours);
const excluded = new Set((cfg.excludeTypes || []).map(t => String(t).toUpperCase()));

const errors = [], warnings = [], ok = [];
const err = m => errors.push(m), warn = m => warnings.push(m), pass = m => ok.push(m);
const isDate = v => typeof v === 'string' && !isNaN(Date.parse(v));
const STATUSES = new Set(['passed', 'failed', 'flaky', 'broken', 'skipped']);

function readJson(name, required) {
    const file = path.join(folder, name);
    if (!fs.existsSync(file)) { (required ? err : warn)(`${name} is missing.${required ? ' The page will show "No run data found".' : ' That part of the page will be empty.'}`); return null }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
    catch (e) { err(`${name} is not valid JSON: ${e.message}`); return null }
}

// ── results.json ──
const res = readJson('results.json', true);
if (res) {
    if (!res.runId || typeof res.runId !== 'string') err('results.json has no runId. The page treats it as "waiting for the first run".');
    else pass(`results.json is run ${res.runId}`);
    if (!isDate(res.generatedAt)) err('results.json generatedAt is missing or not a date.');
    else {
        const hrs = (Date.now() - Date.parse(res.generatedAt)) / 3600000;
        if (hrs > staleHours) (failIfStale ? err : warn)(`The latest run finished ${Math.round(hrs / 24)} days ago (${res.generatedAt}). Is the scheduled workflow still pushing?`);
    }
    if (!Array.isArray(res.tests)) err('results.json has no tests array.');
    else {
        const shown = res.tests.filter(t => !excluded.has(String(t.type || '').toUpperCase()));
        const hiddenCount = res.tests.length - shown.length;
        if (!shown.length) err(`results.json has ${res.tests.length} tests but none are shown here (all are type ${[...excluded].join(', ')}).`);
        else pass(`${shown.length} tests shown${hiddenCount ? `, ${hiddenCount} left out (type ${[...excluded].join(', ')})` : ''}`);
        const noName = res.tests.filter(t => !t.name).length;
        if (noName) err(`${noName} tests have no name.`);
        const badStatus = [...new Set(res.tests.map(t => String(t.status || '').toLowerCase()).filter(s => !STATUSES.has(s)))];
        if (badStatus.length) warn(`Unknown test statuses: ${badStatus.join(', ')}. The page shows them as skipped.`);
        const noComp = shown.filter(t => !t.comp).length;
        if (noComp) warn(`${noComp} tests have no comp (suite). They appear under "Uncategorized".`);
        const noType = res.tests.filter(t => !t.type).length;
        if (noType) warn(`${noType} tests have no type. They are treated as shown, not excluded.`);
        const noDur = shown.filter(t => !t.dur).length;
        if (noDur) warn(`${noDur} shown tests have no dur. Duration sorting and the duration graph will skip them.`);
        const failedNoErr = shown.filter(t => ['failed', 'broken'].includes(String(t.status).toLowerCase()) && !t.err && !t.fullErr).length;
        if (failedNoErr) warn(`${failedNoErr} failed tests have no err or fullErr. They are grouped under "No error message was recorded".`);
        const dupes = shown.length - new Set(shown.map(t => t.name)).size;
        if (dupes) warn(`${dupes} shown tests share a name with another test. Rerun commands for them will match more than one scenario.`);
    }
    if (!res.summary || !res.summary.duration) warn('results.json summary.duration is missing. Run time shows as "--".');
}

// ── runs.json ──
const runs = readJson('runs.json', false);
if (runs) {
    const list = Array.isArray(runs) ? runs : runs.runs;
    if (!Array.isArray(list)) err('runs.json is not an array of runs.');
    else if (!list.length) warn('runs.json has no runs yet. History and trends will be empty.');
    else {
        pass(`runs.json has ${list.length} runs`);
        const noId = list.filter(r => !r.runId && r.runNum == null).length;
        if (noId) err(`${noId} runs have neither runId nor runNum.`);
        const noRate = list.filter(r => typeof r.rate !== 'number').length;
        if (noRate) warn(`${noRate} runs have no numeric rate.`);
        const noDate = list.filter(r => !isDate(r.generatedAt)).length;
        if (noDate) warn(`${noDate} runs have no valid generatedAt.`);
        const noUi = list.filter(r => !(r.layers && r.layers.ui && r.layers.ui.total)).length;
        if (noUi && res && Array.isArray(res.tests) && res.tests.some(t => excluded.has(String(t.type || '').toUpperCase())))
            warn(`${noUi} runs have no layers.ui breakdown. They are left out of trends and run-to-run changes.`);
        else if (!noUi) pass('every run has a layers.ui breakdown');
        const times = list.map(r => Date.parse(r.generatedAt)).filter(n => !isNaN(n));
        if (times.some((t, i) => i && t < times[i - 1])) warn('runs.json is not in time order. Charts read it oldest to newest.');
        const last = list[list.length - 1];
        const lastId = last.runId || (last.runNum != null ? `R-${last.runNum}` : '');
        if (res && res.runId && lastId && lastId !== res.runId) warn(`The newest run in runs.json is ${lastId}, but results.json is ${res.runId}.`);
    }
}

// ── coverage-results.json ──
const cov = readJson('coverage-results.json', false);
if (cov) {
    if (!Array.isArray(cov.requirements)) warn('coverage-results.json has no requirements array. The Requirements page will be empty.');
    else pass(`coverage-results.json has ${cov.requirements.length} requirement areas`);
}

// ── report ──
const rel = path.relative(root, folder) || '.';
console.log(`\nChecking ${rel}/\n`);
ok.forEach(m => console.log(`  OK     ${m}`));
warnings.forEach(m => console.log(`  WARN   ${m}`));
errors.forEach(m => console.log(`  ERROR  ${m}`));
console.log(`\n${errors.length ? `${errors.length} error(s): the dashboard would break or show nothing.` : 'No errors: the dashboard can read these files.'}${warnings.length ? ` ${warnings.length} warning(s).` : ''}\n`);
process.exit(errors.length ? 1 : 0);
