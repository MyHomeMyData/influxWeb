# influxWeb

A web-based admin UI for a local InfluxDB v2 instance. Built for editing smarthome
telemetry (e.g. from ioBroker) without fighting the `influx` CLI: browse buckets,
filter datapoints by measurement/tag, inspect and edit values, fix timestamps,
delete ranges, and export/import CSV.

Runs as a small FastAPI backend + a static HTML/JS frontend (Tabulator.js), meant
for LAN-only deployment on something like a Raspberry Pi — no login, no internet
exposure.

## Status

Early development. Currently implemented (read-only browsing & export):
- Bucket selection
- Measurement/tag schema browsing and selection (click or filter)
- Time range selection
- Querying and listing datapoints
- Point detail view
- CSV export

Planned next: delete-in-range, edit/add values, retime, timestamp normalization,
CSV import — each behind a preview/confirm step before anything destructive runs.

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
