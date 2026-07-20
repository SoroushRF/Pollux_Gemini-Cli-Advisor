# Pollux DeepSWE matrix tracker (HTML)

Standalone ops dashboard for the DeepSWE eval matrix (10 × A/E/FD × 4). Reads
`artifacts/pollux/deepswe-ledger.json` (gitignored). Does not launch runs.

## Rebuild ledger

From repo root:

```powershell
node scripts/pollux-deepswe-ledger-rebuild.mjs
```

Day-one expected: **~10/120 (~8%)** credited from Fresh5 FD seed. Historical
campaign folders are listed but not auto-credited unless their `manifest.json`
has `"ledgerCredit": true` (new runner campaigns).

## Serve dashboard

```powershell
node scripts/pollux-deepswe-dashboard-serve.mjs
```

Open [http://127.0.0.1:8787/](http://127.0.0.1:8787/).

Optional env:

- `POLLUX_DEEPSWE_DASHBOARD_PORT` (default `8787`)
- `POLLUX_DEEPSWE_DASHBOARD_HOST` (default `127.0.0.1`)

The page polls `/deepswe-ledger.json` every few seconds while visible.

## Live updates

New DeepSWE `mode=run` / rescore campaigns write `ledgerCredit: true` on
`manifest.json` and append each sample into the ledger after `run.json` is
written. You can also re-run the rebuild script anytime to resync from disk.
