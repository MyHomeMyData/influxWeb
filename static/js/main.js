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

async function applyQuery() {
  const status = document.getElementById("status-line");
  if (!State.bucket) return;
  status.textContent = "Querying...";
  try {
    const result = await Api.queryPoints(buildEffectiveSelection());
    ResultsTable.setRows(result.points);
    updateToolbarLabels(ResultsTable.getSelectedRows());
    status.textContent = result.truncated
      ? `Showing first ${result.points.length} points (truncated)`
      : `${result.points.length} points`;
  } catch (error) {
    status.textContent = `Query failed: ${error.message}`;
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
  const status = document.getElementById("status-line");
  const selectedRows = ResultsTable.getSelectedRows();
  // With nothing explicitly selected, export every row currently loaded in
  // the table - it's already fetched, so no extra (slow) server query is
  // needed to re-derive the same result set.
  const rows = selectedRows.length > 0 ? selectedRows : ResultsTable.getAllRows();
  try {
    const blob = await Api.exportOdsSelectedBlob(State.bucket, rows);
    downloadBlob("influxweb-export.ods", blob);
  } catch (error) {
    status.textContent = `Export failed: ${error.message}`;
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
  document.getElementById("status-line").textContent = "Selection cleared - choose a measurement or tag value";
}

function updateToolbarLabels(selectedRows) {
  const count = selectedRows.length;
  if (count > 0) {
    document.getElementById("export-ods").textContent = `Export selected (${count})`;
    document.getElementById("delete-in-range").textContent = `Delete selected (${count})`;
    return;
  }
  const total = ResultsTable.getAllRows().length;
  document.getElementById("export-ods").textContent = `Export all (${total})`;
  document.getElementById("delete-in-range").textContent = `Delete all (${total})`;
}

document.addEventListener("DOMContentLoaded", async () => {
  ResultsTable.init((selectedRows) => updateToolbarLabels(selectedRows));
  DeleteConfirmModal.init(applyQuery);

  await BucketSelect.init(async () => {
    await FilterBuilder.render(applyQuery);
    await applyQuery();
  });

  document.getElementById("query-form").addEventListener("submit", (event) => {
    event.preventDefault();
    applyQuery();
  });
  document.getElementById("export-ods").addEventListener("click", exportOds);
  document.getElementById("clear-selection").addEventListener("click", clearSelection);
  document.getElementById("delete-in-range").addEventListener("click", () => DeleteConfirmModal.open());
});
