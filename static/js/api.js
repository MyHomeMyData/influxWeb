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
    return Api._json(
      await fetch("/api/points/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      })
    );
  },

  async getPointDetail(pointId) {
    return Api._json(await fetch(`/api/points/${pointId}`));
  },

  exportCsvUrl(selection) {
    return `/api/export/csv?selection_json=${encodeURIComponent(JSON.stringify(selection))}`;
  },

  async _json(response) {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }
    return response.json();
  },
};
