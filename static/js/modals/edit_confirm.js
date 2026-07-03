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
    this.mode = "edit";
    this.cell = cell;
    this.row = cell.getRow().getData();
    this.oldValue = cell.getOldValue();
    this.newValue = cell.getValue();
    this.confirmButton.disabled = false;
    this.overlay.classList.add("open");
    this._render();
  },

  openRetag(retagInfo) {
    this.mode = "retag";
    this.cell = retagInfo.cell;
    this.retagInfo = retagInfo;
    this.confirmButton.disabled = false;
    this.overlay.classList.add("open");
    this._renderRetag();
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

  _renderRetag() {
    const { measurement, oldTags, tagKey, oldTagValue, newTagValue, time } = this.retagInfo;
    const tagsText = Object.entries(oldTags).map(([k, v]) => `${k}=${v}`).join(", ");
    this.body.innerHTML = `
      <p><strong>${measurement}</strong> (${tagsText}) at ${time}</p>
      <p>Tag <strong>${tagKey}</strong>: <code>${oldTagValue}</code> &rarr; <code>${newTagValue}</code></p>
      <p>A new point with the updated tag will be written; the old one will be deleted.</p>
    `;
  },

  _cancel() {
    this.cell.restoreOldValue();
    this.mode = null;
    this.retagInfo = null;
    this.close();
  },

  close() {
    this.overlay.classList.remove("open");
  },

  async _confirm() {
    this.confirmButton.disabled = true;
    this.body.innerHTML += "<p>Saving...</p>";
    if (this.mode === "retag") {
      await this._confirmRetag();
    } else {
      await this._confirmEdit();
    }
  },

  async _confirmEdit() {
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

  async _confirmRetag() {
    const { measurement, oldTags, newTags, field, value, value_type, time } = this.retagInfo;
    try {
      // Write new point first (same pattern as retime: write before delete to
      // avoid data loss if the second step fails).
      await Api.writePoint({ bucket: State.bucket, measurement, tags: newTags, field, value, value_type, time });
      // Delete old point via the existing two-step preview/execute path.
      // PointRef needs bucket + measurement + tags + time (no field/value).
      const oldPoint = { bucket: State.bucket, measurement, tags: oldTags, time, storage_variant: "tag-based" };
      const preview = await Api.previewDeleteSelected([oldPoint]);
      await Api.executeDeleteSelected([oldPoint], preview.confirm_token);
      this.close();
      this.onSaved();
    } catch (error) {
      this.cell.restoreOldValue();
      this.body.innerHTML += `<p class="status-line error">Save failed: ${error.message}</p>`;
      setTimeout(() => this.close(), 1500);
    }
  },
};
