const RetimeConfirmModal = {
  init(onRetimed) {
    this.onRetimed = onRetimed;
    this.overlay = document.getElementById("retime-confirm-modal");
    this.body = document.getElementById("retime-confirm-modal-body");
    this.confirmButton = document.getElementById("retime-confirm-modal-confirm");
    this.cancelButton = document.getElementById("retime-confirm-modal-cancel");

    this.cancelButton.addEventListener("click", () => this._cancel());
    this.confirmButton.addEventListener("click", () => this._confirm());
  },

  // points: RetimePoint[] - bucket/measurement/tags/old_time/new_time/fields,
  // already resolved (either typed directly for a single inline Time edit, or
  // computed server-side for a bulk offset/normalize operation).
  // onCancelled: optional callback run if the user cancels or the write
  // fails - used by the inline-edit path to revert the cell's displayed value.
  async open(points, onCancelled) {
    this.points = points;
    this.onCancelled = onCancelled;
    this.preview = null;
    this.confirmButton.disabled = true;
    this.overlay.classList.add("open");
    this.body.innerHTML = "<p>Loading preview...</p>";

    try {
      this.preview = await Api.previewRetime(points);
      this._renderPreview();
      this.confirmButton.disabled = this.preview.matched_count === 0;
    } catch (error) {
      this.body.innerHTML = `<p class="status-line error">Preview failed: ${error.message}</p>`;
    }
  },

  _renderPreview() {
    if (this.preview.matched_count === 0) {
      this.body.innerHTML = "<p>Nothing to retime.</p>";
      return;
    }

    const rows = this.points
      .map((point) => {
        const tagsText = Object.entries(point.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        const fieldsText = Object.entries(point.fields)
          .map(([k, entry]) => `${k}=${entry.value}`)
          .join(", ");
        return `<tr><td>${point.measurement}</td><td>${tagsText}</td><td>${fieldsText}</td><td>${point.old_time} &rarr; ${point.new_time}</td></tr>`;
      })
      .join("");

    this.body.innerHTML = `
      <p><strong>${this.preview.matched_count}</strong> point(s) will be retimed.</p>
      <table class="preview-table">
        <thead><tr><th>Measurement</th><th>Tags</th><th>Fields</th><th>Old time &rarr; New time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  _cancel() {
    this.onCancelled?.();
    this.close();
  },

  close() {
    this.overlay.classList.remove("open");
  },

  async _confirm() {
    if (!this.preview || this.preview.matched_count === 0) return;
    this.confirmButton.disabled = true;
    this.body.innerHTML += "<p>Retiming...</p>";

    try {
      await Api.executeRetime(this.points, this.preview.confirm_token);
      this.close();
      this.onRetimed(this.preview.matched_count);
    } catch (error) {
      this.onCancelled?.();
      this.body.innerHTML += `<p class="status-line error">Retime failed: ${error.message}</p>`;
      this.confirmButton.disabled = false;
    }
  },
};
