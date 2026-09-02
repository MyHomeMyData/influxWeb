// "Add value" is a narrow, single-purpose sibling of AddPointModal: it exists
// specifically to repair a point where ioBroker's field-based storage wrote
// ack/from/q but the "value" field is missing (e.g. it was written at a
// slightly different timestamp and landed in a different point/group - see
// the grouping logic in iobroker.js/group_field_based_rows()). Rather than
// re-entering measurement/tags/time by hand in AddPointModal, this reuses
// whatever single point is currently marked in the table and only asks for
// the value itself.
const AddValueModal = {
  init(onAdded) {
    this.onAdded = onAdded;
    this.overlay = document.getElementById("add-value-modal");
    this.summaryBox = document.getElementById("add-value-summary");
    this.valueInput = document.getElementById("add-value-value");
    this.typeSelect = document.getElementById("add-value-type");
    this.errorBox = document.getElementById("add-value-error");
    this.confirmButton = document.getElementById("add-value-confirm");
    this.cancelButton = document.getElementById("add-value-cancel");

    this.confirmButton.addEventListener("click", () => this._confirm());
    this.cancelButton.addEventListener("click", () => this.close());
  },

  open() {
    this.errorBox.textContent = "";
    this.confirmButton.disabled = false;
    this.overlay.classList.add("open");
    this._point = null;

    const point = this._pickTargetPoint();
    if (!point) return;

    this._point = point;
    this._renderSummary(point);
    this.valueInput.value = "";
    this.typeSelect.value = "float";
    this.valueInput.focus();
  },

  close() {
    this.overlay.classList.remove("open");
  },

  // Requires exactly one marked point (one row in grouped view, or every raw
  // field row sharing a measurement+tags+time in ungrouped view) that doesn't
  // already carry a "value" field. Any other case is reported inline instead
  // of opening a half-usable form.
  _pickTargetPoint() {
    const selectedRows = ResultsTable.getSelectedRows();
    const selectedPoints = ResultsTable.groupIntoPoints(selectedRows);

    if (selectedPoints.length === 0) {
      this._showSelectionError("Select exactly one row (point) in the table first.");
      return null;
    }
    if (selectedPoints.length > 1) {
      this._showSelectionError("Select exactly one row (point) - multiple points are currently marked.");
      return null;
    }

    // Re-derive the full point from every currently loaded row sharing this
    // measurement+tags+time, not just the selected one(s) - a user may have
    // only marked a single sibling row (e.g. just "ack"), which would
    // otherwise hide an already-existing "value" field on the same point
    // and risk silently overwriting it.
    const picked = selectedPoints[0];
    const point = ResultsTable.findPointGroup(picked.measurement, picked.tags, picked.time) ?? picked;

    if (point.fields && Object.prototype.hasOwnProperty.call(point.fields, "value")) {
      this._showSelectionError(
        "This point already has a value field - double-click its Value cell to edit it instead."
      );
      return null;
    }
    return point;
  },

  _showSelectionError(message) {
    this.summaryBox.innerHTML = "";
    this.errorBox.textContent = message;
    this.confirmButton.disabled = true;
  },

  _renderSummary(point) {
    const isFieldBased = point.storage_variant === "field-based";
    const tagsText =
      Object.entries(point.tags ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join(", ") || "(none)";
    this.summaryBox.innerHTML = `
      <div><strong>Measurement:</strong> ${point.measurement}</div>
      <div><strong>Time:</strong> ${point.time}</div>
      <div><strong>Tags:</strong> ${isFieldBased ? "(field-based, no InfluxDB tags)" : tagsText}</div>
    `;
  },

  _coerceValue(raw, type) {
    if (type === "float" || type === "int") {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) throw new Error("Value is not a valid number.");
      return type === "int" ? Math.trunc(parsed) : parsed;
    }
    if (type === "bool") return raw === "true";
    return raw;
  },

  async _confirm() {
    if (!this._point) return;
    this.errorBox.textContent = "";

    let value;
    try {
      value = this._coerceValue(this.valueInput.value, this.typeSelect.value);
    } catch (error) {
      this.errorBox.textContent = error.message;
      return;
    }

    this.confirmButton.disabled = true;
    try {
      const isFieldBased = this._point.storage_variant === "field-based";
      await Api.writePoint({
        bucket: State.bucket,
        measurement: this._point.measurement,
        // Field-based ioBroker storage has no real InfluxDB tags - matches
        // the write pattern already used by AddPointModal._writeFieldBased()
        // and execute_retime() on the backend.
        tags: isFieldBased ? {} : this._point.tags,
        field: "value",
        value,
        value_type: this.typeSelect.value,
        time: this._point.time,
      });
      this.close();
      this.onAdded();
    } catch (error) {
      this.errorBox.textContent = `Add failed: ${error.message}`;
      this.confirmButton.disabled = false;
    }
  },
};
