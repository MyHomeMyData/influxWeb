function valueCellEditor(cell, onRendered, success, cancel) {
  const value = cell.getValue();
  const type = typeof value;

  let input;
  if (type === "boolean") {
    input = document.createElement("select");
    for (const option of ["true", "false"]) {
      const optionEl = document.createElement("option");
      optionEl.value = option;
      optionEl.textContent = option;
      input.appendChild(optionEl);
    }
    input.value = String(value);
  } else {
    input = document.createElement("input");
    input.type = type === "number" ? "number" : "text";
    if (type === "number") input.step = "any";
    input.value = value;
  }
  input.classList.add("cell-editor");

  onRendered(() => {
    input.focus();
    if (input.select) input.select();
  });

  function commit() {
    if (type === "boolean") {
      success(input.value === "true");
    } else if (type === "number") {
      const parsed = Number(input.value);
      if (Number.isNaN(parsed)) {
        cancel();
      } else {
        success(parsed);
      }
    } else {
      success(input.value);
    }
  }

  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") cancel();
  });

  return input;
}

const ResultsTable = {
  init(onSelectionChanged, onValueEdited) {
    this.onSelectionChanged = onSelectionChanged ?? (() => {});
    this.onValueEdited = onValueEdited ?? (() => {});
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
    this.tabulator.on("cellEdited", (cell) => this.onValueEdited(cell));
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
      { title: "Value", field: "value", editor: valueCellEditor },
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
