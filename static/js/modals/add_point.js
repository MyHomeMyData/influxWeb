const AddPointModal = {
  init(onAdded) {
    this.onAdded = onAdded;
    this.overlay = document.getElementById("add-point-modal");
    this.titleEl = document.getElementById("add-point-title");
    this.noteEl = document.getElementById("add-point-note");
    this.measurementInput = document.getElementById("add-point-measurement");
    this.tagRows = document.getElementById("add-point-tag-rows");
    this.addTagButton = document.getElementById("add-point-add-tag");
    this.fieldRows = document.getElementById("add-point-field-rows");
    this.addFieldButton = document.getElementById("add-point-add-field");
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
    this.addFieldButton.addEventListener("click", () => this._addFieldRow());
    this.confirmButton.addEventListener("click", () => this._confirm());
    this.cancelButton.addEventListener("click", () => this.close());
  },

  open() {
    if (!State.bucket) return;
    this.titleEl.textContent = "Add point";
    this.noteEl.style.display = "none";
    this.errorBox.textContent = "";
    this.confirmButton.disabled = false;
    this.overlay.classList.add("open");

    const point = this._pickSourcePoint();
    if (point) {
      this._prefillFromPoint(point);
    } else {
      this._prefillDefaults();
    }
  },

  // Duplicates the single point currently marked in the table into an
  // editable copy of this same form - unlike open(), which falls back to a
  // blank form or silently picks the latest of several selected points, this
  // requires exactly one marked point and reports an inline error otherwise,
  // since "duplicate" only makes sense for one specific source point.
  //
  // Crucially, the source point is built via ResultsTable.groupIntoPoints()
  // rather than reading a single selected row directly: with "Group fields
  // by point" on, a marked row expands back into several raw per-field rows
  // (one per field, e.g. ack/from/q/value) - grouping them by
  // measurement+tags+time merges those back into one point with every field,
  // instead of arbitrarily picking just one of them as the source.
  openDuplicate() {
    if (!State.bucket) return;
    this.titleEl.textContent = "Duplicate point";
    this.errorBox.textContent = "";
    this.confirmButton.disabled = false;
    this.overlay.classList.add("open");

    const selectedRows = ResultsTable.getSelectedRows();
    const points = ResultsTable.groupIntoPoints(selectedRows);

    if (points.length === 0) {
      this._prefillDefaults();
      this.noteEl.style.display = "none";
      this.errorBox.textContent = "Select exactly one row (point) to duplicate first.";
      this.confirmButton.disabled = true;
      return;
    }
    if (points.length > 1) {
      this._prefillDefaults();
      this.noteEl.style.display = "none";
      this.errorBox.textContent = "Select exactly one row (point) - multiple points are currently marked.";
      this.confirmButton.disabled = true;
      return;
    }

    this.noteEl.style.display = "";
    this.noteEl.textContent =
      "This is a copy of the selected point, including all of its fields. Change the time (and any " +
      "values as needed) before saving - saving with the time unchanged will overwrite the original " +
      "point instead of creating a new one.";
    this._prefillFromPoint(points[0]);
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
  },

  // Groups the currently selected rows into points (measurement+tags+time,
  // with every field of each point merged together) - so callers never deal
  // with raw per-field rows directly. Returns null if nothing is selected;
  // with several distinct points selected, falls back to the latest one as a
  // prefill convenience (openDuplicate() above overrides this with a strict
  // single-point requirement instead).
  _pickSourcePoint() {
    const selected = ResultsTable.getSelectedRows();
    if (selected.length === 0) return null;
    const points = ResultsTable.groupIntoPoints(selected);
    if (points.length === 1) return points[0];
    return points.reduce((latest, point) => (new Date(point.time) > new Date(latest.time) ? point : latest));
  },

  _prefillFromPoint(point) {
    this.measurementInput.value = point.measurement;
    const isFieldBased = point.storage_variant === "field-based" || this._isIoBrokerFieldBased(point.measurement);
    this._showForm(isFieldBased);
    const fields = point.fields ?? {};

    if (isFieldBased) {
      // fields carries every field of the point (ack/from/q/value) typed as
      // {value, value_type} - save it so _writeFieldBased can use the correct
      // InfluxDB types rather than hardcoded guesses.
      this._metaFieldTypes = fields;
      this.ackSelect.value = fields.ack ? String(fields.ack.value) : "true";
      this.fromInput.value = fields.from ? String(fields.from.value) : "system.adapter.admin.0";
      this.qInput.value = fields.q !== undefined ? String(fields.q.value) : "0";
      const valueEntry = fields.value;
      this.valueInput.value = valueEntry ? valueEntry.value : "";
      this.typeSelect.value = valueEntry ? valueEntry.value_type : "float";
    } else {
      this.tagRows.innerHTML = "";
      const tagEntries = Object.entries(point.tags ?? {});
      if (tagEntries.length === 0) {
        this._addTagRow();
      } else {
        for (const [key, value] of tagEntries) this._addTagRow(key, value);
      }

      this.fieldRows.innerHTML = "";
      const fieldEntries = Object.entries(fields);
      if (fieldEntries.length === 0) {
        this._addFieldRow("value", "", "float");
      } else {
        for (const [name, entry] of fieldEntries) this._addFieldRow(name, entry.value, entry.value_type);
      }
    }
    this.timeInput.value = point.time;
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
      this.valueInput.value = "";
      this.typeSelect.value = "float";
    } else {
      this.tagRows.innerHTML = "";
      // ioBroker's influxdb history adapter tags every point with ack/from/q -
      // prefilling them with typical values saves retyping the same three tags
      // for every manually-added point.
      this._addTagRow("ack", "true");
      this._addTagRow("from", "system.admin.0");
      this._addTagRow("q", "0");

      this.fieldRows.innerHTML = "";
      this._addFieldRow("value", "", "float");
    }
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

  _addFieldRow(field = "", value = "", type = "float") {
    const row = document.createElement("div");
    row.className = "field-row";
    row.innerHTML = `
      <input type="text" class="field-name" placeholder="field name" />
      <input type="text" class="field-value" placeholder="value" />
      <select class="field-type">
        <option value="float">float</option>
        <option value="int">int</option>
        <option value="bool">boolean</option>
        <option value="string">string</option>
      </select>
      <button type="button" class="remove-field">&times;</button>
    `;
    row.querySelector(".field-name").value = field;
    row.querySelector(".field-value").value = value;
    row.querySelector(".field-type").value = type;
    row.querySelector(".remove-field").addEventListener("click", () => row.remove());
    this.fieldRows.appendChild(row);
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

  // Returns one {field, value, value_type} entry per non-blank field row.
  // Throws if a row is missing its field name or has an unparseable value,
  // naming the field so the error is traceable when several rows are edited
  // at once.
  _collectFieldRows() {
    const entries = [];
    for (const row of this.fieldRows.querySelectorAll(".field-row")) {
      const field = row.querySelector(".field-name").value.trim();
      const type = row.querySelector(".field-type").value;
      const raw = row.querySelector(".field-value").value;
      if (!field && raw === "") continue; // fully blank row - not an error, just skip it
      if (!field) throw new Error("Every field row needs a field name.");
      let value;
      try {
        value = this._coerceValueRaw(raw, type);
      } catch (error) {
        throw new Error(`Field "${field}": ${error.message}`);
      }
      entries.push({ field, value, value_type: type });
    }
    return entries;
  },

  _coerceValueRaw(raw, type) {
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

  _coerceValue() {
    return this._coerceValueRaw(this.valueInput.value, this.typeSelect.value);
  },

  async _confirm() {
    this.errorBox.textContent = "";
    const measurement = this.measurementInput.value.trim();
    const time = this.timeInput.value.trim();

    if (!measurement || !time) {
      this.errorBox.textContent = "Measurement and time are required.";
      return;
    }

    const isFieldBased = this._isIoBrokerFieldBased(measurement);
    let value;
    let fieldEntries;
    try {
      if (isFieldBased) {
        value = this._coerceValue();
      } else {
        fieldEntries = this._collectFieldRows();
        if (fieldEntries.length === 0) {
          throw new Error("At least one field is required.");
        }
      }
    } catch (error) {
      this.errorBox.textContent = error.message;
      return;
    }

    this.confirmButton.disabled = true;
    try {
      if (isFieldBased) {
        await this._writeFieldBased(measurement, value, time);
      } else {
        const tags = this._collectTags();
        for (const entry of fieldEntries) {
          await Api.writePoint({
            bucket: State.bucket,
            measurement,
            tags,
            field: entry.field,
            value: entry.value,
            value_type: entry.value_type,
            time,
          });
        }
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
    // Use the exact types from _metaFieldTypes (read from the source point) so
    // we don't conflict with an existing InfluxDB field type (e.g. q stored as
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
