async function applyQuery() {
  const status = document.getElementById("status-line");
  if (!State.bucket) return;
  status.textContent = "Querying...";
  try {
    const result = await Api.queryPoints(State.toSelection());
    ResultsTable.setRows(result.points);
    status.textContent = result.truncated
      ? `Showing first ${result.points.length} points (truncated)`
      : `${result.points.length} points`;
  } catch (error) {
    status.textContent = `Query failed: ${error.message}`;
  }
}

function exportCsv() {
  if (!State.bucket) return;
  window.location.href = Api.exportCsvUrl(State.toSelection());
}

function clearSelection() {
  State.clearSelection();
  FilterBuilder.clearSelectionVisuals();

  const searchInput = document.getElementById("schema-search");
  searchInput.value = "";
  FilterBuilder.filterByText("");

  ResultsTable.setRows([]);
  document.getElementById("status-line").textContent = "Selection cleared - choose a measurement or tag value";
}

document.addEventListener("DOMContentLoaded", async () => {
  DetailPanel.init();
  ResultsTable.init((row) => DetailPanel.show(row.id));
  DeleteConfirmModal.init(applyQuery);

  await BucketSelect.init(async () => {
    await FilterBuilder.render(applyQuery);
    await applyQuery();
  });

  document.getElementById("apply-query").addEventListener("click", applyQuery);
  document.getElementById("export-csv").addEventListener("click", exportCsv);
  document.getElementById("clear-selection").addEventListener("click", clearSelection);
  document.getElementById("delete-in-range").addEventListener("click", () => DeleteConfirmModal.open());
});
