function buildEffectiveSelection() {
  // If nothing was explicitly clicked in the tree, fall back to whatever the
  // text filter currently narrows the measurement list down to - otherwise
  // typing a filter and hitting Apply without clicking would silently query
  // (or delete) everything instead of the visibly filtered subset.
  const selection = State.toSelection();
  if (selection.measurements.length === 0) {
    const searchTerm = document.getElementById("schema-search").value.trim();
    if (searchTerm) {
      selection.measurements = FilterBuilder.getVisibleMeasurements();
    }
  }
  return selection;
}

function setStatus(text, kind = "") {
  const status = document.getElementById("status-line");
  status.textContent = text;
  status.className = kind ? `status-line ${kind}` : "status-line";
}

// Every tree click fires its own applyQuery() without waiting for earlier
// ones to finish, so responses can arrive out of order. This token lets a
// response detect it's been superseded - by a later query or by
// clearSelection() - and skip applying its (now stale) result.
let queryToken = 0;
const GROUP_BY_POINT_STORAGE_KEY = "influxweb.groupByPoint";

async function applyQuery() {
  if (!State.bucket) return;
  const selection = buildEffectiveSelection();
  if (selection.measurements.length === 0 && Object.keys(selection.tags).length === 0) {
    // Nothing explicitly chosen - querying would otherwise mean "no filter at
    // all", i.e. the entire bucket for the current time range. Same
    // "pick something first" stance clearSelection() already takes below.
    ResultsTable.setRows([]);
    StatsTable.setRows([]);
    updateToolbarLabels([]);
    setStatus("Select a measurement or tag value to see points");
    return;
  }
  const token = ++queryToken;
  setStatus("Querying...", "querying");
  try {
    const result = await Api.queryPoints(selection);
    if (token !== queryToken) return;
    ResultsTable.setRows(result.points);
    StatsTable.setRows(result.points);
    updateToolbarLabels(ResultsTable.getSelectedRows());
    if (result.truncated) {
      setStatus(
        `Showing first ${result.points.length} points (truncated - narrow the selection or time range to see everything)`,
        "truncated"
      );
    } else {
      setStatus(`${result.points.length} points`);
    }
  } catch (error) {
    if (token !== queryToken) return;
    setStatus(`Query failed: ${error.message}`, "error");
  }
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportOds() {
  if (!State.bucket) return;
  const selectedRows = ResultsTable.getSelectedRows();
  // With nothing explicitly selected, export every row currently loaded in
  // the table - it's already fetched, so no extra (slow) server query is
  // needed to re-derive the same result set.
  const rows = selectedRows.length > 0 ? selectedRows : ResultsTable.getAllRows();
  try {
    const blob = await Api.exportOdsSelectedBlob(State.bucket, rows);
    downloadBlob("influxweb-export.ods", blob);
  } catch (error) {
    setStatus(`Export failed: ${error.message}`, "error");
  }
}

async function exportRaw() {
  if (!State.bucket) return;
  try {
    const blob = await Api.exportRawBlob(State.bucket, State.rangeStart, State.rangeStop);
    downloadBlob("influxweb-export.csv", blob);
  } catch (error) {
    setStatus(`Export failed: ${error.message}`, "error");
  }
}

function clearSelection() {
  // Invalidate any query still in flight from an earlier tree click, so its
  // response can't land after this and repopulate the table just cleared.
  queryToken += 1;
  State.clearSelection();
  FilterBuilder.clearSelectionVisuals();

  const searchInput = document.getElementById("schema-search");
  searchInput.value = "";
  FilterBuilder.filterByText("");

  ResultsTable.setRows([]);
  StatsTable.setRows([]);
  updateToolbarLabels([]);
  setStatus("Selection cleared - choose a measurement or tag value");
}

function setView(mode) {
  const isStats = mode === "stats";
  document.getElementById("results-table").style.display = isStats ? "none" : "";
  // "" (clear inline override) would fall back to app.css's
  // `#stats-table { display: none; }` default-hidden rule, not show it -
  // so showing it needs an explicit value, unlike results-table above
  // which has no such stylesheet rule to fight against.
  document.getElementById("stats-table").style.display = isStats ? "block" : "none";
  // None of the toolbar actions (Export/Import/Add/Retime/Delete) have a
  // sensible meaning against summary rows - they all act on individual
  // points or a Data View row selection, which isn't visible here.
  document.querySelector(".toolbar").style.display = isStats ? "none" : "";
  if (isStats) {
    // Constructing Tabulator against a display:none container fails to
    // measure it at all, so the actual instance is created lazily here -
    // the first time the container is genuinely visible - rather than at
    // page load.
    StatsTable.ensureInitialized();
  }
}

function updateToolbarLabels(selectedRows) {
  const count = selectedRows.length;
  if (count > 0) {
    document.getElementById("export-ods").textContent = `Export ODS selected (${count})`;
    document.getElementById("retime-in-range").textContent = `Retime selected (${count})`;
    document.getElementById("delete-in-range").textContent = `Delete selected (${count})`;
    return;
  }
  const total = ResultsTable.getAllRows().length;
  document.getElementById("export-ods").textContent = `Export ODS all (${total})`;
  document.getElementById("retime-in-range").textContent = `Retime all (${total})`;
  document.getElementById("delete-in-range").textContent = `Delete all (${total})`;
}

async function onPointSaved() {
  await applyQuery();
  setStatus("Point updated.");
}

async function onPointAdded() {
  // The measurement name is free-text, so this can introduce one that didn't
  // exist when the tree was last loaded - refresh it too, not just the query.
  await FilterBuilder.render(applyQuery);
  await applyQuery();
  setStatus("Point added.");
}

async function onPointsRetimed(count) {
  await applyQuery();
  setStatus(`${count} point(s) retimed.`);
}

async function onOdsImported(result) {
  // The imported file may target a different bucket than the one currently
  // shown - only refresh if it's relevant, otherwise just report the count.
  const importedCurrentBucket = State.bucket && result.buckets.includes(State.bucket);
  if (importedCurrentBucket) {
    // Re-render the measurement/tag tree too, not just the points query - an
    // import can introduce a measurement name that didn't exist when the
    // tree was last loaded, and applyQuery() alone wouldn't surface it.
    await FilterBuilder.render(applyQuery);
    await applyQuery();
  }
  const errorNote = result.errors.length > 0 ? `, ${result.errors.length} row(s) skipped` : "";
  setStatus(`${result.written_count} point(s) imported${errorNote}.`, result.errors.length > 0 ? "error" : "");
}

async function onRawImported(result) {
  // Raw import always targets the active bucket (no per-row bucket column),
  // so the tree refresh below is unconditional, unlike ODS import above.
  await FilterBuilder.render(applyQuery);
  await applyQuery();
  setStatus(`${result.written_count} point(s) imported.`);
}

function onTimeEdited(cell) {
  const row = cell.getRow().getData();
  const oldTime = cell.getOldValue();
  const newTime = cell.getValue();
  // Tabulator already applied the new time to this row's own data by the time
  // cellEdited fires, so it no longer matches `oldTime` in the lookup below -
  // its field/value are still correct though, so add them back in directly
  // (findPointGroup returns undefined when this was the point's only field).
  const group = ResultsTable.findPointGroup(row.measurement, row.tags, oldTime) ?? {
    measurement: row.measurement,
    tags: row.tags,
    fields: {},
  };
  group.fields[row.field] = { value: row.value, value_type: row.value_type };
  const point = {
    bucket: State.bucket,
    measurement: group.measurement,
    tags: group.tags,
    old_time: oldTime,
    new_time: newTime,
    fields: group.fields,
  };
  RetimeConfirmModal.open([point], () => cell.restoreOldValue());
}

async function showVersion() {
  try {
    const { version } = await Api.getVersion();
    document.getElementById("version-badge").textContent = `v${version}`;
  } catch {
    // Cosmetic only - a failed fetch here shouldn't block the rest of the page.
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  showVersion();
  ResultsTable.init(
    (selectedRows) => updateToolbarLabels(selectedRows),
    (cell) => EditConfirmModal.open(cell),
    (cell) => onTimeEdited(cell)
  );
  DeleteConfirmModal.init(applyQuery);
  EditConfirmModal.init(onPointSaved);
  AddPointModal.init(onPointAdded);
  RetimeConfirmModal.init(onPointsRetimed);
  RetimeBulkModal.init();
  ImportOdsModal.init(onOdsImported);
  ImportRawModal.init(onRawImported);

  document.getElementById("view-data").addEventListener("change", () => setView("data"));
  document.getElementById("view-stats").addEventListener("change", () => setView("stats"));

  const groupByPointInput = document.getElementById("group-by-point");
  const groupByPointSaved = localStorage.getItem(GROUP_BY_POINT_STORAGE_KEY) === "1";
  groupByPointInput.checked = groupByPointSaved;
  ResultsTable.setGroupByPoint(groupByPointSaved);
  groupByPointInput.addEventListener("change", () => {
    const enabled = groupByPointInput.checked;
    ResultsTable.setGroupByPoint(enabled);
    localStorage.setItem(GROUP_BY_POINT_STORAGE_KEY, enabled ? "1" : "0");
    updateToolbarLabels(ResultsTable.getSelectedRows());
  });

  await BucketSelect.init(async () => {
    await FilterBuilder.render(applyQuery);
    await applyQuery();
  });

  document.getElementById("query-form").addEventListener("submit", (event) => {
    event.preventDefault();
    applyQuery();
  });
  document.getElementById("export-ods").addEventListener("click", exportOds);
  document.getElementById("import-ods").addEventListener("click", () => ImportOdsModal.open());
  document.getElementById("export-raw").addEventListener("click", exportRaw);
  document.getElementById("import-raw").addEventListener("click", () => ImportRawModal.open());
  document.getElementById("clear-selection").addEventListener("click", clearSelection);
  document.getElementById("delete-in-range").addEventListener("click", () => DeleteConfirmModal.open());
  document.getElementById("add-point").addEventListener("click", () => AddPointModal.open());
  document.getElementById("retime-in-range").addEventListener("click", () => RetimeBulkModal.open());
});
