# influxWeb

A web-based admin UI for a local InfluxDB v2 instance. Built for editing smarthome
telemetry (e.g. from ioBroker) without fighting the `influx` CLI: browse buckets,
filter datapoints by measurement/tag, inspect and edit values, fix timestamps,
delete ranges, and export/import data as ODS spreadsheets (for editing in
LibreOffice Calc with correct types, no CSV locale/decimal-separator guessing).

Runs as a small FastAPI backend + a static HTML/JS frontend (Tabulator.js), meant
for LAN-only deployment on something like a Raspberry Pi — no login, no internet
exposure.

This project was developed against an ioBroker InfluxDB-history setup specifically
(e.g. its `ack`/`from`/`q` tag conventions show up in a couple of default-value
choices) — it should work against any InfluxDB v2 instance, but has not yet been
tested outside that one environment.

ioBroker's InfluxDB adapter can store metadata in two different ways, depending on
the "store metadata (ack, from, q) as tags" setting in its Expert config:

- **Tag-based** (setting enabled): `ack`, `from`, `q` are InfluxDB tags, `value` is the field.
- **Field-based** (setting disabled): `ack`, `from`, `q`, and `value` are all InfluxDB fields, no tags.

Both variants are fully supported when `INFLUXWEB_MODE=iobroker` is set in `.env`
(pre-configured in `.env.example`). influxWeb auto-detects the storage variant per measurement, groups field-based
data into one row per logical point, and handles Add point, Edit, Delete, Retime, and
ODS Export/Import correctly for both variants. The "Group fields by point" toggle is
hidden in iobroker mode (grouping is always on).

Set `INFLUXWEB_MODE=default` in `.env` to disable ioBroker-specific behaviour. In
that mode, all operations work for tag-based data. Field-based data can be browsed,
queried, exported, edited, retimed, and deleted correctly — but "Add point" will not
create a complete ioBroker point and should be avoided.

## Features

- Bucket selection
- Measurement/tag schema browsing and selection, file-explorer-style (click,
  Ctrl+click, Shift+click), with a clear/reset action and a text filter
- Time range selection
- Querying and listing datapoints, with adjustable page size and multi-row
  selection (same click/Ctrl/Shift model as the schema tree); capped at
  200,000 points per query to keep memory use bounded regardless of how broad
  a selection is — narrow the measurement/tag/time filter if a result comes
  back marked as truncated
- A Statistical View toggle: instead of one row per point, one summary row
  per measurement+field (count, and for numeric fields min/max/mean/standard
  deviation) over the currently loaded query result
- A "Group fields by point" toggle: pivots the Data View from one row per
  field to one row per logical reading (fields as columns) - mainly useful
  for ioBroker buckets using field-based storage, where each point otherwise
  shows as several separate rows. Off by default, remembered across visits.
  Hidden when `INFLUXWEB_MODE=iobroker` is active (grouping is always on there)
- Export to ODS (whole query result, or just the selected rows), with proper
  cell types (numbers, booleans, dates) and an instructions block describing
  the round-trip contract for a later import
- Import from ODS: re-upload a previously exported (and possibly hand-edited)
  file. A dry-run preview shows what would be written, which bucket(s) the
  file targets, and any rows that will be skipped (with a reason) before you
  confirm. Edited rows overwrite the matching point; new rows create one;
  deleted rows are left untouched in InfluxDB (import only writes, never
  deletes)
- Export Raw / Import Raw: a deliberately bare-bones pair for CLI/scripting
  interop, using InfluxDB's own annotated CSV format (`influx query`/
  `influx write --format csv`). Export Raw dumps the *entire* active bucket
  for the current time range in one query, no measurement/tag filtering.
  Import Raw writes a single-schema CSV file straight into the active
  bucket with no preview - it stops at the first row it can't parse or
  write, rather than trying to validate the whole file upfront
- Delete points - either exactly the selected rows, or (with nothing selected)
  every row currently loaded in the table - with a preview and explicit
  confirmation before anything is deleted
- Edit a value inline (double-click a cell in the Value column) with a
  confirm-before-save step, or add a brand-new point via a separate modal -
  both share the same write path (overwrite by measurement+tags+timestamp,
  last-write-wins, same as InfluxDB itself)
