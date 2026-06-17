const State = {
  bucket: null,
  rangeStart: "-24h",
  rangeStop: "now()",
  measurements: [],
  tags: {},

  toSelection() {
    return {
      bucket: this.bucket,
      start: this.rangeStart,
      stop: this.rangeStop,
      measurements: [...this.measurements],
      tags: Object.fromEntries(
        Object.entries(this.tags).map(([key, values]) => [key, [...values]])
      ),
    };
  },

  clearSelection() {
    this.measurements = [];
    this.tags = {};
  },

  toggleMeasurement(name) {
    const index = this.measurements.indexOf(name);
    if (index >= 0) {
      this.measurements.splice(index, 1);
    } else {
      this.measurements.push(name);
    }
  },

  toggleTagValue(tagKey, value) {
    if (!this.tags[tagKey]) this.tags[tagKey] = [];
    const values = this.tags[tagKey];
    const index = values.indexOf(value);
    if (index >= 0) {
      values.splice(index, 1);
      if (values.length === 0) delete this.tags[tagKey];
    } else {
      values.push(value);
    }
  },

  isMeasurementSelected(name) {
    return this.measurements.includes(name);
  },

  isTagValueSelected(tagKey, value) {
    return (this.tags[tagKey] || []).includes(value);
  },
};
