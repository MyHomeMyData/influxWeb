const RetimeBulkModal = {
  init() {
    this.overlay = document.getElementById("retime-modal");
    this.modeOffset = document.getElementById("retime-mode-offset");
    this.modeNormalize = document.getElementById("retime-mode-normalize");
    this.offsetFields = document.getElementById("retime-offset-fields");
    this.normalizeFields = document.getElementById("retime-normalize-fields");
    this.amountInput = document.getElementById("retime-offset-amount");
    this.unitSelect = document.getElementById("retime-offset-unit");
    this.granularitySelect = document.getElementById("retime-normalize-granularity");
    this.errorBox = document.getElementById("retime-modal-error");
    this.confirmButton = document.getElementById("retime-modal-confirm");
    this.cancelButton = document.getElementById("retime-modal-cancel");

    this.modeOffset.addEventListener("change", () => this._updateModeVisibility());
    this.modeNormalize.addEventListener("change", () => this._updateModeVisibility());
    this.confirmButton.addEventListener("click", () => this._submit());
    this.cancelButton.addEventListener("click", () => this.close());
  },

  open() {
    if (!State.bucket) return;
    this.errorBox.textContent = "";
    this.confirmButton.disabled = false;
    this.modeOffset.checked = true;
    this._updateModeVisibility();
    this.overlay.classList.add("open");
  },

  close() {
    this.overlay.classList.remove("open");
  },

  _updateModeVisibility() {
    const isOffset = this.modeOffset.checked;
    this.offsetFields.style.display = isOffset ? "" : "none";
    this.normalizeFields.style.display = isOffset ? "none" : "";
  },

  async _submit() {
    this.errorBox.textContent = "";
    const selectedRows = ResultsTable.getSelectedRows();
    // Same convention as Export/Delete: nothing selected acts on every row
    // currently loaded in the table.
    const rows = selectedRows.length > 0 ? selectedRows : ResultsTable.getAllRows();
    const groups = ResultsTable.groupIntoPoints(rows).map((group) => ({ bucket: State.bucket, ...group }));

    if (groups.length === 0) {
      this.errorBox.textContent = "Nothing to retime.";
      return;
    }

    this.confirmButton.disabled = true;
    try {
      let resolved;
      if (this.modeOffset.checked) {
        const amount = Number(this.amountInput.value);
        if (!Number.isInteger(amount)) throw new Error("Offset amount must be a whole number.");
        resolved = await Api.computeRetimeOffset(groups, amount, this.unitSelect.value);
      } else {
        resolved = await Api.computeRetimeNormalize(groups, this.granularitySelect.value);
      }
      this.close();
      RetimeConfirmModal.open(resolved.points);
    } catch (error) {
      this.errorBox.textContent = `Could not compute new times: ${error.message}`;
    } finally {
      this.confirmButton.disabled = false;
    }
  },
};