- Retime points: shift the timestamp of selected (or all loaded) points by a
  calendar-aware offset, or normalize them to the start of the
  minute/hour/day/week/month/year (local time, DST-aware) — both via the
  "Retime in range" button with the usual preview/confirm step. A single
  point's timestamp can also be edited in place (double-click a cell in the
  Time column)

## Sorting

Column headers use Tabulator's standard click behavior, not anything custom
to influxWeb:
- **Click** a header to sort by that column alone.
- **Shift+click** another header to add it as a further sort level. The
  most-recently Shift-clicked column becomes the new *primary* sort key, and
  any columns sorted before it become tiebreakers underneath it.

This takes a moment to get used to, but covers the common case of wanting to
read one measurement's values in chronological order without any extra UI:

1. Click **Time** to sort by it.
2. Shift+click **Measurement**. Measurement becomes the primary sort, with
   Time still applied underneath as the tiebreaker - so within each
   measurement, rows come out time-ordered.

## Setup

Installs influxWeb as a systemd service on a Raspberry Pi (or any Linux host with
systemd), running under its own dedicated system user, into `/opt/influxweb`.

### Quick install

```bash
curl -sLf https://raw.githubusercontent.com/MyHomeMyData/influxWeb/main/deploy/install.sh | sudo bash -
```

