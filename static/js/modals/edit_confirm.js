const EditConfirmModal = {
  init(onSaved) {
    this.onSaved = onSaved;
    this.overlay = document.getElementById("edit-modal");
    this.body = document.getElementById("edit-modal-body");
    this.confirmButton = document.getElementById("edit-modal-confirm");
    this.cancelButton = document.getElementById("edit-modal-cancel");

    this.cancelButton.addEventListener("click", () => this._cancel());
    this.confirmButton.addEventListener("click", () => this._confirm());
  },

  open(cell) {
    this.cell = cell;
    this.row = cell.getRow().getData();
    this.oldValue = cell.getOldValue();
    this.newValue = cell.getValue();
    this.confirmButton.disabled = false;
    this.overlay.classList.add("open");
    this._render();
  },

  _render() {
    const tagsText = Object.entries(this.row.tags)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    this.body.innerHTML = `
      <p><strong>${this.row.measurement}</strong> (${tagsText}) - field <strong>${this.row.field}</strong> at ${this.row.time}</p>
      <p>Old value: <code>${this.oldValue}</code> &rarr; New value: <code>${this.newValue}</code></p>
    `;
  },

  _cancel() {
    this.cell.restoreOldValue();
    this.close();
  },

  close() {
    this.overlay.classList.remove("open");
  },

  async _confirm() {
    this.confirmButton.disabled = true;
    this.body.innerHTML += "<p>Saving...</p>";

    try {
      await Api.writePoint({
        bucket: State.bucket,
        measurement: this.row.measurement,
        // Field-based rows carry synthetic tags for display only; the actual
        // InfluxDB series has no tags, so write with {} to hit the right series.
        tags: this.row.storage_variant === "field-based" ? {} : this.row.tags,
        field: this.row.field,
        value: this.newValue,
        value_type: this.row.value_type,
        time: this.row.time,
      });
      this.close();
      this.onSaved();
    } catch (error) {
      this.cell.restoreOldValue();
      this.body.innerHTML += `<p class="status-line error">Save failed: ${error.message}</p>`;
      setTimeout(() => this.close(), 1500);
    }
  },
};
