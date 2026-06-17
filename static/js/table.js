const ResultsTable = {
  init(onRowClick) {
    this.onRowClick = onRowClick;
    this.tabulator = new Tabulator("#results-table", {
      layout: "fitDataStretch",
      height: "65vh",
      pagination: true,
      paginationSize: 50,
      paginationSizeSelector: [20, 50, 100, true],
      columns: [{ title: "Measurement", field: "measurement" }],
      data: [],
    });

    this.tabulator.on("rowClick", (event, row) => this.onRowClick(row.getData()));
  },

  setRows(rows) {
    const tagKeys = [];
    for (const row of rows) {
      for (const key of Object.keys(row.tags)) {
        if (!tagKeys.includes(key)) tagKeys.push(key);
      }
    }

    const columns = [
      { title: "Measurement", field: "measurement" },
      ...tagKeys.map((key) => ({ title: key, field: `tag_${key}` })),
      { title: "Field", field: "field" },
      { title: "Value", field: "value" },
      { title: "Time", field: "time", sorter: "string" },
    ];

    const data = rows.map((row) => {
      const flat = { ...row };
      for (const key of tagKeys) flat[`tag_${key}`] = row.tags[key] ?? "";
      return flat;
    });

    this.tabulator.setColumns(columns);
    this.tabulator.setData(data);
  },
};
