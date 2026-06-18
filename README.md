# influxWeb

A web-based admin UI for a local InfluxDB v2 instance. Built for editing smarthome
telemetry (e.g. from ioBroker) without fighting the `influx` CLI: browse buckets,
filter datapoints by measurement/tag, inspect and edit values, fix timestamps,
delete ranges, and export/import data as ODS spreadsheets (for editing in
LibreOffice Calc with correct types, no CSV locale/decimal-separator guessing).

Runs as a small FastAPI backend + a static HTML/JS frontend (Tabulator.js), meant
for LAN-only deployment on something like a Raspberry Pi — no login, no internet
exposure.

## Status

Early development. Currently implemented:
- Bucket selection
- Measurement/tag schema browsing and selection, file-explorer-style (click,
  Ctrl+click, Shift+click), with a clear/reset action and a text filter
- Time range selection
- Querying and listing datapoints, with adjustable page size and multi-row
  selection (same click/Ctrl/Shift model as the schema tree)
- Export to ODS (whole query result, or just the selected rows), with proper
  cell types (numbers, booleans, dates) and an instructions block describing
  the round-trip contract for a later import
- Delete points - either exactly the selected rows, or (with nothing selected)
  every row currently loaded in the table - with a preview and explicit
  confirmation before anything is deleted

Planned next: edit/add values, retime, timestamp normalization, ODS import —
each behind the same preview/confirm pattern used for delete.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .local_data/config.env   # then fill in INFLUX_URL / INFLUX_TOKEN / INFLUX_ORG
```

## Run (development)

```bash
.venv/bin/uvicorn app.main:app --reload --port 8085
```

Open `http://localhost:8085/`.

## Deployment (Raspberry Pi, systemd)

See `deploy/influxweb.service` for a unit template. Install into e.g. `/opt/influxweb`,
create the venv there, copy `.local_data/config.env` into place (never commit it), then:

```bash
sudo systemctl enable --now influxweb
```

influxWeb binds `0.0.0.0` by default — keep it reachable only from your LAN (no
router port-forward); there is no authentication built in.

## License

MIT, see [LICENSE](LICENSE).
