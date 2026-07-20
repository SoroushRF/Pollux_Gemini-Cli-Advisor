/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const LEDGER_URL = '/deepswe-ledger.json';
const POLL_MS = 3000;

const FRESH5 = [
  'wazero-multi-module-snapshots',
  'ts-pattern-match-each',
  'true-myth-iterable-collection-combinators',
  'testem-per-launcher-reports',
  'opa-rego-rule-profiling',
];

/** @type {any} */
let ledger = null;
let selectedCellKey = null;
let selectedRunId = null;

function cellKey(taskId, condition) {
  return `${taskId}|${condition}`;
}

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getCell(taskId, condition) {
  return (
    ledger?.cells?.[cellKey(taskId, condition)] ?? {
      credited: [],
      attempts: [],
      invalid: [],
    }
  );
}

function countCredited() {
  let credited = 0;
  let resolved = 0;
  for (const cell of Object.values(ledger?.cells ?? {})) {
    for (const row of cell.credited ?? []) {
      credited++;
      if (row.resolved) resolved++;
    }
  }
  return { credited, resolved };
}

function conditionCoverage(condition) {
  const tasks = ledger?.tasks ?? [];
  const target = (ledger?.targetRepeats ?? 4) * tasks.length;
  let done = 0;
  for (const taskId of tasks) {
    done += getCell(taskId, condition).credited.length;
  }
  return { done, remain: Math.max(0, target - done), target };
}

function shortTask(taskId) {
  return taskId.split('-')[0];
}

function renderHeader() {
  const total =
    (ledger.tasks?.length ?? 10) *
    (ledger.conditions?.length ?? 3) *
    (ledger.targetRepeats ?? 4);
  const minTotal =
    (ledger.tasks?.length ?? 10) *
    (ledger.conditions?.length ?? 3) *
    (ledger.minRepeats ?? 3);
  document.getElementById('header-sub').textContent =
    `Target ${total} scored samples (min ${minTotal} at n=3) · DeepSWE only`;
  document.getElementById('header-meta').innerHTML = `
    <div>updated ${esc(ledger.updatedAt ?? '—')}</div>
    <div>schema v${esc(ledger.schemaVersion ?? '?')}</div>
  `;
}

function renderStats() {
  const { credited, resolved } = countCredited();
  const total =
    (ledger.tasks?.length ?? 10) *
    (ledger.conditions?.length ?? 3) *
    (ledger.targetRepeats ?? 4);
  const pct = total ? Math.round((credited / total) * 100) : 0;
  const remaining = Math.max(0, total - credited);
  const campaigns = [...(ledger.campaigns ?? [])];
  const last = campaigns.length ? campaigns[campaigns.length - 1] : null;
  const active =
    campaigns.find((c) => c.finishedAt == null && c.ledgerCredit) ?? last;

  document.getElementById('stat-strip').innerHTML = `
    <div class="stat ok"><div class="value">${credited}</div><div class="label">Credited samples</div></div>
    <div class="stat warn"><div class="value">${pct}%</div><div class="label">Of ${total}-run target</div></div>
    <div class="stat info"><div class="value">${resolved}/${credited || 0}</div><div class="label">Resolved among credited</div></div>
    <div class="stat"><div class="value">${remaining}</div><div class="label">Still to credit (n=4)</div></div>
    <div class="stat"><div class="value mono" style="font-size:0.85rem">${esc(active?.runId ?? '—')}</div><div class="label">Last / active campaign</div></div>
  `;
}

function renderOpsHealth() {
  const campaigns = [...(ledger.campaigns ?? [])].reverse();
  const withAuth = campaigns.find((c) => c.authOk != null);
  const withBaseline = campaigns.find((c) => c.baselinePreflightOk != null);
  const authPill =
    withAuth == null
      ? '<span class="pill">auth n/a</span>'
      : withAuth.authOk
        ? `<span class="pill ok">auth ok (${esc(withAuth.runId)})</span>`
        : `<span class="pill bad">auth fail (${esc(withAuth.runId)})</span>`;
  const basePill =
    withBaseline == null
      ? '<span class="pill">baseline n/a</span>'
      : withBaseline.baselinePreflightOk
        ? `<span class="pill ok">baseline ok (${esc(withBaseline.runId)})</span>`
        : `<span class="pill bad">baseline fail (${esc(withBaseline.runId)})</span>`;

  document.getElementById('ops-health').innerHTML = `
    <h2>Ops health</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${authPill}
      ${basePill}
      <span class="hint">Scratch under --scratch-root is ephemeral (default prune). Telemetry stays in artifacts.</span>
    </div>
  `;
}

