const AddPointModal = {
  init(onAdded) {
    this.onAdded = onAdded;
    this.overlay = document.getElementById("add-point-modal");
    this.measurementInput = document.getElementById("add-point-measurement");
    this.tagRows = document.getElementById("add-point-tag-rows");
    this.addTagButton = document.getElementById("add-point-add-tag");
    this.fieldInput = document.getElementById("add-point-field");
    this.valueInput = document.getElementById("add-point-value");
    this.typeSelect = document.getElementById("add-point-type");
    this.timeInput = document.getElementById("add-point-time");
    this.errorBox = document.getElementById("add-point-error");
    this.confirmButton = document.getElementById("add-point-confirm");
    this.cancelButton = document.getElementById("add-point-cancel");

    this.addTagButton.addEventListener("click", () => this._addTagRow());
    this.confirmButton.addEventListener("click", () => this._confirm());
    this.cancelButton.addEventListener("click", () => this.close());
  },

  open() {
    if (!State.bucket) return;
    this.errorBox.textContent = "";
    this.confirmButton.disabled = false;
    this.overlay.classList.add("open");

    const sourceRow = this._pickSourceRow();
    if (sourceRow) {
      this._prefillFromRow(sourceRow);
    } else {
      this._prefillDefaults();
    }
  },

  close() {
    this.overlay.classList.remove("open");
  },

  _pickSourceRow() {
    const selected = ResultsTable.getSelectedRows();
    if (selected.length === 0) return null;
    if (selected.length === 1) return selected[0];
    // With several rows selected there's no single "right" one to copy from -
    // the most recent point is the most likely thing the user just looked at.
    return selected.reduce((latest, row) => (new Date(row.time) > new Date(latest.time) ? row : latest));
  },

  _prefillFromRow(row) {
    this.measurementInput.value = row.measurement;
    this.tagRows.innerHTML = "";
    const tagEntries = Object.entries(row.tags);
    if (tagEntries.length === 0) {
      this._addTagRow();
    } else {
      for (const [key, value] of tagEntries) this._addTagRow(key, value);
    }
    this.fieldInput.value = row.field;
    this.valueInput.value = row.value;
    this.typeSelect.value = typeof row.value === "boolean" ? "boolean" : typeof row.value === "number" ? "number" : "string";
    this.timeInput.value = row.time;
  },

  _prefillDefaults() {
    this.measurementInput.value = "";
    this.tagRows.innerHTML = "";
    // ioBroker's influxdb history adapter tags every point with ack/from/q -
    // prefilling them with typical values saves retyping the same three tags
    // for every manually-added point.
    this._addTagRow("ack", "true");
    this._addTagRow("from", "system.admin.0");
    this._addTagRow("q", "0");
    this.fieldInput.value = "value";
    this.valueInput.value = "";
    this.typeSelect.value = "number";
    this.timeInput.value = new Date().toISOString();
  },

  _addTagRow(key = "", value = "") {
    const row = document.createElement("div");
    row.className = "tag-row";
    row.innerHTML = `
      <input type="text" class="tag-key" placeholder="tag key" />
      <input type="text" class="tag-value" placeholder="tag value" />
      <button type="button" class="remove-tag">&times;</button>
    `;
    row.querySelector(".tag-key").value = key;
    row.querySelector(".tag-value").value = value;
    row.querySelector(".remove-tag").addEventListener("click", () => row.remove());
    this.tagRows.appendChild(row);
  },

  _collectTags() {
    const tags = {};
    for (const row of this.tagRows.querySelectorAll(".tag-row")) {
      const key = row.querySelector(".tag-key").value.trim();
      const value = row.querySelector(".tag-value").value.trim();
      if (key) tags[key] = value;
    }
    return tags;
  },

  _coerceValue() {
    const raw = this.valueInput.value;
    const type = this.typeSelect.value;
    if (type === "number") {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) throw new Error("Value is not a valid number.");
      return parsed;
    }
    if (type === "boolean") {
      return raw === "true";
    }
    return raw;
  },

  async _confirm() {
    this.errorBox.textContent = "";
    const measurement = this.measurementInput.value.trim();
    const field = this.fieldInput.value.trim();
    const time = this.timeInput.value.trim();

    if (!measurement || !field || !time) {
      this.errorBox.textContent = "Measurement, field, and time are required.";
      return;
    }

    let value;
    try {
      value = this._coerceValue();
    } catch (error) {
      this.errorBox.textContent = error.message;
      return;
    }

    this.confirmButton.disabled = true;
    try {
      await Api.writePoint({
        bucket: State.bucket,
        measurement,
        tags: this._collectTags(),
        field,
        value,
        time,
      });
      this.close();
      this.onAdded();
    } catch (error) {
      this.errorBox.textContent = `Add failed: ${error.message}`;
      this.confirmButton.disabled = false;
    }
  },
};
