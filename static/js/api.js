const Api = {
  async getBuckets() {
    return Api._json(await fetch("/api/buckets"));
  },

  async getMeasurements(bucket, rangeStart) {
    const url = `/api/buckets/${encodeURIComponent(bucket)}/measurements?range_start=${encodeURIComponent(rangeStart)}`;
    return Api._json(await fetch(url));
  },

  async getTagKeys(bucket, measurement, rangeStart) {
    const params = new URLSearchParams({ range_start: rangeStart });
    if (measurement) params.set("measurement", measurement);
    return Api._json(await fetch(`/api/buckets/${encodeURIComponent(bucket)}/tags?${params}`));
  },

  async getTagValues(bucket, tagKey, measurement, rangeStart) {
    const params = new URLSearchParams({ range_start: rangeStart });
    if (measurement) params.set("measurement", measurement);
    const url = `/api/buckets/${encodeURIComponent(bucket)}/tags/${encodeURIComponent(tagKey)}/values?${params}`;
    return Api._json(await fetch(url));
  },

  async queryPoints(selection) {
    return Api._post("/api/points/query", selection);
  },

  async getPointDetail(pointId) {
    return Api._json(await fetch(`/api/points/${pointId}`));
  },

  exportCsvUrl(selection) {
    return `/api/export/csv?selection_json=${encodeURIComponent(JSON.stringify(selection))}`;
  },

  async previewDelete(selection) {
    return Api._post("/api/delete/preview", selection);
  },

  async executeDelete(payload) {
    return Api._post("/api/delete/execute", payload);
  },

  async _post(url, body) {
    return Api._json(
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  },

  async _json(response) {
    if (!response.ok) {
      let message = await response.text();
      try {
        message = JSON.parse(message).detail ?? message;
      } catch {
        // not JSON, keep raw text
      }
      throw new Error(message);
    }
    return response.json();
  },
};