function renderCoverage() {
  const conditions = ledger.conditions ?? ['A', 'E', 'FD'];
  const labels = { A: 'A (Flash)', E: 'E (Pro)', FD: 'FD (Flash+advisor)' };
  document.getElementById('coverage-bars').innerHTML = conditions
    .map((c) => {
      const { done, remain, target } = conditionCoverage(c);
      const donePct = target ? (done / target) * 100 : 0;
      const remainPct = target ? (remain / target) * 100 : 0;
      return `
        <div class="bar-row">
          <div>${esc(labels[c] ?? c)}</div>
          <div class="bar-track" title="${done} done / ${remain} remaining">
            <div class="bar-done" style="width:${donePct}%"></div>
            <div class="bar-remain" style="width:${remainPct}%"></div>
          </div>
          <div class="mono">${done}/${target}</div>
        </div>`;
    })
    .join('');
}

function renderHeatMap() {
  const tasks = ledger.tasks ?? [];
  const conditions = ledger.conditions ?? ['A', 'E', 'FD'];
  const head = conditions.map((c) => `<th>${esc(c)}</th>`).join('');
  const rows = tasks
    .map((taskId) => {
      const cells = conditions
        .map((condition) => {
          const cell = getCell(taskId, condition);
          const n = cell.credited.length;
          const resolved = cell.credited.filter((r) => r.resolved).length;
          const invalid = cell.invalid.length;
          const key = cellKey(taskId, condition);
          const title = `${taskId} ${condition}: credited ${n}, resolved ${resolved}, invalid ${invalid}`;
          const selected = selectedCellKey === key ? ' selected' : '';
          return `<td class="heat-cell heat-${Math.min(4, n)}${selected}" data-cell="${esc(key)}" title="${esc(title)}">${n}${resolved ? `·${resolved}r` : ''}</td>`;
        })
        .join('');
      return `<tr><th class="task" title="${esc(taskId)}">${esc(taskId)}</th>${cells}</tr>`;
    })
    .join('');

  document.getElementById('heat-map').innerHTML = `
    <table class="heat-table">
      <thead><tr><th class="task">Task</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  document.querySelectorAll('[data-cell]').forEach((el) => {
    el.addEventListener('click', () => {
      selectedCellKey = el.getAttribute('data-cell');
      selectedRunId = null;
      renderDrillDown();
      renderHeatMap();
      renderCampaigns();
    });
  });
}

function renderFresh5() {
  const target = ledger.targetRepeats ?? 4;
  const rows = FRESH5.map((taskId) => {
    const cell = getCell(taskId, 'FD');
    const n = cell.credited.length;
    const resolved = cell.credited.filter((r) => r.resolved).length;
    const need = Math.max(0, target - n);
    return `<tr>
      <td class="mono">${esc(shortTask(taskId))}</td>
      <td>${n}</td>
      <td>${resolved}</td>
      <td>${need}</td>
    </tr>`;
  }).join('');

  document.getElementById('fresh5-panel').innerHTML = `
    <table class="data">
      <thead><tr><th>Task</th><th>FD credited</th><th>Resolved</th><th>Still needed</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint" style="margin-top:8px">Seed source: fresh5-seed. Remaining5 start at 0 FD credited.</p>
  `;
}

function renderCampaigns() {
  const campaigns = [...(ledger.campaigns ?? [])].reverse();
  if (!campaigns.length) {
    document.getElementById('campaign-list').innerHTML =
      '<p class="hint">No campaign folders indexed yet.</p>';
    return;
  }

  const body = campaigns
    .map((c) => {
      const sel = selectedRunId === c.runId ? ' selected' : '';
      const credit = c.ledgerCredit
        ? '<span class="pill ok">ledger</span>'
        : '<span class="pill warn">history</span>';
      const s = c.summary;
      return `<tr class="clickable${sel}" data-run="${esc(c.runId)}">
        <td class="mono">${esc(c.runId)}</td>
        <td>${credit}</td>
        <td>${esc((c.conditions ?? []).join(',') || '—')}</td>
        <td>${c.sampleCount ?? '—'}</td>
        <td>${s ? `${s.valid_for_score ?? 0}v / ${s.resolved ?? 0}r / ${s.invalid ?? 0}i` : '—'}</td>
        <td class="mono">${esc(c.path ?? '')}</td>
      </tr>`;
    })
    .join('');

  document.getElementById('campaign-list').innerHTML = `
    <table class="data">
      <thead><tr>
        <th>runId</th><th>Credit</th><th>Conditions</th><th>Samples</th><th>V/R/I</th><th>Path</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;

  document.querySelectorAll('[data-run]').forEach((el) => {
    el.addEventListener('click', () => {
      selectedRunId = el.getAttribute('data-run');
      selectedCellKey = null;
      renderDrillDown();
      renderCampaigns();
      renderHeatMap();
    });
  });
}

