function computeStats(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.measurement}|${row.field}`;
    if (!groups.has(key)) {
      groups.set(key, { measurement: row.measurement, field: row.field, count: 0, numeric: [] });
    }
    const group = groups.get(key);
    group.count += 1;
    if (row.value_type === "float" || row.value_type === "int") {
      group.numeric.push(row.value);
    }
  }

  return [...groups.values()].map((group) => {
    const stats = { measurement: group.measurement, field: group.field, count: group.count };
    if (group.numeric.length > 0) {
      const n = group.numeric.length;
      const mean = group.numeric.reduce((sum, value) => sum + value, 0) / n;
      // Population variance (divide by n, not n-1) - this describes the
      // data actually loaded, not a sample standing in for a larger
      // population, so Bessel's correction doesn't apply here.
      const variance = group.numeric.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
      stats.min = Math.min(...group.numeric);
      stats.max = Math.max(...group.numeric);
      stats.mean = mean;
      stats.stddev = Math.sqrt(variance);
    }
    return stats;
  });
}

function formatStatNumber(cell) {
  const value = cell.getValue();
  return value === undefined ? "" : value.toFixed(3);
}

const StatsTable = {
  lastRows: [],

  // Constructing Tabulator against a container that's still display:none
  // (true at page load, since Data View shows first) leaves it unable to
  // measure the container - it ends up rendering nothing at all, and a
  // later redraw() doesn't reliably fix that. So this is only called once
  // the container has actually become visible (see main.js's setView()),
  // never eagerly at page load.
  ensureInitialized() {
    if (this.tabulator) return;
    this.tabulator = new Tabulator("#stats-table", {
      layout: "fitDataStretch",
      height: "65vh",
      columns: [
        { title: "Measurement", field: "measurement" },
        { title: "Field", field: "field" },
        { title: "Count", field: "count", sorter: "number" },
        { title: "Min", field: "min", sorter: "number", formatter: formatStatNumber },
        { title: "Max", field: "max", sorter: "number", formatter: formatStatNumber },
        { title: "Mean", field: "mean", sorter: "number", formatter: formatStatNumber },
        { title: "StdDev", field: "stddev", sorter: "number", formatter: formatStatNumber },
      ],
      data: computeStats(this.lastRows),
    });
  },

  setRows(rows) {
    this.lastRows = rows;
    if (this.tabulator) {
      this.tabulator.setData(computeStats(rows));
    }
  },
};
