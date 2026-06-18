const ResultsTable = {
  init(onSelectionChanged) {
    this.onSelectionChanged = onSelectionChanged ?? (() => {});
    this.tabulator = new Tabulator("#results-table", {
      layout: "fitDataStretch",
      height: "65vh",
      pagination: true,
      paginationSize: 50,
      paginationSizeSelector: [20, 50, 100, true],
      selectableRows: true,
      selectableRowsRangeMode: "click",
      columns: [{ title: "Measurement", field: "measurement" }],
      data: [],
    });

    this.tabulator.on("rowSelectionChanged", (data) => this.onSelectionChanged(data));
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

  getSelectedRows() {
    return this.tabulator.getSelectedData();
  },

  getAllRows() {
    return this.tabulator.getData();
  },
};
