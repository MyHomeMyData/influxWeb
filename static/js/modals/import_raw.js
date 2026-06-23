const ImportRawModal = {
  init(onImported) {
    this.onImported = onImported;
    this.overlay = document.getElementById("import-raw-modal");
    this.bucketName = document.getElementById("import-raw-bucket-name");
    this.fileInput = document.getElementById("import-raw-file");
    this.errorBox = document.getElementById("import-raw-modal-error");
    this.confirmButton = document.getElementById("import-raw-modal-confirm");
    this.cancelButton = document.getElementById("import-raw-modal-cancel");

    this.fileInput.addEventListener("change", () => {
      this.confirmButton.disabled = this.fileInput.files.length === 0;
    });
    this.confirmButton.addEventListener("click", () => this._confirm());
    this.cancelButton.addEventListener("click", () => this.close());
  },

  open() {
    if (!State.bucket) return;
    this.bucketName.textContent = State.bucket;
    this.fileInput.value = "";
    this.errorBox.textContent = "";
    this.confirmButton.disabled = true;
    this.overlay.classList.add("open");
  },

  close() {
    this.overlay.classList.remove("open");
  },

  async _confirm() {
    const file = this.fileInput.files[0];
    if (!file) return;
    this.confirmButton.disabled = true;
    this.errorBox.textContent = "Importing...";
    this.errorBox.className = "status-line";

    try {
      const result = await Api.importRaw(file, State.bucket);
      this.close();
      this.onImported(result);
    } catch (error) {
      this.errorBox.textContent = `Import failed: ${error.message}`;
      this.errorBox.className = "status-line error";
      this.confirmButton.disabled = false;
    }
  },
};
