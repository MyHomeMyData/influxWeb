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

async function applyQuery() {
  if (!State.bucket) return;
  setStatus("Querying...", "querying");
  try {
    const result = await Api.queryPoints(buildEffectiveSelection());
    ResultsTable.setRows(result.points);
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

function clearSelection() {
  State.clearSelection();
  FilterBuilder.clearSelectionVisuals();

  const searchInput = document.getElementById("schema-search");
  searchInput.value = "";
  FilterBuilder.filterByText("");

  ResultsTable.setRows([]);
  updateToolbarLabels([]);
  setStatus("Selection cleared - choose a measurement or tag value");
}

function updateToolbarLabels(selectedRows) {
  const count = selectedRows.length;
  if (count > 0) {
    document.getElementById("export-ods").textContent = `Export selected (${count})`;
    document.getElementById("retime-in-range").textContent = `Retime selected (${count})`;
    document.getElementById("delete-in-range").textContent = `Delete selected (${count})`;
    return;
  }
  const total = ResultsTable.getAllRows().length;
  document.getElementById("export-ods").textContent = `Export all (${total})`;
  document.getElementById("retime-in-range").textContent = `Retime all (${total})`;
  document.getElementById("delete-in-range").textContent = `Delete all (${total})`;
}

async function onPointSaved() {
  await applyQuery();
  setStatus("Point updated.");
}

async function onPointAdded() {
  await applyQuery();
  setStatus("Point added.");
}

async function onPointsRetimed(count) {
  await applyQuery();
  setStatus(`${count} point(s) retimed.`);
}

async function onOdsImported(result) {
  // The imported file may target a different bucket than the one currently
  // shown - only re-query if it's relevant, otherwise just report the count.
  const importedCurrentBucket = State.bucket && result.buckets.includes(State.bucket);
  if (importedCurrentBucket) {
    await applyQuery();
  }
  const errorNote = result.errors.length > 0 ? `, ${result.errors.length} row(s) skipped` : "";
  setStatus(`${result.written_count} point(s) imported${errorNote}.`, result.errors.length > 0 ? "error" : "");
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

document.addEventListener("DOMContentLoaded", async () => {
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
  document.getElementById("clear-selection").addEventListener("click", clearSelection);
  document.getElementById("delete-in-range").addEventListener("click", () => DeleteConfirmModal.open());
  document.getElementById("add-point").addEventListener("click", () => AddPointModal.open());
  document.getElementById("retime-in-range").addEventListener("click", () => RetimeBulkModal.open());
});
