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

function pointKey(measurement, tags, time) {
  const sortedTags = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${measurement}|${sortedTags}|${time}`;
}

const ResultsTable = {
  rawRows: [],
  groupByPoint: false,
  groupedRowsByKey: new Map(),
  isBuilt: false,

  init(onSelectionChanged, onValueEdited, onTimeEdited) {
    this.onSelectionChanged = onSelectionChanged ?? (() => {});
    this.onValueEdited = onValueEdited ?? (() => {});
    this.onTimeEdited = onTimeEdited ?? (() => {});
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

    this.tabulator.on("tableBuilt", () => {
      this.isBuilt = true;
      this._render();
    });

    this.tabulator.on("rowSelectionChanged", () => this.onSelectionChanged(this.getSelectedRows()));
    this.tabulator.on("cellEdited", (cell) => {
      if (cell.getField() === "time") {
        this.onTimeEdited(cell);
      } else if (cell.getField() === "value") {
        this.onValueEdited(cell);
      }
    });
  },

  setGroupByPoint(enabled) {
    this.groupByPoint = enabled;
    this._render();
  },

  setRows(rows) {
    this.rawRows = [...rows];
    this._render();
  },

  _render() {
    if (!this.tabulator || !this.isBuilt) {
      return;
    }

    const tagKeys = this._tagKeys(this.rawRows);
    if (!this.groupByPoint) {
      const columns = [
        { title: "Measurement", field: "measurement" },
        ...tagKeys.map((key) => ({ title: key, field: `tag_${key}` })),
        { title: "Field", field: "field" },
        { title: "Value", field: "value", editor: valueCellEditor },
        { title: "Time", field: "time", sorter: "string", editable: true, editor: "input" },
      ];

      const data = this.rawRows.map((row) => {
        const flat = { ...row, __group_key: pointKey(row.measurement, row.tags, row.time) };
        for (const key of tagKeys) flat[`tag_${key}`] = row.tags[key] ?? "";
        return flat;
      });

      this.groupedRowsByKey = new Map();
      this.tabulator.setColumns(columns);
      this.tabulator.setData(data);
      return;
    }

    this.groupedRowsByKey = new Map();
    const fieldNames = [];
    for (const row of this.rawRows) {
      const groupKey = pointKey(row.measurement, row.tags, row.time);
      if (!this.groupedRowsByKey.has(groupKey)) this.groupedRowsByKey.set(groupKey, []);
      this.groupedRowsByKey.get(groupKey).push(row);
      if (!fieldNames.includes(row.field)) fieldNames.push(row.field);
    }

    const columns = [
      { title: "Measurement", field: "measurement" },
      ...tagKeys.map((key) => ({ title: key, field: `tag_${key}` })),
      ...fieldNames.map((field) => ({ title: field, field: `field_${field}` })),
      { title: "Time", field: "time", sorter: "string" },
    ];

    const data = [];
    for (const [groupKey, rows] of this.groupedRowsByKey.entries()) {
      const first = rows[0];
      const grouped = {
        __group_key: groupKey,
        measurement: first.measurement,
        tags: first.tags,
        time: first.time,
      };
      for (const key of tagKeys) grouped[`tag_${key}`] = first.tags[key] ?? "";
      for (const field of fieldNames) grouped[`field_${field}`] = "";
      for (const row of rows) grouped[`field_${row.field}`] = row.value;
      data.push(grouped);
    }

    this.tabulator.setColumns(columns);
    this.tabulator.setData(data);
  },

  _tagKeys(rows) {
    const keys = [];
    for (const row of rows) {
      for (const key of Object.keys(row.tags)) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
    return keys;
  },

  getSelectedRows() {
    if (!this.tabulator) {
      return [];
    }
    const selected = this.tabulator.getSelectedData();
    if (!this.groupByPoint) {
      return selected;
    }
    const expanded = [];
    for (const row of selected) {
      const groupedRows = this.groupedRowsByKey.get(row.__group_key) ?? [];
      expanded.push(...groupedRows);
    }
    return expanded;
  },

  getAllRows() {
    return [...this.rawRows];
  },

  // Groups rows into one entry per InfluxDB point (same measurement+tags+time),
  // merging the field/value pairs of every row in a group into one `fields`
  // map - a point's fields must always move together when retiming.
  groupIntoPoints(rows) {
    const groups = new Map();
    for (const row of rows) {
      const key = pointKey(row.measurement, row.tags, row.time);
      if (!groups.has(key)) {
        groups.set(key, {
          measurement: row.measurement,
          tags: row.tags,
          time: row.time,
          fields: {},
        });
      }
      groups.get(key).fields[row.field] = { value: row.value, value_type: row.value_type };
    }
    return [...groups.values()];
  },

  // Finds every currently-loaded row sharing the same point (measurement+tags+
  // time) as the given one, even if only one of them was selected/edited -
  // used so a single-row Time edit still moves sibling fields of that point.
  findPointGroup(measurement, tags, time) {
    const key = pointKey(measurement, tags, time);
    const matching = this.getAllRows().filter((row) => pointKey(row.measurement, row.tags, row.time) === key);
    return this.groupIntoPoints(matching)[0];
  },
};
