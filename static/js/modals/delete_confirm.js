const DeleteConfirmModal = {
  init(onDeleted) {
    this.onDeleted = onDeleted;
    this.overlay = document.getElementById("delete-modal");
    this.body = document.getElementById("delete-modal-body");
    this.confirmButton = document.getElementById("delete-modal-confirm");
    this.cancelButton = document.getElementById("delete-modal-cancel");

    this.cancelButton.addEventListener("click", () => this.close());
    this.confirmButton.addEventListener("click", () => this._confirm());
  },

  async open() {
    if (!State.bucket) return;
    this.preview = null;
    this.confirmButton.disabled = true;
    this.overlay.classList.add("open");
    this.body.innerHTML = "<p>Loading preview...</p>";

    try {
      const selectedRows = ResultsTable.getSelectedRows();
      // With nothing explicitly selected, delete acts on every row currently
      // loaded in the table - it's already fetched, so no extra server query
      // is needed to find out what would be deleted.
      this.displayRows = selectedRows.length > 0 ? selectedRows : ResultsTable.getAllRows();
      // Deleting is by measurement+tags+time (a whole point, every field at
      // once - see the note in the preview below), so several raw rows of
      // the same point would otherwise turn into redundant delete calls for
      // an already-deleted point, and inflate the displayed/confirmed count
      // beyond the number of points actually affected.
      const seenKeys = new Set();
      this.points = [];
      for (const row of this.displayRows) {
        const key = pointKey(row.measurement, row.tags, row.time);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        this.points.push({ bucket: State.bucket, measurement: row.measurement, tags: row.tags, time: row.time, storage_variant: row.storage_variant ?? null });
      }
      this.preview = await Api.previewDeleteSelected(this.points);
      this._renderPreview();
      this.confirmButton.disabled = this.preview.matched_count === 0;
    } catch (error) {
      this.body.innerHTML = `<p class="status-line">Preview failed: ${error.message}</p>`;
    }
  },

  close() {
    this.overlay.classList.remove("open");
  },

  _renderPreview() {
    const preview = this.preview;
    if (preview.matched_count === 0) {
      this.body.innerHTML = "<p>Nothing matches - nothing to delete.</p>";
      return;
    }

    const rows = this.displayRows
      .map(
        (point) =>
          `<tr><td>${point.measurement}</td><td>${Object.entries(point.tags)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}</td><td>${point.field}</td><td>${point.value}</td><td>${point.time}</td></tr>`
      )
      .join("");

    this.body.innerHTML = `
      <p><strong>${preview.matched_count}</strong> point(s) will be permanently deleted.</p>
      <p class="status-line">Note: deleting a point removes all fields recorded at that exact
        timestamp for its series, not just the field shown below.</p>
      <table class="preview-table">
        <thead><tr><th>Measurement</th><th>Tags</th><th>Field</th><th>Value</th><th>Time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  async _confirm() {
    if (!this.preview || this.preview.matched_count === 0) return;
    this.confirmButton.disabled = true;
    this.body.innerHTML += "<p>Deleting...</p>";

    try {
      await Api.executeDeleteSelected(this.points, this.preview.confirm_token);
      this.body.innerHTML = "<p>Deleted successfully.</p>";
      this.onDeleted();
      setTimeout(() => this.close(), 800);
    } catch (error) {
      this.body.innerHTML += `<p class="status-line">Delete failed: ${error.message}</p>`;
      this.confirmButton.disabled = false;
    }
  },
};
