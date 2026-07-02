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

    this.defaultForm = document.getElementById("add-point-default-form");
    this.ioBrokerForm = document.getElementById("add-point-iobroker-form");
    this.ackSelect = document.getElementById("add-point-ack");
    this.fromInput = document.getElementById("add-point-from");
    this.qInput = document.getElementById("add-point-q");

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

  _isIoBrokerFieldBased(measurement) {
    return appMode === "iobroker" && fieldBasedMeasurements.has(measurement);
  },

  _showForm(isFieldBased) {
    this.defaultForm.style.display = isFieldBased ? "none" : "";
    this.ioBrokerForm.style.display = isFieldBased ? "" : "none";
    if (isFieldBased) {
      this.fieldInput.value = "value";
    }
  },

  _pickSourceRow() {
    const selected = ResultsTable.getSelectedRows();
    if (selected.length === 0) return null;
    if (selected.length === 1) return selected[0];
    return selected.reduce((latest, row) => (new Date(row.time) > new Date(latest.time) ? row : latest));
  },

  _prefillFromRow(row) {
    this.measurementInput.value = row.measurement;
    const isFieldBased = this._isIoBrokerFieldBased(row.measurement);
    this._showForm(isFieldBased);

    if (isFieldBased) {
      // Synthetic tags on the row hold ack/from/q as display strings.
      // extra_fields carries the typed originals — save them so _writeFieldBased
      // can use the correct InfluxDB types rather than hardcoded guesses.
      this._metaFieldTypes = row.extra_fields ?? null;
      this.ackSelect.value = row.tags.ack ?? "true";
      this.fromInput.value = row.tags.from ?? "system.adapter.admin.0";
      this.qInput.value = row.tags.q ?? "0";
    } else {
      this.tagRows.innerHTML = "";
      const tagEntries = Object.entries(row.tags);
      if (tagEntries.length === 0) {
        this._addTagRow();
      } else {
        for (const [key, value] of tagEntries) this._addTagRow(key, value);
      }
      this.fieldInput.value = row.field;
    }
    this.valueInput.value = row.value;
    this.typeSelect.value = row.value_type;
    this.timeInput.value = row.time;
  },

  _prefillDefaults() {
    this.measurementInput.value = "";
    this._metaFieldTypes = null;
    const isFieldBased = appMode === "iobroker";
    this._showForm(isFieldBased);

    if (isFieldBased) {
      this.ackSelect.value = "true";
      this.fromInput.value = "system.adapter.admin.0";
      this.qInput.value = "0";
    } else {
      this.tagRows.innerHTML = "";
      // ioBroker's influxdb history adapter tags every point with ack/from/q -
      // prefilling them with typical values saves retyping the same three tags
      // for every manually-added point.
      this._addTagRow("ack", "true");
      this._addTagRow("from", "system.admin.0");
      this._addTagRow("q", "0");
      this.fieldInput.value = "value";
    }
    this.valueInput.value = "";
    this.typeSelect.value = "float";
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
    if (type === "float" || type === "int") {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) throw new Error("Value is not a valid number.");
      return type === "int" ? Math.trunc(parsed) : parsed;
    }
    if (type === "bool") {
      return raw === "true";
    }
    return raw;
  },

  async _confirm() {
    this.errorBox.textContent = "";
    const measurement = this.measurementInput.value.trim();
    const time = this.timeInput.value.trim();

    if (!measurement || !time) {
      this.errorBox.textContent = "Measurement and time are required.";
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
      const isFieldBased = this._isIoBrokerFieldBased(measurement);
      if (isFieldBased) {
        await this._writeFieldBased(measurement, value, time);
      } else {
        const field = this.fieldInput.value.trim();
        if (!field) {
          this.errorBox.textContent = "Field is required.";
          this.confirmButton.disabled = false;
          return;
        }
        await Api.writePoint({
          bucket: State.bucket,
          measurement,
          tags: this._collectTags(),
          field,
          value,
          value_type: this.typeSelect.value,
          time,
        });
      }
      this.close();
      this.onAdded();
    } catch (error) {
      this.errorBox.textContent = `Add failed: ${error.message}`;
      this.confirmButton.disabled = false;
    }
  },

  async _writeFieldBased(measurement, value, time) {
    // Field-based storage: ack/from/q/value are all InfluxDB fields (no tags).
    // Writing them as 4 separate single-field calls is safe: InfluxDB merges
    // writes to the same series+timestamp, so all 4 fields end up in one point.
    //
    // Use the exact types from extra_fields (read from the source row) so we
    // don't conflict with an existing InfluxDB field type (e.g. q stored as
    // float in some installations instead of int).
    const ackType = this._metaFieldTypes?.ack?.value_type ?? "bool";
    const fromType = this._metaFieldTypes?.from?.value_type ?? "string";
    const qType = this._metaFieldTypes?.q?.value_type ?? "float";

    const qRaw = this.qInput.value;
    const qValue = qType === "int" ? parseInt(qRaw, 10) : parseFloat(qRaw);

    const writes = [
      { field: "value", value, value_type: this.typeSelect.value },
      { field: "ack", value: this.ackSelect.value === "true", value_type: ackType },
      { field: "from", value: this.fromInput.value.trim(), value_type: fromType },
      { field: "q", value: qValue, value_type: qType },
    ];
    for (const w of writes) {
      await Api.writePoint({
        bucket: State.bucket,
        measurement,
        tags: {},
        field: w.field,
        value: w.value,
        value_type: w.value_type,
        time,
      });
    }
  },
};
