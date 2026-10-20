/*
 * PaceMate QA dashboard logic. No build step: this file runs as is in the browser.
 *
 * Sections, in order (search for the heading to jump there):
 *   Settings            reads config.js
 *   helpers             formatting, rerun command, copy to clipboard
 *   data prep           prepare(): filters out API tests and computes counts
 *   run-to-run          prevRun(), delta(), streakInfo()
 *   sidebar + top bar   renderShell()
 *   overview            summary, trend, categories, suites, environment
 *   graphs              renderGraphs()
 *   categories          error groups (renderFix) and flaky tests
 *   suites              test tree and details pane
 *   history, coverage, requirements
 *   modal + test details, tooltip, drawer, views, events, theme, load
 *
 * Data it reads: results.json, runs.json, coverage-results.json (see README, "Data the page needs").
 */
        (function () {
            'use strict';

            /* ── Settings: edit config.js, not this file ── */
            const CFG = Object.assign({
                releaseThreshold: 80, rerunCommand: 'npx cucumber-js --profile web20', greetingName: 'team',
                defaultRange: 10, staleAfterHours: 24, excludeTypes: ['API'], maxSuitesListed: 10, dataFolder: './data', suiteLabel: ''
            }, window.DASHBOARD_CONFIG || {});
            const TH = Number(CFG.releaseThreshold);
            const RERUN_BASE = CFG.rerunCommand;
            const GREETING_NAME = CFG.greetingName;
            const DEFAULT_RANGE = Number(CFG.defaultRange);
            const LIST_MAX = Number(CFG.maxSuitesListed) || 10;
            const EXCLUDE = new Set((CFG.excludeTypes || []).map(x => String(x).toUpperCase()));
            const suiteName = D => CFG.suiteLabel || (D && D.suite) || 'Smoke Tests';
            const CMD_LIMIT = 7000;                               // cmd.exe cuts commands off near 8,191 characters
            // ?data=samples previews the page with the sample files in samples/
            const SAMPLE = (new URLSearchParams(location.search).get('data') || '').match(/^[\w-]+$/) ? new URLSearchParams(location.search).get('data') : null;
            const DATA = SAMPLE ? `./${SAMPLE}` : String(CFG.dataFolder || './data').replace(/\/$/, '');

            const $ = (s, r = document) => r.querySelector(s);
            const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
            const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const r1 = n => Math.round((Number(n) || 0) * 10) / 10;
            const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
            const isPhone = () => window.matchMedia('(max-width: 899px)').matches;
            const isNarrow = () => window.matchMedia('(max-width: 1099px)').matches;

            /* Outline icons, drawn to match the app's sidebar */
            const ICONS = {
                home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/>',
                alert: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/>',
                zap: '<path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12l1-7.5z"/>',
                list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
                bars: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
                clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
                check: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="m8 12.5 3 3 5-6"/>',
                file: '<path d="M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z"/><path d="M14 3.5V8h4.5"/><path d="M9 13h6M9 16.5h6"/>',
                pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
                target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
                external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
                help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.2-1 .8-1 1.4v.6"/><path d="M12 16.8h.01"/>',
                search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
                panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15"/>',
                menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
                sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
                moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
                party: '<path d="M4 20 9 7l8 8-13 5z"/><path d="M14 4v2M19 9h2M17.5 5.5 19 4"/>',
                grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'
            };
            const svg = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
            function paintIcons(root = document) { $$('i[data-icon]', root).forEach(el => { const t = document.createElement('template'); t.innerHTML = svg(el.dataset.icon); const s = t.content.firstChild; if (el.id) s.id = el.id; el.replaceWith(s) }) }
            paintIcons();

            const STATUS = { passed: 'Passed', failed: 'Failed', flaky: 'Flaky', skipped: 'Skipped' };
            const ORDER = { failed: 0, flaky: 1, skipped: 2, passed: 3 };

            const state = {
                D: null, S: null, tests: [], comp: [], flaky: [], hidden: 0, apiNames: new Set(), runs: [], cov: null, view: 'ov', boardAll: false, groups: [],
                range: (() => { try { const v = localStorage.getItem('qa-dash-range'); return v === null ? DEFAULT_RANGE : +v } catch (e) { return DEFAULT_RANGE } })(),
                at: { status: 'all', comp: 'all', q: '', sort: 'group' },
                su: { toggled: new Map(), sel: null, allOpen: null },
                cv: { status: 'all', q: '', closed: new Set() }
            };

            /* ── helpers ── */
            function statusOf(s) { s = String(s || '').toLowerCase(); if (s === 'broken') return 'failed'; return STATUS[s] ? s : 'skipped' }
            function sq(s, extra = '') { return `<i class="sq ${s} ${extra}" aria-hidden="true"></i>` }
            function chip(s, label) { return `<span class="chip">${sq(s, 'key')}${label || STATUS[s] || 'Skipped'}</span>` }
            function pmwOf(n) { const m = String(n || '').match(/PMW-\d+(?:\.\d+)*/); return m ? m[0] : null }
            function cleanName(n) { const s = String(n || ''); return s.replace(/^\[[^\]]+\]\s*[-\u2013\u2014]?\s*/, '').replace(/PMW-\d+(?:\.\d+)*\s*[-\u2013\u2014:]\s*/, '').trim() || s }
            const ANSI_RE = /[\u001b\u009b][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
            const clean = v => typeof v === 'string' ? v.replace(ANSI_RE, '') : v;
            function firstLine(s) { const l = String(s || '').split('\n').find(x => x.trim()) || ''; return l.trim().length > 200 ? l.trim().slice(0, 197) + '...' : l.trim() }
            function secs(d) { if (typeof d === 'number') return d; let t = 0, m; const re = /(\d+(?:\.\d+)?)\s*(ms|h|m|s)\b/g; while ((m = re.exec(String(d || '')))) { const v = +m[1]; t += m[2] === 'h' ? v * 3600 : m[2] === 'm' ? v * 60 : m[2] === 's' ? v : v / 1000 } return t }
            const fmtDur = v => { v = Math.round(v); if (v >= 3600) return `${Math.floor(v / 3600)}h ${Math.round(v % 3600 / 60)}m`; if (v >= 60) return `${Math.floor(v / 60)}m${v % 60 ? ' ' + String(v % 60).padStart(2, '0') + 's' : ''}`; return `${v}s` };
            function ago(iso) {
                if (!iso) return '';
                const s = Math.floor((Date.now() - new Date(iso)) / 1000);
                if (isNaN(s)) return '';
                if (s < 60) return 'just now';
                if (s < 3600) return plural(Math.floor(s / 60), 'minute') + ' ago';
                if (s < 86400) return plural(Math.floor(s / 3600), 'hour') + ' ago';
                return plural(Math.floor(s / 86400), 'day') + ' ago';
            }
            const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) };
            function bar(p, cls) { const w = Math.max(0, Math.min(100, p)); return `<span class="bar" aria-hidden="true"><span class="bar-fill ${cls || (p < TH ? 'low' : '')}" style="width:${w}%"></span>${cls ? '' : `<span class="bar-mark" style="left:${TH}%"></span>`}</span>` }
            function cellCls(p) { return p >= 95 ? 'hi' : p >= TH ? 'mid' : 'low' }
            function runIdOf(r) { return r.runId || (r.runNum != null ? `R-${r.runNum}` : 'Run') }
            function emptyBox(icon, title, text, extra = '') { return `<div class="empty">${svg(icon)}<b>${title}</b>${text}${extra}</div>` }
            const miniEmpty = text => `<div class="mini-empty">${text}</div>`;

            /* A run as the report shows it: UI-only numbers. Uses layers.ui when the run has it.
               _ui is false only for old runs that mix UI and API with no breakdown. */
            function runView(r) {
                if (!r) return r;
                const D = state.D, S = state.S;
                if (D && S && runIdOf(r) === D.runId) return Object.assign({}, r, { rate: S.rate, total: S.total, passed: S.passed, failed: S.failed, flaky: S.flaky, _ui: true });
                const u = r.layers && r.layers.ui;
                if (u && u.total) return Object.assign({}, r, { rate: Number(u.rate), total: u.total, passed: u.passed ?? 0, failed: u.failed ?? 0, flaky: u.flaky ?? 0, _ui: true });
                return Object.assign({}, r, { _ui: !state.hidden });
            }
            /* Runs up to and including the current one, as [{ r, i }] where i indexes runs.json (-1 = only in results.json). */
            function windowRuns(range, uiOnly) {
                const D = state.D, all = state.runs || [];
                let rows = all.map((r, i) => ({ r: runView(r), i }));
                const idx = rows.findIndex(x => runIdOf(x.r) === D.runId);
                if (idx >= 0) rows = rows.slice(0, idx + 1);
                else rows.push({ r: runView({ runId: D.runId, generatedAt: D.generatedAt, duration: state.S.duration, branch: D.branch, suite: D.suite, env: D.env, runUrl: D.runUrl }), i: -1 });
                if (uiOnly) rows = rows.filter(x => x.r._ui);
                return range ? rows.slice(-range) : rows;
            }

            /* --name is a regex. Anything other than letters, digits, spaces, _ and - becomes "." (match any
               character), so the filter is safe inside double quotes in cmd.exe, PowerShell and bash. */
            function nameRx(name) { return cleanName(name).replace(/[^A-Za-z0-9 _-]/g, '.').replace(/\s+/g, ' ').trim() }
            function rerunCmd(list) { return `${RERUN_BASE} ${list.map(t => `--name "${nameRx(t.name)}"`).join(' ')}` }

            let toastTimer;
            function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400) }
            function copyBatch(list, what) {
                const cmd = rerunCmd(list);
                copy(cmd, cmd.length > CMD_LIMIT
                    ? `Copied. This command is long (${cmd.length.toLocaleString()} characters), so paste it in PowerShell or bash. cmd.exe cuts it off.`
                    : `Command for all ${list.length} ${what} tests copied`);
            }
            function copy(text, msg) {
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast(msg), () => toast('Copy failed. Your browser blocked the clipboard.'));
                else toast('Copy failed. Your browser blocked the clipboard.');
            }

            /* ── data prep: keep UI only ── */
            function prepare(D) {
                const all = (D.tests || []).map(t => Object.assign({}, t, { name: clean(t.name), err: clean(t.err), fullErr: clean(t.fullErr), failedStep: clean(t.failedStep), status: statusOf(t.status), comp: t.comp || 'Uncategorized' }));
                const isApi = t => EXCLUDE.has(String(t.type || '').toUpperCase());
                const tests = all.filter(t => !isApi(t));
                tests.forEach((t, i) => { t._i = i; t._s = secs(t.dur) });
                const hidden = all.length - tests.length;
                const count = s => tests.filter(t => t.status === s).length;
                // Counts always come from the test list so every number on the page agrees.
                const base = D.summary || {}, total = tests.length, passed = count('passed');
                const S = Object.assign({}, base, { total, passed, failed: count('failed'), flaky: count('flaky'), skipped: count('skipped'), rate: total ? r1(passed / total * 100) : 0 });
                if (!hidden && base.rate != null && base.total === total && base.failed === S.failed && base.flaky === S.flaky) S.rate = base.rate;

                const hist = {};
                (D.comp || []).forEach((c, i) => { hist[c.name] = (D.hData && D.hData[i]) || c.sparks || null });
                const map = new Map();
                tests.forEach(t => {
                    if (!map.has(t.comp)) map.set(t.comp, { name: t.comp, total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 });
                    const c = map.get(t.comp); c.total++; c[t.status]++;
                });
                const comp = Array.from(map.values())
                    .map(c => Object.assign(c, { pct: c.total ? Math.round(c.passed / c.total * 100) : 0, hist: hist[c.name] || null }))
                    .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
                const names = new Set(tests.map(t => t.name));
                state.D = D; state.S = S; state.tests = tests; state.comp = comp; state.hidden = hidden;
                state.apiNames = new Set(all.filter(isApi).map(t => t.comp));
                state.flaky = (D.flaky || []).filter(f => !hidden || names.has(f.name));
                state.groups = errorGroups(tests.filter(t => t.status === 'failed'));
            }

            /* Group failures that share the same first error line, ignoring numbers and quoted values. */
            function errorGroups(list) {
                const m = new Map();
                list.forEach(t => {
                    const line = firstLine(t.err || t.fullErr);
                    const key = line ? line.replace(/\d+/g, '#').replace(/(["'`]).*?\1/g, 'q').toLowerCase() : '__none';
                    if (!m.has(key)) m.set(key, { line: line || 'No error message was recorded', none: !line, tests: [] });
                    m.get(key).tests.push(t);
                });
                return Array.from(m.values()).sort((a, b) => b.tests.length - a.tests.length || a.none - b.none);
            }

            /* ── run-to-run (UI only) ── */
            function prevRun() {
                const rows = windowRuns(0, false);
                const p = rows.length > 1 ? rows[rows.length - 2].r : null;
                if (p && p._ui) return { id: runIdOf(p), rate: Number(p.rate), failed: p.failed ?? null, flaky: p.flaky ?? null, dur: p.duration ? secs(p.duration) : null };
                return null;
            }
            function delta(cur, prev, lowerIsBetter, fmt, id) {
                if (prev == null || cur == null || isNaN(prev) || isNaN(cur)) return '';
                const d = cur - prev, tip = id ? ` title="Change from ${esc(id)}"` : '';
                if (Math.abs(d) < 1e-9) return `<span class="delta flat"${tip}>no change</span>`;
                const good = lowerIsBetter ? d < 0 : d > 0;
                return `<span class="delta ${good ? 'good' : 'bad'}"${tip}>${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}</span>`;
            }
            function streakInfo() {
                const rows = windowRuns(0, false).map(x => x.r);
                let k = rows.length; while (k > 0 && rows[k - 1]._ui) k--;
                const list = rows.slice(k);
                if (list.length < 2) return null;
                const ok = r => Number(r.rate) >= TH, cur = ok(list[list.length - 1]);
                let n = 0; for (let i = list.length - 1; i >= 0 && ok(list[i]) === cur; i--) n++;
                let before = 0; for (let i = list.length - 1 - n; i >= 0 && ok(list[i]) !== cur; i--) before++;
                return { ok: cur, n, before };
            }

            /* ── greeting ── */
            function renderGreeting() {
                const D = state.D; if (!D) return;
                const h = new Date().getHours();
                const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
                $('#ovSub').textContent = `${hi}, ${GREETING_NAME}. Run ${D.runId} finished ${ago(D.generatedAt)} on ${D.branch || 'main'} in ${D.env || 'Dev'}.`;
            }

            /* ── sidebar + top bar ── */
            function renderShell() {
                const D = state.D, S = state.S;
                const meta = [['Run', D.runId], ['Finished', ago(D.generatedAt) || '--'], ['Run time', S.duration || '--'], ['Branch', D.branch || 'main'], ['Environment', D.env || 'Dev'], ['Suite', suiteName(D)]];
                $('#runMeta').innerHTML = meta.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
                ['#runLink', '#sideGh'].forEach(sel => { const link = $(sel); if (D.runUrl) { link.href = D.runUrl; link.hidden = false } else link.hidden = true });

                $$('.cnt').forEach(c => { c.hidden = false });
                $('#cnt-fx').textContent = S.failed; $('#cnt-fx').classList.toggle('bad', S.failed > 0); $('#cnt-fx').title = plural(S.failed, 'failed test');
                $('#cnt-fl').textContent = S.flaky; $('#cnt-fl').title = plural(S.flaky, 'flaky test');
                $('#cnt-at').textContent = S.total; $('#cnt-at').title = plural(S.total, 'UI test');
                $('#cnt-hi').textContent = windowRuns(0, false).length;

                const NAV_MAX = LIST_MAX;
                $('#compNav').innerHTML = state.comp.slice(0, NAV_MAX).map(c => `<button class="subitem" type="button" data-comp="${esc(c.name)}" title="${esc(c.name)}: ${c.passed} of ${c.total} passed">${svg('list')}<span class="lbl">${esc(c.name)}</span>${c.failed ? `<span class="cnt bad">${c.failed}</span>` : ''}</button>`).join('')
                    + (state.comp.length > NAV_MAX ? `<button class="subitem" type="button" data-comp-all>${svg('grid')}<span class="lbl">All ${state.comp.length} components</span></button>` : '');

                const notes = [];
                const hrs = D.generatedAt ? (Date.now() - new Date(D.generatedAt)) / 3600000 : 0;
                if (SAMPLE) notes.push(`Showing sample data from ${SAMPLE}/, not the latest CI run. Remove ?data=${SAMPLE} from the address to see real results.`);
                else if (hrs > Number(CFG.staleAfterHours)) notes.push(`The last run finished ${ago(D.generatedAt)}. Check that the scheduled workflow is still pushing results.`);
                const n = $('#notice'); n.hidden = !notes.length; n.textContent = notes.join(' ');
            }

            /* ── overview ── */
            function donutHtml(S, cls = '') {
                const tot = S.total || 0;
                if (!tot) return miniEmpty('No UI tests in this run.');
                const parts = [['passed', S.passed], ['failed', S.failed], ['flaky', S.flaky], ['skipped', S.skipped || 0]];
                const r = 60, C = 2 * Math.PI * r, shown = parts.filter(p => p[1] > 0);
                let off = 0;
                const segs = shown.map(([k, v]) => { const len = v / tot * C, gap = shown.length > 1 ? 2.5 : 0; const s = `<circle class="d-${k}" cx="80" cy="80" r="${r}" fill="none" stroke-width="18" stroke-dasharray="${Math.max(0.5, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 80 80)"/>`; off += len; return s }).join('');
                return `<svg class="donut ${cls}" viewBox="0 0 160 160" role="img" aria-label="${esc(r1(S.rate))}% passed: ${esc(shown.map(p => `${p[1]} ${p[0]}`).join(', '))}">
                    <circle class="d-track" cx="80" cy="80" r="${r}" fill="none" stroke-width="18"/>${segs}
                    <text class="big" x="80" y="82" text-anchor="middle">${r1(S.rate)}%</text><text class="sm" x="80" y="102" text-anchor="middle">${plural(tot, 'test')}</text>
                </svg>`;
            }

            function renderSummary() {
                const D = state.D, S = state.S;
                $('#headline').textContent = S.failed > 0
                    ? `${plural(S.failed, 'test')} need${S.failed === 1 ? 's' : ''} a look`
                    : S.flaky > 0 ? `Nothing failed. ${plural(S.flaky, 'test')} flaked.` : `All ${S.total} UI tests passed`;
                $('#hello').textContent = `${S.passed} of ${plural(S.total, 'UI test')} passed in ${D.runId}${S.failed ? `. The ${plural(S.failed, 'failure')} share ${plural(state.groups.length, 'error')}.` : '.'}`;
                $('#sumTop').hidden = false; $('#sumMain').hidden = false;

                const ok = S.rate >= TH, v = $('#verdict');
                v.className = 'verdict ' + (ok ? 'ok' : 'bad');
                $('#verdictG').textContent = ok ? '✓' : '✕';
                $('#verdictT').textContent = ok ? `Ready to deploy, at or above ${TH}%` : `Not ready to deploy, below ${TH}%`;

                const st = streakInfo(), el = $('#streak');
                let text = '';
                if (st) {
                    if (st.ok && st.n >= 2) text = `${st.n} runs in a row at or above ${TH}%`;
                    else if (st.ok && st.before) text = `Back above ${TH}% after ${plural(st.before, 'run')} below`;
                    else if (!st.ok && st.n >= 2) text = `Below ${TH}% for ${st.n} runs in a row`;
                    else if (!st.ok && st.before) text = `First run below ${TH}% after ${plural(st.before, 'run')} at or above it`;
                }
                el.hidden = !text;
                if (text) { el.className = 'streak ' + (st.ok ? 'ok' : 'bad'); el.innerHTML = `${svg(st.ok ? 'check' : 'alert')}<span>${esc(text)}</span>` }

                $('#donut').innerHTML = donutHtml(S);
                const p = prevRun(), curDur = S.duration ? secs(S.duration) : null;
                const row = (label, key, value, chg) => `<div><dt>${key ? sq(key, 'key') : ''}${label}</dt><dd>${chg}<b class="num">${esc(value)}</b></dd></div>`;
                $('#stats').innerHTML = '<dl class="stats">' + [
                    row('Pass rate', '', `${r1(S.rate)}%`, p ? delta(S.rate, p.rate, false, v => `${r1(v)} pts`, p.id) : ''),
                    row('Passed', 'passed', S.passed, ''),
                    row('Failed', 'failed', S.failed, p ? delta(S.failed, p.failed, true, v => v, p.id) : ''),
                    row('Flaky', 'flaky', S.flaky, p ? delta(S.flaky, p.flaky, true, v => v, p.id) : ''),
                    (S.skipped ? row('Skipped', 'skipped', S.skipped, '') : ''),
                    row('Run time', '', S.duration || '--', p && curDur != null ? delta(curDur, p.dur, true, fmtDur, p.id) : '')
                ].join('') + '</dl>' + (p ? `<p class="from">Changes are from ${esc(p.id)}</p>` : '');
            }

            function renderEnv() {
                const D = state.D, S = state.S;
                const items = [
                    ['Run', D.runId], ['Finished', `${fmtDate(D.generatedAt)}${D.generatedAt ? ' (' + ago(D.generatedAt) + ')' : ''}`],
                    ['Branch', D.branch || 'main'], ['Environment', D.env || 'Dev'], ['Suite', suiteName(D)],
                    ['Run time', S.duration || '--'],
                    ['UI tests', S.total]
                ];
                $('#envList').innerHTML = items.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')
                    + (D.runUrl ? `<dt>CI</dt><dd><a class="link" href="${esc(D.runUrl)}" target="_blank" rel="noopener">Open GitHub run</a></dd>` : '');
            }

            function renderErrors() {
                const g = state.groups.slice(0, 5);
                if (!g.length) { $('#wErrors').innerHTML = miniEmpty(state.S.flaky ? 'Nothing failed. Flaky tests are listed under Flaky tests.' : 'Nothing failed in this run.'); return }
                $('#wErrors').innerHTML = `<div class="wlist">${g.map((x, idx) => {
                    const comps = Array.from(new Set(x.tests.map(t => t.comp)));
                    return `<div class="wrow r-err">
                        <button class="err-btn" type="button" data-goto="fx"><code class="err-code" title="${esc(x.line)}">${esc(x.line)}</code><span class="t-sub clamp1">${esc(comps.length > 3 ? comps.slice(0, 3).join(', ') + ` and ${comps.length - 3} more` : comps.join(', '))}</span></button>
                        <span class="cnt bad" title="${plural(x.tests.length, 'failed test')}">${x.tests.length}</span>
                        <button class="btn btn-sm btn-term" type="button" data-rerun-group="${idx}" aria-label="Copy rerun command for ${plural(x.tests.length, 'test')} with this error">Rerun</button>
                    </div>`;
                }).join('')}</div>`;
            }

            function renderBoard() {
                const BOARD_MAX = LIST_MAX, comp = state.comp;
                const shown = state.boardAll ? comp : comp.slice(0, BOARD_MAX);
                $('#board').innerHTML = shown.map(c => {
                    const list = state.tests.filter(t => t.comp === c.name).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
                    const issues = [c.failed ? `${c.failed} failed` : '', c.flaky ? `${c.flaky} flaky` : '', c.skipped ? `${c.skipped} skipped` : ''].filter(Boolean).join(', ');
                    return `<div class="grow-row">
                        <button class="grow-label" type="button" data-comp="${esc(c.name)}" aria-label="${esc(c.name)}: ${c.passed} of ${c.total} passed${issues ? ', ' + issues : ''}. Show these tests"><b>${esc(c.name)}</b><span>${c.pct}%, ${c.passed} of ${c.total} passed</span></button>
                        <div class="squares">${list.map(t => `<button class="sq ${t.status}" type="button" tabindex="-1" data-t="${t._i}" data-tip="${esc(cleanName(t.name))}" data-tip-sub="${esc(STATUS[t.status] + (t.dur ? ' in ' + t.dur : ''))}" aria-label="${esc(STATUS[t.status] + ': ' + cleanName(t.name))}"></button>`).join('')}</div>
                    </div>`;
                }).join('') || miniEmpty('No UI tests in this run.');
                const more = $('#boardMore'), extra = comp.length - BOARD_MAX;
                more.hidden = extra <= 0;
                if (extra > 0) more.innerHTML = state.boardAll
                    ? `<button class="btn btn-sm" type="button" data-board-all="0">Show the ${BOARD_MAX} worst only</button>`
                    : `<button class="btn btn-sm" type="button" data-board-all="1">Show all ${comp.length} suites</button><span class="t-sub">${plural(extra, 'more suite')}, sorted worst first</span>`;
                $('#legendSkipped').hidden = !state.tests.some(t => t.status === 'skipped');
            }

            function renderOverview() {
                $$('.ov-part').forEach(el => { el.hidden = false });
                renderSummary(); renderEnv(); renderErrors(); renderBoard();
                requestAnimationFrame(renderOvTrend);
            }
            function renderOvTrend() {
                const rows = windowRuns(10, true);
                if (rows.length < 2) { $$('.th-lbl').forEach(x => { x.textContent = `${TH}% release threshold` }); $('#ovTrend').innerHTML = miniEmpty('The trend appears once at least 2 runs have UI-only numbers.'); return }
                stackChart($('#ovTrend'), rows);
            }

            /* 100% stacked bars: passed / flaky / failed share per run, with the threshold line */
            function stackChart(el, rows, emptyText) {
                $$('.th-lbl').forEach(x => { x.textContent = `${TH}% release threshold` });
                if (!rows.length) { el.innerHTML = miniEmpty(emptyText || 'History builds after each run.'); return }
                const W = Math.max(260, el.clientWidth || 600), H = el.clientHeight || 200;
                const L = 40, B = 26, T = 6, ph = H - B - T, pw = W - L;
                const slot = pw / rows.length, bw = Math.max(4, Math.min(28, slot * .62));
                const y = p => T + ph - p / 100 * ph;
                const g = [0, 50, 100].map(p => `<line class="grid" x1="${L}" x2="${W}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`).join('');
                const bars = rows.map(({ r, i }, k) => {
                    const tot = r.total || ((r.passed || 0) + (r.failed || 0) + (r.flaky || 0)) || 1;
                    const pp = (r.passed || 0) / tot * 100, fl = (r.flaky || 0) / tot * 100, fa = Math.max(0, 100 - pp - fl);
                    const x = L + k * slot + (slot - bw) / 2;
                    const seg = (from, size, cls) => size > 0 ? `<rect class="${cls}" x="${x.toFixed(1)}" y="${y(from + size).toFixed(1)}" width="${bw.toFixed(1)}" height="${(size / 100 * ph).toFixed(1)}" rx="2"/>` : '';
                    const mixed = r._ui ? '' : ' (all test types)';
                    return `<g class="hbar" data-run="${i}" tabindex="0" role="button" aria-label="Run ${esc(runIdOf(r))}, ${r1(r.rate)}% passed${mixed}">
                        <rect class="bg" x="${(L + k * slot).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ph}" rx="4"/>
                        ${seg(0, pp, 's-p')}${seg(pp, fl, 's-fl')}${seg(pp + fl, fa, 's-f')}
                        <title>${esc(runIdOf(r))}: ${r1(r.rate)}% passed, ${r.failed || 0} failed, ${r.flaky || 0} flaky${mixed}</title>
                    </g>`;
                }).join('');
                const lbl = (k, anchor) => `<text x="${(L + k * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(runIdOf(rows[k].r))}</text>`;
                const xl = rows.length > 1 ? lbl(0, 'start') + lbl(rows.length - 1, 'end') : lbl(0, 'middle');
                el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Share of passed, flaky and failed tests per run">${g}${bars}<line class="thl" x1="${L}" x2="${W}" y1="${y(TH)}" y2="${y(TH)}"/>${xl}</svg>`;
            }

            /* Line chart with round axis steps. rows: [{ r, i }], series: [{ get, line, fill, area, pt }] */
            function lineChart(el, rows, series, o) {
                if (!rows.length) { el.innerHTML = miniEmpty(o.empty || 'History builds after each run.'); return }
                const W = Math.max(240, Math.round(el.clientWidth || 600)), H = Math.round(el.clientHeight || 220);
                const vals = series.flatMap(s => rows.map(x => s.get(x.r))).filter(v => v != null && !isNaN(v));
                if (!vals.length) { el.innerHTML = miniEmpty(o.empty || 'No data for this chart yet.'); return }
                let yMin = 0, yMax, step;
                if (o.percent) { yMin = Math.max(0, Math.floor((Math.min(...vals, TH) - 5) / 10) * 10); yMax = 100; step = (yMax - yMin) > 50 ? 20 : 10 }
                else {
                    const top = Math.max(o.minMax || 1, ...vals) * 1.08, raw = top / 4;
                    if (o.seconds && raw >= 30) { const m = [0.5, 1, 2, 5, 10, 15, 30, 60].find(x => x * 60 >= raw) || Math.ceil(raw / 60); step = m * 60 }
                    else { const p10 = Math.pow(10, Math.floor(Math.log10(raw || 1))), fr = raw / p10; step = Math.max(1, (fr <= 1 ? 1 : fr <= 2 ? 2 : fr <= 5 ? 5 : 10) * p10) }
                    yMax = Math.ceil(top / step) * step;
                }
                const ticks = []; for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v);
                const L = Math.max(36, 12 + Math.max(...ticks.map(v => String(o.fmt(v)).length)) * 6.6), Rr = 12, T = 10, B = 24, pw = W - L - Rr, ph = H - T - B;
                const n = rows.length, x = k => L + (n === 1 ? pw / 2 : k / (n - 1) * pw), y = v => T + ph - (v - yMin) / ((yMax - yMin) || 1) * ph, f = v => v.toFixed(1);
                let g = ''; ticks.forEach(v => { g += `<line class="c-grid" x1="${f(L)}" x2="${W - Rr}" y1="${f(y(v))}" y2="${f(y(v))}"/><text x="${f(L - 8)}" y="${f(y(v) + 4)}" text-anchor="end">${esc(o.fmt(v))}</text>` });
                const slot = n === 1 ? pw : pw / (n - 1);
                const hits = rows.map((row, k) => { const x0 = Math.max(L, x(k) - slot / 2), x1 = Math.min(W - Rr, x(k) + slot / 2); return `<rect class="c-hit" x="${f(x0)}" y="${T}" width="${f(Math.max(1, x1 - x0))}" height="${ph}" data-run="${row.i}" tabindex="-1" data-tip="Run ${esc(runIdOf(row.r))}" data-tip-sub="${esc(o.tip(row.r))}"/>` }).join('');
                let lines = '';
                series.forEach(s => {
                    const pts = rows.map((row, k) => [x(k), s.get(row.r)]).filter(p => p[1] != null && !isNaN(p[1]));
                    if (!pts.length) return;
                    const d = 'M' + pts.map(p => `${f(p[0])} ${f(y(p[1]))}`).join(' L');
                    if (s.area) lines += `<path class="c-area ${s.fill}" d="${d} L${f(pts[pts.length - 1][0])} ${f(y(yMin))} L${f(pts[0][0])} ${f(y(yMin))} Z"/>`;
                    lines += `<path class="c-line ${s.line}" d="${d}"/>`;
                    if (n <= 40) lines += pts.map(p => `<circle class="c-pt ${s.pt ? s.pt(p[1]) : s.fill}" cx="${f(p[0])}" cy="${f(y(p[1]))}" r="${n > 20 ? 3 : 4}"/>`).join('');
                });
                const th = o.threshold != null ? `<line class="c-th" x1="${f(L)}" x2="${W - Rr}" y1="${f(y(o.threshold))}" y2="${f(y(o.threshold))}"/>` : '';
                const lbl = (k, a) => `<text x="${f(x(k))}" y="${H - 6}" text-anchor="${a}">${esc(runIdOf(rows[k].r))}</text>`;
                const xl = n > 1 ? lbl(0, 'start') + (n > 4 ? lbl(Math.floor((n - 1) / 2), 'middle') : '') + lbl(n - 1, 'end') : lbl(0, 'middle');
                el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">${g}${hits}${th}${lines}${xl}</svg>`;
            }

            /* ── graphs ── */
            function renderRange() { $$('#rangeSeg [data-range]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.range === state.range)) }
            function renderGraphs() {
                const S = state.S, D = state.D;
                renderRange();
                const rows = windowRuns(state.range, true), noUi = 'Trends appear once runs have a UI-only breakdown.';
                $$('.th-sub').forEach(x => { x.textContent = `UI pass rate per run. The dashed line is the ${TH}% release threshold.` });
                lineChart($('#gTrend'), rows, [{ get: r => Number(r.rate), line: 's-pass', fill: 'f-pass', area: true, pt: v => v < TH ? 'f-fail' : 'f-pass' }],
                    { percent: true, threshold: TH, fmt: v => `${Math.round(v)}%`, tip: r => `${r1(r.rate)}% passed, ${r.failed ?? 0} failed, ${r.flaky ?? 0} flaky`, label: 'UI pass rate over time', empty: noUi });
                lineChart($('#gFails'), rows, [{ get: r => r.failed ?? null, line: 's-fail', fill: 'f-fail' }, { get: r => r.flaky ?? null, line: 's-flk', fill: 'f-flk' }],
                    { minMax: 4, fmt: v => Math.round(v), tip: r => `${r.failed ?? 0} failed, ${r.flaky ?? 0} flaky`, label: 'Failed and flaky UI tests per run', empty: noUi });
                $('#gDurSub').textContent = 'Total workflow time';
                lineChart($('#gDur'), windowRuns(state.range, false), [{ get: r => r.duration ? secs(r.duration) : null, line: 's-acc', fill: 'f-acc', area: true }],
                    { minMax: 60, seconds: true, fmt: v => v >= 60 ? `${Math.round(v / 60)}m` : `${Math.round(v)}s`, tip: r => `Took ${r.duration || '--'}`, label: 'Run time per run' });

                $('#gStatusSub').textContent = `Run ${D.runId}, ${plural(S.total, 'UI test')}`;
                const parts = [['passed', S.passed], ['failed', S.failed], ['flaky', S.flaky], ['skipped', S.skipped || 0]].filter(p => p[0] !== 'skipped' || p[1]);
                $('#gStatus').innerHTML = S.total ? `<div class="donut-wrap">${donutHtml(S, 'lg')}<ul class="dl">${parts.map(([k, v]) => `<li>${sq(k, 'key')}<span>${STATUS[k]}</span><span class="n">${v}</span><span class="pc">${r1(v / S.total * 100)}%</span></li>`).join('')}</ul></div>` : miniEmpty('No UI tests in this run.');

                // duration distribution
                const buckets = [[0, 5, 'under 5s'], [5, 15, '5 to 15s'], [15, 30, '15 to 30s'], [30, 60, '30 to 60s'], [60, 120, '1 to 2m'], [120, Infinity, 'over 2m']];
                const counts = buckets.map(([a, b]) => state.tests.filter(t => t._s >= a && t._s < b).length);
                const mx = Math.max(1, ...counts);
                $('#gHisto').innerHTML = state.tests.some(t => t._s) ? `<div class="histo" role="img" aria-label="${esc(buckets.map((b, i) => `${counts[i]} ${b[2]}`).join(', '))}">${buckets.map((b, i) => `<div class="hcol"><span class="hn num">${counts[i]}</span><span class="hb" style="height:${Math.max(2, counts[i] / mx * 140)}px"></span><span class="hl">${b[2]}</span></div>`).join('')}</div>` : miniEmpty('No durations recorded.');

                // suite health heat table
                const hRuns = D.hRuns || [], comp = state.comp.slice(0, 10);
                const cols = Math.min(5, Math.max(0, ...comp.map(c => (c.hist || []).length)));
                if (!comp.length || !cols) { $('#gHeat').innerHTML = miniEmpty('Suite history builds after a few runs.'); }
                else {
                    const labels = hRuns.slice(-cols);
                    $('#gHeat').innerHTML = `<div class="heat-wrap"><table class="heat"><tr><th>Suite</th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr>${comp.map(c => {
                        const h = (c.hist || []).slice(-cols);
                        const cells = labels.map((l, j) => { let v = h[j - (cols - h.length)]; if (l === D.runId) v = c.pct; return v == null ? '<td><span class="cell t-sub">--</span></td>' : `<td><span class="cell ${cellCls(v)} num" title="${esc(l)}: ${v}%">${v}</span></td>` }).join('');
                        return `<tr class="click" data-comp="${esc(c.name)}" tabindex="0" role="button" aria-label="${esc(c.name)}, ${c.pct}% passed now. Show tests"><td>${esc(c.name)}</td>${cells}</tr>`;
                    }).join('')}</table></div>`;
                }
            }

            /* ── categories ── */
            function groupCard(g, kind, limit, moreView = 'fx') {
                const n = g.tests.length;
                const comps = Array.from(new Set(g.tests.map(t => t.comp)));
                const shown = limit ? g.tests.slice(0, limit) : g.tests;
                const more = n - shown.length;
                const title = n > 1 ? `${n} tests share this error` : '1 test hit this error';
                return `<article class="egroup is-${kind}">
                    <div class="eg-head">
                        <div class="eg-top"><h3>${title}</h3><span class="eg-comps" title="${esc(comps.join(', '))}">${esc(comps.length > 4 ? comps.slice(0, 4).join(', ') + ` and ${comps.length - 4} more` : comps.join(', '))}</span></div>
                        <pre class="term">${g.none ? `<span class="dim">${esc(g.line)}</span>` : esc(g.line)}</pre>
                    </div>
                    <div class="eg-tests">${shown.map(t => `<div class="etest">
                        <div><div class="etest-name">${esc(cleanName(t.name))}</div><div class="etest-sub">${esc(t.comp)}${t.failedStep ? ': ' + esc(t.failedStep) : ''}</div></div>
                        <div class="etest-actions">
                            <button class="btn btn-sm btn-term" type="button" data-rerun="${t._i}">Rerun</button>
                            <button class="btn btn-sm" type="button" data-t="${t._i}">Details</button>
                        </div>
                    </div>`).join('')}
                    ${more > 0 ? `<div class="etest"><span class="t-sub">${plural(more, 'more test')} with this error</span><div class="etest-actions"><button class="btn btn-sm" type="button" data-goto="${moreView}">See all</button></div></div>` : ''}
                    </div>
                </article>`;
            }
            function renderFix() {
                const D = state.D, failed = state.tests.filter(t => t.status === 'failed'), groups = state.groups;
                $('#fxSub').textContent = failed.length ? `${plural(failed.length, 'failed test')} in ${plural(groups.length, 'category')}, grouped by shared error, biggest first. Fixing the top one clears the most failures.` : `Nothing failed in ${D.runId}.`;
                $('#rerunAll').hidden = !failed.length;
                $('#rerunAll').textContent = `Rerun all ${failed.length} failed`;
                $('#fxGroups').innerHTML = groups.length ? groups.map(g => groupCard(g, 'failed')).join('') : emptyBox('party', 'Nothing to fix', `Every UI test passed in ${esc(D.runId)}.`);
            }
            function renderFlaky() {
                const flakyNow = state.tests.filter(t => t.status === 'flaky');
                $('#rerunFlaky').hidden = !flakyNow.length;
                $('#rerunFlaky').textContent = `Rerun ${flakyNow.length} flaky`;
                const nowHtml = flakyNow.length ? errorGroups(flakyNow).map(g => groupCard(g, 'flaky', 0, 'fl')).join('') : '';
                const hist = state.flaky;
                const histHtml = hist.length ? `<div class="rows" style="margin-top:${flakyNow.length ? 18 : 0}px">
                    <div class="row row-head r-flk"><span>Flaked in the last 10 runs</span><span>Suite</span><span>Flake rate</span><span class="t-right">Runs</span></div>
                    ${hist.map(f => {
                    const t = state.tests.find(x => x.name === f.name);
                    const tag = t ? `button type="button" data-t="${t._i}"` : 'div';
                    return `<${tag} class="row r-flk"><span class="c-name t-name">${esc(cleanName(f.name))}</span><span class="t-sub">${esc(f.comp || '')}</span><span class="rate-cell">${bar(Number(f.pct) || 0, 'flk')}</span><span class="t-sub t-right num">${esc(f.label || f.pct + '%')}</span></${t ? 'button' : 'div'}>`;
                }).join('')}</div>` : '';
                $('#flkList').innerHTML = (nowHtml + histHtml) || emptyBox('zap', 'No flaky tests', 'Nothing flaked this run or in the last 10 runs.');
            }

            /* ── suites: tree + details ── */
            function renderSeg(el, counts, active, attr) {
                el.innerHTML = ['all', 'failed', 'flaky', 'passed'].map(s => `<button type="button" ${attr}="${s}" aria-pressed="${s === active}">${s === 'all' ? 'All' : STATUS[s]}<span class="n">${counts[s]}</span></button>`).join('');
            }
            function countsOf(list) { return { all: list.length, failed: list.filter(t => t.status === 'failed').length, flaky: list.filter(t => t.status === 'flaky').length, passed: list.filter(t => t.status === 'passed').length } }
            function matchQ(t, q) { if (!q) return true; return [t.name, t.comp, t.failedStep, pmwOf(t.name)].some(v => String(v || '').toLowerCase().includes(q)) }
            function suiteOpen(name, c) {
                const f = state.at;
                if (state.su.toggled.has(name)) return state.su.toggled.get(name);
                if (state.su.allOpen != null) return state.su.allOpen;
                return !!(f.q || f.status !== 'all' || f.comp !== 'all' || c.failed + c.flaky > 0);
            }

            function renderAll() {
                const f = state.at, D = state.D;
                const names = state.comp.map(c => c.name);
                if (f.comp !== 'all' && !names.includes(f.comp)) f.comp = 'all';
                $('#atComp').innerHTML = `<option value="all">All suites</option>` + names.slice().sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}"${n === f.comp ? ' selected' : ''}>${esc(n)}</option>`).join('');
                $('#atSort').value = f.sort;
                const scoped = state.tests.filter(t => (f.comp === 'all' || t.comp === f.comp) && matchQ(t, f.q));
                renderSeg($('#atStatus'), countsOf(scoped), f.status, 'data-at');
                const rows = scoped.filter(t => f.status === 'all' || t.status === f.status);
                $('#atSub').textContent = f.q ? `${plural(rows.length, 'result')} for “${$('#atSearch').value.trim()}” in ${D.runId}` : `${plural(state.tests.length, 'UI test')} in ${plural(state.comp.length, 'suite')}, worst suite first. Select a test to see its details.`;
                $('#expandAll').hidden = f.sort !== 'group';
                if (!rows.length) { $('#atList').innerHTML = emptyBox('search', 'No tests match', 'Try a different search or filter.', '<br><button class="btn" type="button" data-clear-at>Clear filters</button>'); renderDetail(rows); return }

                if (f.sort === 'group') {
                    const byComp = new Map(); rows.forEach(t => { if (!byComp.has(t.comp)) byComp.set(t.comp, []); byComp.get(t.comp).push(t) });
                    let anyClosed = false; const shownOrder = [];
                    $('#atList').innerHTML = state.comp.filter(c => byComp.has(c.name)).map(c => {
                        const list = byComp.get(c.name).sort((a, b) => ORDER[a.status] - ORDER[b.status] || cleanName(a.name).localeCompare(cleanName(b.name)));
                        shownOrder.push(...list);
                        const open = suiteOpen(c.name, c); if (!open) anyClosed = true;
                        const tot = c.total || 1, w = k => (c[k] / tot * 100).toFixed(1);
                        return `<div class="suite">
                            <button class="suite-head" type="button" data-suite="${esc(c.name)}" aria-expanded="${open}">
                                <span class="suite-name">${esc(c.name)}</span>
                                <span class="sbar" aria-hidden="true"><i class="p" style="width:${w('passed')}%"></i><i class="k" style="width:${w('flaky')}%"></i><i class="f" style="width:${w('failed')}%"></i><i class="s" style="width:${w('skipped')}%"></i></span>
                                <span class="t-sub num">${c.passed} of ${c.total}</span>
                            </button>
                            <div class="suite-tests"${open ? '' : ' hidden'}>${list.map(treeRow).join('')}</div>
                        </div>`;
                    }).join('');
                    $('#expandAll').textContent = anyClosed ? 'Expand all' : 'Collapse all';
                    renderDetail(shownOrder); return;
                } else {
                    const sorters = { slow: (a, b) => b._s - a._s, name: (a, b) => cleanName(a.name).localeCompare(cleanName(b.name)) };
                    const list = rows.slice().sort(sorters[f.sort]);
                    var flatOrder = list;
                    $('#atList').innerHTML = `<div class="rows">
                        <div class="row row-head r-test"><span>Status</span><span>Test</span><span>Suite</span><span class="t-right">Duration</span></div>
                        ${list.map(t => {
                        const pmw = pmwOf(t.name), err = t.status !== 'passed' && (t.err || t.fullErr);
                        return `<button class="row r-test" type="button" data-t="${t._i}"${state.su.sel === t._i ? ' aria-current="true"' : ''}>
                            <span>${chip(t.status)}</span>
                            <span class="c-name"><span class="t-name">${esc(cleanName(t.name))}</span>${pmw ? `<span class="t-sub">${esc(pmw)}</span>` : ''}${err ? `<span class="err-line">${esc(firstLine(err))}</span>` : ''}</span>
                            <span class="t-sub">${esc(t.comp)}</span>
                            <span class="t-sub t-right num">${esc(t.dur || '')}</span>
                        </button>`;
                    }).join('')}</div>`;
                    renderDetail(flatOrder); return;
                }
            }
            function treeRow(t) {
                const pmw = pmwOf(t.name), err = t.status !== 'passed' && (t.err || t.fullErr);
                return `<button class="row r-tree" type="button" data-t="${t._i}" aria-label="${esc(STATUS[t.status] + ': ' + cleanName(t.name))}"${state.su.sel === t._i ? ' aria-current="true"' : ''}>
                    ${sq(t.status, 'key')}
                    <span class="c-name"><span class="t-name">${esc(cleanName(t.name))}</span>${pmw ? `<span class="t-sub">${esc(pmw)}</span>` : ''}${err ? `<span class="err-line">${esc(firstLine(err))}</span>` : ''}</span>
                    <span class="t-sub t-right num">${esc(t.dur || '')}</span>
                </button>`;
            }
            function renderDetail(rows) {
                const pane = $('#atDetail');
                if (isNarrow()) { pane.innerHTML = ''; return }
                rows = rows || state.tests;
                if (state.su.sel == null || !rows.some(t => t._i === state.su.sel)) {
                    const pick = rows.find(t => t.status === 'failed') || rows.find(t => t.status === 'flaky') || rows[0];
                    state.su.sel = pick ? pick._i : null;
                    $$('#atList [data-t]').forEach(b => { if (+b.dataset.t === state.su.sel) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current') });
                }
                const t = state.tests[state.su.sel];
                if (!t) { pane.innerHTML = miniEmpty('Select a test to see its details.'); return }
                const d = testDetail(t, true);
                pane.innerHTML = `<div class="detail-head"><h2>${esc(d.title)}</h2></div><div class="detail-body">${d.body}</div>${d.foot ? `<div class="detail-foot">${d.foot}</div>` : ''}`;
            }
            function selectTest(i) {
                state.su.sel = i;
                $$('#atList [data-t]').forEach(b => { if (+b.dataset.t === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current') });
                renderDetail();
            }

            /* ── history ── */
            function renderHistory() {
                const rows = windowRuns(0, false);
                $('#hiSub').textContent = rows.length ? `${plural(rows.length, 'run')} recorded${rows.some(x => !x.r._ui) ? '. Runs tagged All test types have no UI-only numbers' : ''}. The chart shows the last ${Math.min(rows.length, 30)}.` : '';
                renderHistChart();
                if (!rows.length) { $('#hiList').innerHTML = emptyBox('clock', 'No history yet', 'Each scheduled run adds a row here.'); return }
                $('#hiList').innerHTML = `<div class="tbl-wrap"><table>
                    <thead><tr><th>Run</th><th>Finished</th><th>Pass rate</th><th class="n">Passed</th><th class="n">Failed</th><th class="n">Flaky</th><th>Run time</th><th>Branch</th></tr></thead>
                    <tbody>${rows.slice().reverse().map(({ r, i }) => {
                    const rate = r1(r.rate);
                    return `<tr class="click" data-run="${i}" tabindex="0" role="button" aria-label="Run ${esc(runIdOf(r))}, ${rate}% passed">
                        <td><b>${esc(runIdOf(r))}</b>${r._ui ? '' : '<span class="tag">All test types</span>'}</td><td class="t-sub">${esc(ago(r.generatedAt))}</td>
                        <td><span class="rate-mini">${bar(rate)}<b class="num">${rate}%</b></span></td>
                        <td class="n">${r.passed ?? 0}</td><td class="n">${r.failed ?? 0}</td><td class="n">${r.flaky ?? 0}</td>
                        <td class="t-sub">${esc(r.duration || '--')}</td><td class="t-sub">${esc(r.branch || 'main')}</td>
                    </tr>`;
                }).join('')}</tbody></table></div>`;
            }
            function renderHistChart() { stackChart($('#hChart'), windowRuns(30, false)) }

            /* ── coverage ── */
            function renderCoverage() {
                const f = state.cv, base = state.tests;
                $('#cvTotal').textContent = base.length;
                $('#cvReq').textContent = base.filter(t => pmwOf(t.name)).length;
                $('#cvPass').textContent = base.filter(t => t.status === 'passed').length;
                $('#cvFail').textContent = base.filter(t => t.status === 'failed').length;
                $('#cvSub').textContent = `Every UI scenario in ${state.D.runId}, grouped by suite, with its PMW requirement ID.`;
                const scoped = base.filter(t => matchQ(t, f.q));
                renderSeg($('#cvStatus'), countsOf(scoped), f.status, 'data-cv');
                const rows = scoped.filter(t => f.status === 'all' || t.status === f.status);
                if (!rows.length) { $('#cvList').innerHTML = emptyBox('search', 'No scenarios match', 'Try a different search or filter.', '<br><button class="btn" type="button" data-clear-cv>Clear filters</button>'); return }
                const groups = new Map();
                rows.forEach(t => { if (!groups.has(t.comp)) groups.set(t.comp, []); groups.get(t.comp).push(t) });
                $('#cvList').innerHTML = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([comp, list]) => {
                    const pass = list.filter(t => t.status === 'passed').length, pct = Math.round(pass / list.length * 100);
                    return `<details class="group" data-group="${esc(comp)}"${f.closed.has(comp) ? '' : ' open'}>
                        <summary><h3>${esc(comp)}<span>${pass} of ${list.length} passed</span></h3><span class="rate-cell">${bar(pct)}<b class="num">${pct}%</b></span></summary>
                        <div class="rows">
                            <div class="row row-head r-cov"><span>Requirement</span><span>Scenario</span><span>Status</span><span class="t-right">Duration</span></div>
                            ${list.sort((a, b) => ORDER[a.status] - ORDER[b.status]).map(t => {
                        const id = pmwOf(t.name);
                        return `<button class="row r-cov" type="button" data-t="${t._i}">
                                <span>${id ? `<span class="pmw">${esc(id)}</span>` : '<span class="pmw none">No ID</span>'}</span>
                                <span class="c-name t-name">${esc(cleanName(t.name))}</span>
                                <span>${chip(t.status)}</span>
                                <span class="t-sub t-right num">${esc(t.dur || '')}</span>
                            </button>`;
                    }).join('')}
                        </div>
                    </details>`;
                }).join('');
            }

            /* ── requirements ── */
            function renderRequirements() {
                const cov = state.cov, wrap = $('#rqList');
                if (!cov || !cov.requirements) { $('#rqSub').textContent = ''; wrap.innerHTML = emptyBox('file', 'No requirement data yet', 'It generates on the next CI run.'); return }
                const s = cov.summary || {};
                $('#rqTotal').textContent = s.totalRequirements ?? '--';
                $('#rqCovered').textContent = s.withAutomatedCoverage ?? '--';
                $('#rqGap').textContent = s.withoutAutomatedCoverage ?? '--';
                $('#rqScen').textContent = s.totalAutomatedScenarios ?? '--';
                $('#rqSub').textContent = `${s.withAutomatedCoverage} of ${s.totalRequirements} areas have automated tests${cov.generatedAt ? '. Updated ' + ago(cov.generatedAt) : ''}.`;
                const notMapped = cov.notMapped && cov.notMapped.scenarioCount > 0
                    ? `<p class="t-sub" style="margin-top:12px">${plural(cov.notMapped.scenarioCount, 'scenario')} intentionally not mapped to a requirement (${esc((cov.notMapped.files || []).join(', '))}).</p>` : '';
                wrap.innerHTML = `<div class="tbl-wrap"><table>
                    <thead><tr><th>Requirement area</th><th>Status</th><th class="n">Scenarios</th><th class="n">Files</th></tr></thead>
                    <tbody>${cov.requirements.map(r => `<tr>
                        <td><b>${esc(r.id)}</b>${r.hasPrd ? '' : ' <span class="t-sub">No PRD linked</span>'}</td>
                        <td>${r.hasAutomatedCoverage ? chip('passed', 'Covered') : chip('flaky', 'Not yet automated')}</td>
                        <td class="n">${r.scenarioCount ?? 0}</td>
                        <td class="n">${r.files && r.files.length ? r.files.length : '--'}</td>
                    </tr>`).join('')}</tbody></table></div>${notMapped}`;
            }

            /* ── modal + test details ── */
            let lastFocus = null, modalTest = null;
            function openModal(title, sub, body, foot) {
                lastFocus = document.activeElement;
                $('#modalTitle').textContent = title;
                $('#modalSub').textContent = sub || ''; $('#modalSub').hidden = !sub;
                $('#modalBody').innerHTML = body;
                $('#modalFoot').innerHTML = foot || ''; $('#modalFoot').hidden = !foot;
                $('#modalBg').classList.add('open');
                document.body.style.overflow = 'hidden';
                $('#modal').scrollTop = 0;
                $('#modalClose').focus();
            }
            function closeModal() {
                if (!$('#modalBg').classList.contains('open')) return;
                $('#modalBg').classList.remove('open');
                document.body.style.overflow = '';
                if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
            }
            function testDetail(t, inPane) {
                const D = state.D, pmw = pmwOf(t.name), err = t.fullErr || t.err;
                const body = `
                    ${chip(t.status, STATUS[t.status] + (t.dur ? ' in ' + esc(t.dur) : ''))}
                    <dl class="kv">
                        <div><dt>Suite</dt><dd>${esc(t.comp)}</dd></div>
                        <div><dt>Requirement</dt><dd>${pmw ? esc(pmw) : 'Not linked'}</dd></div>
                        <div><dt>Run</dt><dd>${esc(D.runId)}</dd></div>
                        <div><dt>Environment</dt><dd>${esc(D.env || 'Dev')}</dd></div>
                    </dl>
                    <p class="sec-label">Run it locally</p>
                    <div class="cmd"><code tabindex="0" aria-label="Rerun command">${esc(rerunCmd([t]))}</code><button type="button" data-copy-cmd="${t._i}">Copy</button></div>
                    ${t.failedStep ? `<p class="sec-label">Failed step</p><div class="step">${esc(t.failedStep)}</div>` : ''}
                    ${err ? `<p class="sec-label">${t.status === 'flaky' ? 'What happened on the failed attempt' : 'Error'}</p><pre class="term">${esc(err)}</pre>` : ''}
                    ${!err && t.status === 'passed' ? '<p class="sec-label">No errors recorded for this test.</p>' : ''}`;
                const gh = D.runUrl ? `<a class="btn" href="${esc(D.runUrl)}" target="_blank" rel="noopener">Open GitHub run</a>` : '';
                const bug = (t.status === 'failed' || t.status === 'flaky') ? (inPane ? `<button class="btn btn-primary" type="button" data-copy-bug="${t._i}">Copy bug report</button>` : `<button class="btn btn-primary" type="button" id="copyBug">Copy bug report</button>`) : '';
                return { title: cleanName(t.name), body, foot: bug + gh };
            }
            function openTest(t) {
                if (!t) return;
                modalTest = t;
                const d = testDetail(t, false);
                openModal(d.title, null, d.body, d.foot);
            }
            function bugText(t) {
                const D = state.D, pmw = pmwOf(t.name);
                return [
                    `[BUG] ${pmw ? pmw + ': ' : ''}${cleanName(t.name)}`, '',
                    `Environment:  ${D.env || 'Dev'}`,
                    `Suite:        ${t.comp}`,
                    `Run:          ${D.runId}`,
                    `Duration:     ${t.dur || '--'}`,
                    `Status:       ${STATUS[t.status]}`,
                    t.failedStep ? `Failed step:  ${t.failedStep}` : null, '',
                    'Error:', t.fullErr || t.err || 'No error details recorded', '',
                    'Run locally:', rerunCmd([t]), '',
                    `CI run: ${D.runUrl || '--'}`
                ].filter(l => l !== null).join('\n');
            }

            function openRun(raw) {
                const D = state.D;
                const fallbackUrl = raw && raw.runUrl;
                const isCurrent = !raw || runIdOf(raw) === D.runId;
                let id, rate, total, failed, flaky, when, branch, suite, env, url, comps, ui = true;
                if (!isCurrent) {
                    const r = runView(raw); ui = r._ui;
                    id = runIdOf(r); rate = r1(r.rate); total = r.total ?? 0; failed = r.failed ?? 0; flaky = r.flaky ?? 0;
                    when = r.generatedAt; branch = r.branch; suite = suiteName(r); env = r.env; url = r.runUrl;
                    // compRates mixes UI and API suites; drop the ones that are API in the current run
                    comps = r.compRates ? Object.entries(r.compRates).filter(([name]) => !state.apiNames.has(name)).map(([name, c]) => ({ name, pct: r1(c.rate), passed: c.passed ?? 0, total: c.total ?? 0, failed: c.failed ?? 0 })) : [];
                } else {
                    const S = state.S; id = D.runId; rate = r1(S.rate); total = S.total; failed = S.failed; flaky = S.flaky;
                    when = D.generatedAt; branch = D.branch; suite = suiteName(D); env = D.env; url = D.runUrl || fallbackUrl;
                    comps = state.comp.map(c => ({ name: c.name, pct: c.pct, passed: c.passed, total: c.total, failed: c.failed }));
                }
                comps.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));
                const body = `
                    <div class="figs">
                        <div class="fig"><b class="num">${rate}%</b><span>Pass rate</span></div>
                        <div class="fig"><b class="num">${total}</b><span>Tests</span></div>
                        <div class="fig"><b class="num">${failed}</b><span>Failed</span></div>
                        <div class="fig"><b class="num">${flaky}</b><span>Flaky</span></div>
                    </div>
                    ${comps.length ? `<div class="tbl-wrap"><table>
                        <thead><tr><th>Suite</th><th>Pass rate</th><th class="n">Passed</th><th class="n">Failed</th></tr></thead>
                        <tbody>${comps.map(c => `<tr><td><b>${esc(c.name)}</b></td><td><span class="rate-mini">${bar(c.pct)}<b class="num">${c.pct}%</b></span></td><td class="n">${c.passed} of ${c.total}</td><td class="n">${c.failed}</td></tr>`).join('')}</tbody>
                    </table></div>` : emptyBox('grid', 'No suite breakdown', 'This run did not save one.')}
                    ${ui ? '' : '<p class="t-sub" style="margin-top:12px">This run has no UI-only numbers, so these include every test type.</p>'}`;
                const sub = [when ? 'Finished ' + ago(when) : '', branch ? 'branch ' + branch : '', suite || '', env || ''].filter(Boolean).join(', ');
                const foot = url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Open GitHub run</a>` : '';
                openModal(`Run ${id}${isCurrent ? ' (latest)' : ''}`, sub, body, foot);
            }

            function openHelp() {
                openModal('How to read this report', null, `<ul class="help-list">
                    <li>${svg('home')}<span><b>Overview works like an Allure report.</b><span class="t-sub">The donut is the UI pass rate for the latest run. Trend shows recent runs, Categories groups failures by error, and Suites shows every test.</span></span></li>
                    <li>${sq('passed', 'key')}<span><b>Each square is one test.</b><span class="t-sub">Hover a square for its name, click it for the error and a rerun command. Failed tests carry an ✕, flaky tests a dot.</span></span></li>
                    <li>${svg('list')}<span><b>Suites is the test tree.</b><span class="t-sub">Pick a test on the left and its details open on the right, with the failed step, error and rerun command.</span></span></li>
                    <li>${svg('alert')}<span><b>Categories groups failures that share an error.</b><span class="t-sub">The biggest group is first. Fixing it usually clears several failures at once.</span></span></li>
                    <li>${svg('external')}<span><b>Rerun copies a ready-to-paste command.</b><span class="t-sub">It runs only that scenario with <code>${esc(RERUN_BASE)}</code> and works in cmd, PowerShell and bash.</span></span></li>
                    <li>${svg('check')}<span><b>Ready to deploy means at least ${TH}% of UI tests passed.</b><span class="t-sub">This report counts UI tests only, so its numbers can differ from the GitHub Actions summary.</span></span></li>
                    <li><kbd>/</kbd><span><b>Press / to search.</b><span class="t-sub">Esc closes any panel.</span></span></li>
                </ul>`, '');
            }

            /* ── tooltip ── */
            let tipShownAt = 0;
            function showTip(el) {
                const tip = $('#tip');
                tip.innerHTML = `${esc(el.dataset.tip)}${el.dataset.tipSub ? `<small>${esc(el.dataset.tipSub)}</small>` : ''}`;
                tip.classList.add('show');
                const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
                let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 10;
                x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
                if (y < 8) y = r.bottom + 10;
                tip.style.left = x + 'px'; tip.style.top = y + 'px';
                tipShownAt = Date.now();
            }
            function hideTip() { $('#tip').classList.remove('show') }

            /* ── drawer (phones) ── */
            function setDrawer(open) {
                $('#side').classList.toggle('open', open);
                $('#scrim').hidden = !open;
                $('#menuBtn').setAttribute('aria-expanded', open);
                if (open) { const cur = $('#nav [aria-current="page"]'); if (cur) cur.focus() }
            }

            /* ── views ── */
            const HASH = { ov: 'overview', fx: 'categories', at: 'suites', gr: 'graphs', fl: 'flaky', hi: 'history', cv: 'coverage', rq: 'requirements' };
            const ALIAS = { fix: 'fx', tests: 'at', components: 'at' };   // links from earlier versions keep working
            function setView(v, push) {
                if (!HASH[v]) v = 'ov';
                const changed = state.view !== v;
                state.view = v;
                $$('#nav [data-view]').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current') });
                $$('.view').forEach(el => { el.hidden = el.id !== 'view-' + v });
                const notice = $('#notice');
                if (v === 'ov') $('#view-ov .page-head').after(notice); else $('.main').prepend(notice);
                try { if (push && changed) history.pushState(null, '', '#' + HASH[v]); else history.replaceState(null, '', '#' + HASH[v]) } catch (e) { }
                if (state.D) {
                    if (v === 'hi') renderHistChart();
                    if (v === 'gr') requestAnimationFrame(renderGraphs);
                    if (v === 'ov' && changed) requestAnimationFrame(renderOvTrend);
                    if (v === 'at') renderDetail();
                }
                hideTip();
                if (isPhone()) setDrawer(false);
                if (changed) window.scrollTo({ top: 0, behavior: 'auto' });
            }
            function showTests(patch) {
                state.at = Object.assign({ status: 'all', comp: 'all', q: '', sort: state.at.sort }, patch);
                state.su.toggled.clear(); state.su.allOpen = null;
                $('#atSearch').value = state.at.q;
                renderAll(); setView('at', true);
            }
            const viewFromHash = () => { const h = location.hash.replace('#', ''); return Object.keys(HASH).find(k => HASH[k] === h) || ALIAS[h] || 'ov' };
            window.addEventListener('popstate', () => { closeModal(); setView(viewFromHash()) });

            /* ── events ── */
            document.addEventListener('click', e => {
                const tg = e.target.closest('[data-toggle]'); if (tg) { const el = $('#' + tg.dataset.toggle); const open = tg.getAttribute('aria-expanded') !== 'true'; tg.setAttribute('aria-expanded', open); el.hidden = !open; return }
                const nav = e.target.closest('#nav [data-view]'); if (nav) { setView(nav.dataset.view, true); return }
                const vl = e.target.closest('[data-view-link]'); if (vl) { e.preventDefault(); setView(vl.dataset.viewLink, true); return }
                if (e.target.closest('#menuBtn')) { setDrawer(!$('#side').classList.contains('open')); return }
                if (e.target === $('#scrim')) { setDrawer(false); return }
                if (e.target.closest('#collapseBtn')) { const on = document.documentElement.classList.toggle('side-collapsed'); try { localStorage.setItem('qa-side-collapsed', on ? '1' : '0') } catch (err) { } $('#collapseBtn').setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar'); return }
                const ts = e.target.closest('[data-theme-set]'); if (ts) { setTheme(ts.dataset.themeSet); return }
                if (e.target.closest('[data-mobile-theme]')) { setTheme(effTheme() === 'dark' ? 'light' : 'dark'); return }
                if (e.target.closest('[data-help]')) { if (isPhone()) setDrawer(false); openHelp(); return }
                const ba = e.target.closest('[data-board-all]'); if (ba) { state.boardAll = ba.dataset.boardAll === '1'; renderBoard(); return }
                const rg = e.target.closest('[data-range]'); if (rg) { state.range = +rg.dataset.range; try { localStorage.setItem('qa-dash-range', state.range) } catch (err) { } renderGraphs(); return }
                if (e.target.closest('#reloadBtn')) { location.reload(); return }
                if (e.target.closest('#modalClose') || e.target === $('#modalBg')) { closeModal(); return }
                if (e.target.closest('#copyBug')) { copy(bugText(modalTest), 'Bug report copied'); return }
                const cb = e.target.closest('[data-copy-bug]'); if (cb) { copy(bugText(state.tests[+cb.dataset.copyBug]), 'Bug report copied'); return }
                const cc = e.target.closest('[data-copy-cmd]'); if (cc) { copy(rerunCmd([state.tests[+cc.dataset.copyCmd]]), 'Rerun command copied'); return }
                const rr = e.target.closest('[data-rerun]'); if (rr) { copy(rerunCmd([state.tests[+rr.dataset.rerun]]), 'Rerun command copied. Paste it in your terminal.'); return }
                const rgp = e.target.closest('[data-rerun-group]'); if (rgp) { const g = state.groups[+rgp.dataset.rerunGroup]; if (g) copyBatch(g.tests, 'failed'); return }
                if (e.target.closest('#rerunAll')) { copyBatch(state.tests.filter(t => t.status === 'failed'), 'failed'); return }
                if (e.target.closest('#rerunFlaky')) { copyBatch(state.tests.filter(t => t.status === 'flaky'), 'flaky'); return }
                const sh = e.target.closest('[data-suite]'); if (sh) { const name = sh.dataset.suite, open = sh.getAttribute('aria-expanded') !== 'true'; state.su.toggled.set(name, open); sh.setAttribute('aria-expanded', open); sh.nextElementSibling.hidden = !open; $('#expandAll').textContent = $$('#atList .suite-head[aria-expanded="false"]').length ? 'Expand all' : 'Collapse all'; return }
                if (e.target.closest('#expandAll')) { const anyClosed = $$('#atList .suite-head[aria-expanded="false"]').length > 0; state.su.toggled.clear(); state.su.allOpen = anyClosed; renderAll(); return }
                const t = e.target.closest('[data-t]'); if (t) { hideTip(); const i = +t.dataset.t; if (t.closest('#atList') && !isNarrow()) selectTest(i); else openTest(state.tests[i]); return }
                if (e.target.closest('[data-comp-all]')) { showTests({}); return }
                const c = e.target.closest('[data-comp]'); if (c) { showTests({ comp: c.dataset.comp }); return }
                const go = e.target.closest('[data-goto]'); if (go) { setView(go.dataset.goto, true); return }
                const at = e.target.closest('[data-at]'); if (at) { state.at.status = at.dataset.at; renderAll(); return }
                const cv = e.target.closest('[data-cv]'); if (cv) { state.cv.status = cv.dataset.cv; renderCoverage(); return }
                if (e.target.closest('[data-clear-at]')) { showTests({}); return }
                if (e.target.closest('[data-clear-cv]')) { state.cv.status = 'all'; state.cv.q = ''; $('#cvSearch').value = ''; renderCoverage(); return }
                const run = e.target.closest('[data-run]'); if (run) { openRun(state.runs[+run.dataset.run]); return }
            });

            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') { if ($('#modalBg').classList.contains('open')) closeModal(); else if ($('#side').classList.contains('open')) { setDrawer(false); $('#menuBtn').focus() } else if (document.activeElement === $('#atSearch')) $('#atSearch').blur(); hideTip(); return }
                const open = $('#modalBg').classList.contains('open');
                if (open && e.key === 'Tab') {
                    const f = $$('#modal button, #modal a[href]').filter(x => !x.hidden && x.offsetParent !== null);
                    if (!f.length) return;
                    const first = f[0], last = f[f.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
                    return;
                }
                const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
                if (e.key === '/' && !typing && !open) { e.preventDefault(); (state.view === 'cv' ? $('#cvSearch') : $('#atSearch')).focus(); return }
                if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]:not(button)')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })) }
            });

            ['mouseover', 'focusin'].forEach(ev => document.addEventListener(ev, e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el) }));
            ['mouseout', 'focusout'].forEach(ev => document.addEventListener(ev, e => { if (e.target.closest && e.target.closest('[data-tip]')) hideTip() }));
            window.addEventListener('scroll', () => { if (Date.now() - tipShownAt > 250) hideTip() }, { passive: true });

            document.addEventListener('toggle', e => {
                const g = e.target.closest && e.target.closest('details[data-group]'); if (!g) return;
                if (g.open) state.cv.closed.delete(g.dataset.group); else state.cv.closed.add(g.dataset.group);
            }, true);

            let qTimer;
            $('#atSearch').addEventListener('input', e => {
                clearTimeout(qTimer);
                qTimer = setTimeout(() => {
                    if (!state.D) return;
                    state.at.q = e.target.value.toLowerCase().trim();
                    renderAll();
                    if (state.at.q && state.view !== 'at') setView('at', true);
                }, 120);
            });
            $('#cvSearch').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.cv.q = e.target.value.toLowerCase().trim(); renderCoverage() }, 120) });
            $('#atComp').addEventListener('change', e => { state.at.comp = e.target.value; renderAll() });
            $('#atSort').addEventListener('change', e => { state.at.sort = e.target.value; renderAll() });

            /* theme */
            const effTheme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            function syncTheme() {
                const t = effTheme();
                $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeSet === t));
                const mb = $('[data-mobile-theme]');
                mb.innerHTML = svg(t === 'dark' ? 'sun' : 'moon');
                mb.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
                document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#212529' : '#FFFFFF');
            }
            function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('qa-dash-theme', t) } catch (e) { } syncTheme() }
            syncTheme();
            if (document.documentElement.classList.contains('side-collapsed')) $('#collapseBtn').setAttribute('aria-label', 'Expand sidebar');

            let rTimer;
            window.addEventListener('resize', () => { clearTimeout(rTimer); rTimer = setTimeout(() => { if (!state.D) return; if (state.view === 'hi') renderHistChart(); if (state.view === 'ov') renderOvTrend(); if (state.view === 'gr') renderGraphs(); if (state.view === 'at') renderDetail(); if (!isPhone()) setDrawer(false) }, 150) });

            /* ── load ── */
            const get = p => fetch(p + '?t=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() });
            setView(viewFromHash());

            let loadedAt = 0;
            function load() {
                loadedAt = Date.now();
                return Promise.allSettled([get(`${DATA}/results.json`), get(`${DATA}/runs.json`), get(`${DATA}/coverage-results.json`)]).then(([res, runs, cov]) => {
                    state.runs = runs.status === 'fulfilled' ? (Array.isArray(runs.value) ? runs.value : (runs.value && runs.value.runs) || []) : [];
                    state.cov = cov.status === 'fulfilled' ? cov.value : null;
                    renderRequirements();
                    const D = res.status === 'fulfilled' ? res.value : null;
                    if (!D || !D.runId) {
                        if (res.status !== 'fulfilled') console.error('Dashboard fetch error:', res.reason);
                        $('#headline').textContent = D ? 'Waiting for the first run' : 'No run data found';
                        $('#hello').textContent = D ? 'Trigger the Web 2.0 workflow in GitHub Actions to fill this report.' : `Could not load ${DATA.replace('./', '')}/results.json. Check that the latest workflow run pushed to the dashboard repo, then try again.`;
                        $('#ovSub').textContent = 'No run to show yet.';
                        $('#reloadBtn').hidden = !!D;
                        $$('.ov-part').forEach(el => { el.hidden = true }); $('#sumTop').hidden = true; $('#sumMain').hidden = true;
                        $$('.cnt').forEach(c => { c.hidden = true });
                        ['#fxGroups', '#flkList', '#atList', '#cvList', '#hiList'].forEach(s => { $(s).innerHTML = emptyBox('clock', 'No run data yet', 'Results appear here after the next workflow run.') });
                        return;
                    }
                    $('#reloadBtn').hidden = true;
                    prepare(D);
                    renderGreeting(); renderShell(); renderOverview(); renderFix(); renderFlaky(); renderAll(); renderHistory(); renderCoverage();
                    setView(state.view);
                });
            }
            load();

            // Keep "2 hours ago" honest, and pick up new runs when someone returns to an old tab.
            setInterval(() => { if (state.D && !document.hidden) { renderShell(); renderGreeting(); renderEnv() } }, 60000);
            document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - loadedAt > 10 * 60000) load() });
        })();
    
