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
      this.preview = await Api.previewDelete(State.toSelection());
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
      this.body.innerHTML = "<p>No points match this selection and time range - nothing to delete.</p>";
      return;
    }

    const sampleRows = preview.sample_points
      .map(
        (point) =>
          `<tr><td>${point.measurement}</td><td>${Object.entries(point.tags)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}</td><td>${point.field}</td><td>${point.value}</td><td>${point.time}</td></tr>`
      )
      .join("");

    this.body.innerHTML = `
      <p><strong>${preview.matched_count}</strong> point(s) will be permanently deleted.</p>
      <p class="status-line">Measurements affected: ${preview.measurements_affected.join(", ")}</p>
      <p class="status-line">Range: ${preview.resolved_start} &ndash; ${preview.resolved_stop}</p>
      <table class="preview-table">
        <thead><tr><th>Measurement</th><th>Tags</th><th>Field</th><th>Value</th><th>Time</th></tr></thead>
        <tbody>${sampleRows}</tbody>
      </table>
      ${preview.matched_count > preview.sample_points.length ? "<p class=\"status-line\">(showing a sample only)</p>" : ""}
    `;
  },

  async _confirm() {
    if (!this.preview || this.preview.matched_count === 0) return;
    this.confirmButton.disabled = true;
    this.body.innerHTML += "<p>Deleting...</p>";

    try {
      const selection = State.toSelection();
      await Api.executeDelete({
        bucket: selection.bucket,
        measurements: selection.measurements,
        tags: selection.tags,
        resolved_start: this.preview.resolved_start,
        resolved_stop: this.preview.resolved_stop,
        confirm_token: this.preview.confirm_token,
      });
      this.body.innerHTML = "<p>Deleted successfully.</p>";
      this.onDeleted();
      setTimeout(() => this.close(), 800);
    } catch (error) {
      this.body.innerHTML += `<p class="status-line">Delete failed: ${error.message}</p>`;
      this.confirmButton.disabled = false;
    }
  },
};