This clones the repo into `/opt/influxweb`, creates the dedicated `influxweb`
system user, sets up the virtual environment, installs the systemd unit, and
installs the `influxweb-upgrade`/`influxweb-uninstall` commands (see
[Upgrading](#upgrading) and [Uninstalling](#uninstalling)) — it does not start
the service yet, since InfluxDB access still needs to be configured. After it
finishes:

1. Fill in InfluxDB access:
   ```bash
   sudo -u influxweb nano /opt/influxweb/.env   # fill in INFLUX_URL / INFLUX_TOKEN / INFLUX_ORG
   ```
   The `.env.example` pre-sets `INFLUXWEB_MODE=iobroker`. Set it to `default` to
   disable ioBroker-specific behaviour (see [above](#influxweb) for details).
2. Start the service:
   ```bash
   sudo systemctl enable --now influxweb
   ```
3. Open `http://<pi-host>:8085/` from another machine on your LAN.

### Manual installation

Equivalent step-by-step version of the above, if you'd rather not pipe a script
into `sudo bash`, or want to adjust something along the way.

1. Clone the repository:
   ```bash
   sudo git clone https://github.com/MyHomeMyData/influxWeb.git /opt/influxweb
   ```
2. Create a dedicated system user (matches `User=`/`Group=` in
   `deploy/influxweb.service`) and hand it ownership of the install. `--home-dir`
   points it at `/opt/influxweb` itself, since that's the only directory it
   owns - without it, tools like `pip` fall back to a non-existent default
   home and disable their cache with a permissions warning:
   ```bash
   sudo useradd --system --no-create-home --home-dir /opt/influxweb --shell /usr/sbin/nologin influxweb
   sudo chown -R influxweb:influxweb /opt/influxweb
   ```
3. Create the virtual environment and install dependencies:
   ```bash
   sudo -u influxweb python3 -m venv /opt/influxweb/.venv
   sudo -u influxweb /opt/influxweb/.venv/bin/pip install -r /opt/influxweb/requirements.txt
   ```
4. Configure InfluxDB access:
   ```bash
   sudo -u influxweb cp /opt/influxweb/.env.example /opt/influxweb/.env
   sudo -u influxweb nano /opt/influxweb/.env   # fill in INFLUX_URL / INFLUX_TOKEN / INFLUX_ORG
   ```
   `.env` is gitignored — never commit it.
5. Install and start the systemd service:
   ```bash
   sudo cp /opt/influxweb/deploy/influxweb.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now influxweb
   ```
6. Open `http://<pi-host>:8085/` from another machine on your LAN.

influxWeb binds `0.0.0.0` by default — keep it reachable only from your LAN (no
router port-forward); there is no authentication built in.

### Upgrading

```bash
sudo influxweb-upgrade
```

Installed automatically by Quick install above — pulls the latest code, updates
dependencies, and restarts the service. If you used the manual installation
instead, do the same steps by hand:

```bash
cd /opt/influxweb
sudo -u influxweb git pull
sudo -u influxweb .venv/bin/pip install -r requirements.txt
sudo systemctl restart influxweb
```

Check the [Changelog](#changelog) below for anything version-specific to be aware
of before upgrading. The current running version is shown in the page header.

### Uninstalling

```bash
sudo influxweb-uninstall
```

Installed automatically by Quick install above. After a confirmation prompt,
stops and removes the service, `/opt/influxweb` (including `.env`), the
`influxweb` system user, and the `influxweb-upgrade`/`influxweb-uninstall`
commands themselves. If you used the manual installation, you're on your own
for cleanup — stop/disable the service, then remove the systemd unit,
`/opt/influxweb`, and the system user.

## Temporary setup for testing

For trying out influxWeb without installing it as a service:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in INFLUX_URL / INFLUX_TOKEN / INFLUX_ORG
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8085
```

Open `http://localhost:8085/` (or `http://<host>:8085/` from another machine on the LAN -
uvicorn only listens on `127.0.0.1` unless `--host 0.0.0.0` is passed explicitly).

## Changelog

### 0.3.0 (2026-07-01)

(MyHomeMyData) Added `INFLUXWEB_MODE=iobroker` for transparent, full-featured
support of ioBroker's InfluxDB adapter — covering both its tag-based and field-based
storage variants simultaneously, auto-detected per measurement at query time.

In iobroker mode, field-based data is grouped into one row per logical point on the
backend (measurement + timestamp → one display row with ack/from/q shown as
synthetic tag columns). All operations work correctly for both storage variants:

- **Add point**: dedicated form with ack/from/q fields; writes four single-field
  calls that InfluxDB merges into one complete point
- **Inline edit**: writes to the correct tagless series (not a new tagged one)
- **Delete / Retime**: use empty tags for field-based points, correctly identifying
  the series by measurement and timestamp alone
- **ODS Export**: one row per point; ack/from/q stored in `extra.*` columns
  (e.g. `extra.ack`, `extra.ack_type`) alongside the main value — round-trip safe
- **ODS Import**: detects `extra.*` columns and writes each as a separate field to
  the same series+timestamp; InfluxDB merges them into one complete point.
  Also fixed LibreOffice re-saving boolean cells as numeric (1/0) breaking import

The "Group fields by point" toggle is hidden in iobroker mode (grouping is always
active). In default mode, all existing behavior is unchanged.

Also fixed in this release: number-input stepper buttons (▲▼) in the inline cell
editor triggered the confirm modal immediately on click instead of waiting for
Enter or blur.

### 0.2.2 (2026-06-30)

(MyHomeMyData) Fixed several point-count inconsistencies introduced by 0.2.0's
"Group fields by point" toggle: the toolbar buttons, Retime/Delete dialogs, and
the points-loaded status line could show the raw per-field row count instead of
the logical point count, and toggling grouping didn't refresh the status line
(in one case leaving "Querying..." stuck after a query that legitimately
returned zero points). Also fixed Delete sending one redundant delete call per
field of a point instead of one per point.

### 0.2.1 (2026-06-30)

(MyHomeMyData) Added a warning in the Retime confirmation dialog when a hand-edited
timestamp introduces sub-millisecond precision that wasn't there before, since this
is usually an accidental stray edit of the trailing digits rather than intentional
(found by Marc Berg while testing 0.2.0).

### 0.2.0 (2026-06-30)

(Marc-Berg) Added a "Group fields by point" Data View toggle, pivoting one row
per field into one row per logical reading - mainly useful for ioBroker buckets
using field-based storage.

### 0.1.1 (2026-06-28)

(MyHomeMyData) Fixed an unfiltered selection querying the entire bucket, and
incorrect row order for ioBroker's field-based storage mode. Documented current
support boundaries between ioBroker's tag-based and field-based storage modes.

### 0.1.0 (2026-06-24)

(MyHomeMyData) Initial beta release.

## License

MIT, see [LICENSE](LICENSE).
