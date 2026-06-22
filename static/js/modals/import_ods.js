const ImportOdsModal = {
  init(onImported) {
    this.onImported = onImported;
    this.overlay = document.getElementById("import-modal");
    this.fileInput = document.getElementById("import-file");
    this.body = document.getElementById("import-modal-body");
    this.confirmButton = document.getElementById("import-modal-confirm");
    this.cancelButton = document.getElementById("import-modal-cancel");

    this.fileInput.addEventListener("change", () => this._preview());
    this.confirmButton.addEventListener("click", () => this._confirm());
    this.cancelButton.addEventListener("click", () => this.close());
  },

  open() {
    this.file = null;
    this.preview = null;
    this.fileInput.value = "";
    this.confirmButton.disabled = true;
    this.body.innerHTML = "<p>Choose an ODS file exported from this app.</p>";
    this.overlay.classList.add("open");
  },

  close() {
    this.overlay.classList.remove("open");
  },

  async _preview() {
    this.file = this.fileInput.files[0] ?? null;
    this.preview = null;
    this.confirmButton.disabled = true;
    if (!this.file) {
      this.body.innerHTML = "<p>Choose an ODS file exported from this app.</p>";
      return;
    }

    this.body.innerHTML = "<p>Reading file...</p>";
    try {
      this.preview = await Api.importOds(this.file, true);
      this._renderPreview();
      this.confirmButton.disabled = this.preview.valid_rows === 0;
    } catch (error) {
      this.body.innerHTML = `<p class="status-line error">Could not read this file: ${error.message}</p>`;
    }
  },

  _renderPreview() {
    const preview = this.preview;
    const bucketWarning =
      State.bucket && !preview.buckets.includes(State.bucket)
        ? `<p class="status-line error">Warning: this file references bucket(s)
           ${preview.buckets.join(", ") || "(none)"}, not the currently selected
           bucket "${State.bucket}".</p>`
        : "";

    const sampleRows = preview.sample
      .map((point) => {
        const tagsText = Object.entries(point.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        return `<tr><td>${point.bucket}</td><td>${point.measurement}</td><td>${tagsText}</td><td>${point.field}</td><td>${point.value}</td><td>${point.value_type}</td><td>${point.time}</td></tr>`;
      })
      .join("");
    const sampleNote =
      preview.valid_rows > preview.sample.length
        ? `<p class="status-line">Showing the first ${preview.sample.length} of ${preview.valid_rows} valid row(s).</p>`
        : "";

    const errorRows = preview.errors
      .map((error) => `<tr><td>${error.row_number}</td><td>${error.reason}</td></tr>`)
      .join("");
    const errorsSection =
      preview.errors.length > 0
        ? `<p class="status-line error">${preview.errors.length} row(s) will be skipped:</p>
           <table class="preview-table">
             <thead><tr><th>Row</th><th>Reason</th></tr></thead>
             <tbody>${errorRows}</tbody>
           </table>`
        : "";

    this.body.innerHTML = `
      ${bucketWarning}
      <p><strong>${preview.valid_rows}</strong> of ${preview.total_rows} row(s) are valid and will be written.</p>
      <table class="preview-table">
        <thead><tr><th>Bucket</th><th>Measurement</th><th>Tags</th><th>Field</th><th>Value</th><th>Type</th><th>Time</th></tr></thead>
        <tbody>${sampleRows}</tbody>
      </table>
      ${sampleNote}
      ${errorsSection}
    `;
  },

  async _confirm() {
    if (!this.file || !this.preview || this.preview.valid_rows === 0) return;
    this.confirmButton.disabled = true;
    this.body.innerHTML += "<p>Importing...</p>";

    try {
      const result = await Api.importOds(this.file, false);
      this.close();
      this.onImported(result);
    } catch (error) {
      this.body.innerHTML += `<p class="status-line error">Import failed: ${error.message}</p>`;
      this.confirmButton.disabled = false;
    }
  },
};
