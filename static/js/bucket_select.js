const BucketSelect = {
  async init(onBucketChanged) {
    this.select = document.getElementById("bucket-select");
    this.rangeStartInput = document.getElementById("range-start");
    this.rangeStopInput = document.getElementById("range-stop");
    this.onBucketChanged = onBucketChanged;

    const buckets = await Api.getBuckets();
    this.select.innerHTML = "";
    for (const bucket of buckets) {
      if (bucket.name.startsWith("_")) continue;
      const option = document.createElement("option");
      option.value = bucket.name;
      option.textContent = bucket.name;
      this.select.appendChild(option);
    }

    this.select.addEventListener("change", () => this._applyBucket());
    this.rangeStartInput.addEventListener("change", () => this._applyRange());
    this.rangeStopInput.addEventListener("change", () => this._applyRange());

    if (buckets.length > 0) {
      this._applyBucket();
    }
  },

  _applyBucket() {
    State.bucket = this.select.value;
    State.measurements = [];
    State.tags = {};
    this.onBucketChanged();
  },

  _applyRange() {
    State.rangeStart = this.rangeStartInput.value || "-24h";
    State.rangeStop = this.rangeStopInput.value || "now()";
  },

  setPreset(start) {
    this.rangeStartInput.value = start;
    this.rangeStopInput.value = "now()";
    this._applyRange();
  },
};
