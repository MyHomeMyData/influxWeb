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

  async exportOdsSelectedBlob(bucket, points) {
    const response = await fetch("/api/export/ods/selected", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, points }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.blob();
  },

  async previewDeleteSelected(points) {
    return Api._post("/api/delete/points/preview", { points });
  },

  async executeDeleteSelected(points, confirmToken) {
    return Api._post("/api/delete/points/execute", { points, confirm_token: confirmToken });
  },

  async writePoint(point) {
    return Api._json(
      await fetch("/api/points", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(point),
      })
    );
  },

  async computeRetimeOffset(points, amount, unit) {
    return Api._post("/api/retime/offset/compute", { points, amount, unit });
  },

  async computeRetimeNormalize(points, granularity) {
    return Api._post("/api/retime/normalize/compute", { points, granularity });
  },

  async previewRetime(points) {
    return Api._post("/api/retime/preview", { points });
  },

  async executeRetime(points, confirmToken) {
    return Api._post("/api/retime/execute", { points, confirm_token: confirmToken });
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