function sampleRowsFromCell(cell, filterRunId = null) {
  const packs = [
    ...cell.credited.map((r) => ({ ...r, _bucket: 'credited' })),
    ...cell.attempts.map((r) => ({ ...r, _bucket: 'attempts' })),
    ...cell.invalid.map((r) => ({ ...r, _bucket: 'invalid' })),
  ];
  return filterRunId ? packs.filter((r) => r.runId === filterRunId) : packs;
}

function renderSampleTable(rows) {
  if (!rows.length) {
    return '<p class="hint">No samples in this selection.</p>';
  }
  const body = rows
    .map(
      (r) => `<tr>
      <td class="mono">${esc(r.sampleId ?? '—')}</td>
      <td>${esc(r._bucket)}</td>
      <td>${r.resolved ? 'yes' : 'no'}</td>
      <td>${esc(r.score_bucket ?? '—')}</td>
      <td>${esc(r.invalidation_reason ?? '—')}</td>
      <td>${r.totalTokens ?? '—'}</td>
      <td>${r.verifier_exit_code ?? '—'}</td>
      <td>${r.workspace_retained == null ? '—' : r.workspace_retained ? 'yes' : 'no'}</td>
      <td>${r.verifier_workspace_staged ? 'yes' : '—'}</td>
      <td class="mono">${esc(r.runId ?? r.source ?? '—')}</td>
    </tr>`,
    )
    .join('');
  return `<table class="data">
    <thead><tr>
      <th>sampleId</th><th>bucket</th><th>resolved</th><th>score_bucket</th>
      <th>invalidation</th><th>tokens</th><th>verifier_exit</th>
      <th>workspace_retained</th><th>staged</th><th>run/source</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function renderDrillDown() {
  const titleEl = document.getElementById('drill-title');
  const root = document.getElementById('drill-down');

  if (selectedCellKey) {
    const [taskId, condition] = selectedCellKey.split('|');
    titleEl.textContent = `· ${taskId} / ${condition}`;
    const cell = getCell(taskId, condition);
    root.innerHTML = renderSampleTable(sampleRowsFromCell(cell));
    return;
  }

  if (selectedRunId) {
    titleEl.textContent = `· campaign ${selectedRunId}`;
    const rows = [];
    for (const taskId of ledger.tasks ?? []) {
      for (const condition of ledger.conditions ?? []) {
        const cell = getCell(taskId, condition);
        for (const r of sampleRowsFromCell(cell, selectedRunId)) {
          rows.push({
            ...r,
            sampleId: r.sampleId ?? `${condition}__${taskId}`,
          });
        }
      }
    }
    root.innerHTML = renderSampleTable(rows);
    return;
  }

  titleEl.textContent = '';
  root.innerHTML =
    '<p class="hint">Select a heat-map cell or campaign row.</p>';
}

function renderAll() {
  if (!ledger) return;
  renderHeader();
  renderStats();
  renderOpsHealth();
  renderCoverage();
  renderHeatMap();
  renderFresh5();
  renderCampaigns();
  renderDrillDown();
}

async function loadLedger() {
  const res = await fetch(`${LEDGER_URL}?t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(
      `Ledger HTTP ${res.status}. Run: node scripts/pollux-deepswe-ledger-rebuild.mjs`,
    );
  }
  ledger = await res.json();
  renderAll();
}

function showError(message) {
  let banner = document.querySelector('.error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'error-banner';
    document.querySelector('.page').prepend(banner);
  }
  banner.textContent = message;
}

function clearError() {
  document.querySelector('.error-banner')?.remove();
}

async function refresh() {
  try {
    await loadLedger();
    clearError();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

refresh();
setInterval(() => {
  if (document.visibilityState === 'visible') refresh();
}, POLL_MS);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
