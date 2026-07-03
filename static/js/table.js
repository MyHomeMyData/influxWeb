// Editors for ack/from/q when stored as tags (tag-based ioBroker storage).
// Return strings, because InfluxDB tag values are always strings.
function ackTagEditor(cell, onRendered, success, cancel) {
  const input = document.createElement("select");
  for (const v of ["true", "false"]) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    input.appendChild(opt);
  }
  input.value = cell.getValue() ?? "true";
  input.classList.add("cell-editor");
  onRendered(() => input.focus());
  function commit() { success(input.value); }
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") cancel();
  });
  return input;
}

function qTagEditor(cell, onRendered, success, cancel) {
  const raw = cell.getValue();
  const current = (raw === "" || raw === null || raw === undefined) ? "0" : String(raw);
  const input = document.createElement("select");
  const knownValues = new Set(IOBROKER_Q_VALUES.map((e) => String(e.value)));
  for (const { value, label } of IOBROKER_Q_VALUES) {
    const opt = document.createElement("option");
    opt.value = String(value);
    opt.textContent = label;
    input.appendChild(opt);
  }
  if (!knownValues.has(current)) {
    const opt = document.createElement("option");
    opt.value = current;
    opt.textContent = `${current} — (unknown)`;
    input.appendChild(opt);
  }
  input.value = current;
  input.classList.add("cell-editor");
  onRendered(() => input.focus());
  function commit() { success(input.value); }  // returns string
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") cancel();
  });
  return input;
}

const IOBROKER_EXTRA_FIELD_DEFAULTS = {
  ack:  { value: false, value_type: "bool" },
  from: { value: "",    value_type: "string" },
  q:    { value: 0,     value_type: "float" },
};

const IOBROKER_Q_VALUES = [
  { value: 0, label: "0 — Good" },
  { value: 1, label: "1 — General error" },
  { value: 2, label: "2 — No connection" },
  { value: 16, label: "16 — Substitute value" },
  { value: 32, label: "32 — Device error" },
  { value: 64, label: "64 — Device-specific error" },
  { value: 68, label: "68 — Device-specific + device error" },
  { value: 128, label: "128 — Not connected" },
];

function qCellEditor(cell, onRendered, success, cancel) {
  const raw = cell.getValue();
  const current = (raw === "" || raw === null || raw === undefined) ? 0 : raw;
  const input = document.createElement("select");
  const knownValues = new Set(IOBROKER_Q_VALUES.map((e) => e.value));
  for (const { value, label } of IOBROKER_Q_VALUES) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    input.appendChild(option);
  }
  if (!knownValues.has(current)) {
    const option = document.createElement("option");
    option.value = String(current);
    option.textContent = `${current} — (unknown)`;
    input.appendChild(option);
  }
  input.value = String(current);
  input.classList.add("cell-editor");

  onRendered(() => input.focus());

  function commit() {
    success(parseInt(input.value, 10));
  }

  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") cancel();
  });

  return input;
}

function valueCellEditor(cell, onRendered, success, cancel, valueTypeHint = null) {
  let value = cell.getValue();
  let type = typeof value;
  if (valueTypeHint === "bool") {
    type = "boolean";
    if (typeof value !== "boolean") value = false;
  } else if (valueTypeHint === "float" || valueTypeHint === "int") {
    type = "number";
    if (typeof value !== "number") value = 0;
  }

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

  // Number inputs fire "change" on stepper-button clicks (before blur), which
  // would open the confirm modal prematurely - rely on blur/Enter instead.
  if (type !== "number") input.addEventListener("change", commit);
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

  init(onSelectionChanged, onValueEdited, onTimeEdited, onTagEdited) {
    this.onSelectionChanged = onSelectionChanged ?? (() => {});
    this.onValueEdited = onValueEdited ?? (() => {});
    this.onTimeEdited = onTimeEdited ?? (() => {});
    this.onTagEdited = onTagEdited ?? (() => {});
    this.tabulator = new Tabulator("#results-table", {
      layout: "fitDataStretch",
      height: "65vh",
      nestedFieldSeparator: false,
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

    this.tabulator.on("rowSelectionChanged", () => this.onSelectionChanged(this.getSelectedRowCount()));
    this.tabulator.on("cellEdited", (cell) => {
      if (this.groupByPoint && cell.getField().startsWith("field_")) {
        const wrappedCell = this._wrapGroupedValueCell(cell);
        if (wrappedCell) this.onValueEdited(wrappedCell);
      } else if (this.groupByPoint && cell.getField() === "time") {
        const wrappedCell = this._wrapGroupedTimeCell(cell);
        if (wrappedCell) this.onTimeEdited(wrappedCell);
      } else if (cell.getField() === "time") {
        this.onTimeEdited(cell);
      } else if (cell.getField() === "value") {
        this.onValueEdited(cell);
      } else if (cell.getField().startsWith("tag_")) {
        const retagInfo = this._buildRetagInfo(cell);
        if (retagInfo) this.onTagEdited(retagInfo);
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
    const hasIoBrokerTagRows = this.rawRows.some((r) => r.storage_variant === "tag-based");
    const iobrokerTagEditorFor = (key) => {
      if (key === "ack") return (cell, oR, s, c) => ackTagEditor(cell, oR, s, c);
      if (key === "q")   return (cell, oR, s, c) => qTagEditor(cell, oR, s, c);
      if (key === "from") return (cell, oR, s, c) => valueCellEditor(cell, oR, s, c);
      return null;
    };

    if (!this.groupByPoint) {
      const columns = [
        { title: "Measurement", field: "measurement" },
        ...tagKeys.map((key) => {
          const col = { title: key, field: `tag_${key}` };
          if (hasIoBrokerTagRows) {
            const editor = iobrokerTagEditorFor(key);
            if (editor) col.editor = editor;
          }
          return col;
        }),
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
    const seenFields = new Set();
    for (const row of this.rawRows) {
      const groupKey = pointKey(row.measurement, row.tags, row.time);
      if (!this.groupedRowsByKey.has(groupKey)) this.groupedRowsByKey.set(groupKey, []);
      this.groupedRowsByKey.get(groupKey).push(row);
      if (seenFields.has(row.field)) continue;
      seenFields.add(row.field);
      fieldNames.push(row.field);
    }

    // In iobroker field-based mode all rows have extra_fields (typed ack/from/q).
    // Show them as editable field columns instead of read-only synthetic tag columns.
    const extraFieldNames = [];
    const seenExtraFields = new Set();
    const isAllFieldBased = this.rawRows.length > 0 &&
      this.rawRows.every((row) => row.storage_variant === "field-based");
    if (isAllFieldBased) {
      for (const row of this.rawRows) {
        if (!row.extra_fields) continue;
        for (const name of Object.keys(row.extra_fields)) {
          if (seenExtraFields.has(name)) continue;
          seenExtraFields.add(name);
          extraFieldNames.push(name);
        }
      }
    }
    const tagKeysToShow = isAllFieldBased
      ? tagKeys.filter((key) => !seenExtraFields.has(key))
      : tagKeys;

    const fieldEditor = (cell, onRendered, success, cancel) =>
      this._groupedFieldEditor(cell, onRendered, success, cancel);
    const columns = [
      { title: "Measurement", field: "measurement" },
      ...tagKeysToShow.map((key) => {
        const col = { title: key, field: `tag_${key}` };
        if (hasIoBrokerTagRows) {
          const editor = iobrokerTagEditorFor(key);
          if (editor) col.editor = editor;
        }
        return col;
      }),
      ...extraFieldNames.map((name) => ({ title: name, field: `field_${name}`, editor: fieldEditor })),
      ...fieldNames.map((field) => ({ title: field, field: `field_${field}`, editor: fieldEditor })),
      {
        title: "Time",
        field: "time",
        sorter: "string",
        editable: true,
        editor: (cell, onRendered, success, cancel) => this._groupedTimeEditor(cell, onRendered, success, cancel),
      },
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
      for (const key of tagKeysToShow) grouped[`tag_${key}`] = first.tags[key] ?? "";
      for (const field of fieldNames) grouped[`field_${field}`] = "";
      for (const row of rows) grouped[`field_${row.field}`] = row.value;
      for (const name of extraFieldNames) {
        const entry = first.extra_fields?.[name];
        grouped[`field_${name}`] = entry !== undefined ? entry.value : "";
      }
      data.push(grouped);
    }

    this.tabulator.setColumns(columns);
    this.tabulator.setData(data);
  },

  _tagKeys(rows) {
    const keys = [];
    const seen = new Set();
    for (const row of rows) {
      for (const key of Object.keys(row.tags)) {
        if (seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
      }
    }
    return keys;
  },

  _groupedFieldEditor(cell, onRendered, success, cancel) {
    const groupedRow = cell.getRow().getData();
    const field = this._fieldNameFromColumn(cell.getField());
    const rawRow = this._rawRowForGroupedField(groupedRow.__group_key, field);
    if (!rawRow) {
      return false;
    }
    if (rawRow.field === "q" && rawRow.storage_variant === "field-based") {
      return qCellEditor(cell, onRendered, success, cancel);
    }
    return valueCellEditor(cell, onRendered, success, cancel, rawRow.value_type);
  },

  _fieldNameFromColumn(columnField) {
    return columnField.startsWith("field_") ? columnField.slice(6) : columnField;
  },

  _rawRowForGroupedField(groupKey, fieldName) {
    const rows = this.groupedRowsByKey.get(groupKey) ?? [];
    const direct = rows.find((row) => row.field === fieldName);
    if (direct) return direct;
    // In iobroker field-based mode ack/from/q live in extra_fields of the value row.
    const host = rows.find((row) => row.extra_fields && fieldName in row.extra_fields);
    if (host) {
      const entry = host.extra_fields[fieldName];
      return {
        measurement: host.measurement,
        tags: {},
        field: fieldName,
        value: entry.value,
        value_type: entry.value_type,
        time: host.time,
        storage_variant: "field-based",
      };
    }
    // Field absent from this point (e.g. partially written) — use typed defaults
    const fieldBasedHost = rows.find((row) => row.storage_variant === "field-based");
    const defaults = IOBROKER_EXTRA_FIELD_DEFAULTS[fieldName];
    if (fieldBasedHost && defaults) {
      return {
        measurement: fieldBasedHost.measurement,
        tags: {},
        field: fieldName,
        value: defaults.value,
        value_type: defaults.value_type,
        time: fieldBasedHost.time,
        storage_variant: "field-based",
      };
    }
    return undefined;
  },

  _groupedTimeEditor(cell, onRendered, success, cancel) {
    const groupedRow = cell.getRow().getData();
    const rawRows = this.groupedRowsByKey.get(groupedRow.__group_key) ?? [];
    if (rawRows.length === 0) {
      return false;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.value = cell.getValue();
    input.classList.add("cell-editor");

    onRendered(() => {
      input.focus();
      input.select();
    });

    function commit() {
      success(input.value);
    }

    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commit();
      if (event.key === "Escape") cancel();
    });

    return input;
  },

  _wrapGroupedTimeCell(cell) {
    const groupedRow = cell.getRow().getData();
    const rawRows = this.groupedRowsByKey.get(groupedRow.__group_key) ?? [];
    if (rawRows.length === 0) {
      cell.restoreOldValue();
      return null;
    }

    const oldTime = cell.getOldValue();
    const newTime = cell.getValue();
    const firstRow = rawRows[0];

    return {
      getRow: () => ({
        getData: () => ({
          measurement: firstRow.measurement,
          tags: firstRow.tags,
          field: firstRow.field,
          value: firstRow.value,
          value_type: firstRow.value_type,
          time: oldTime,
        }),
      }),
      getOldValue: () => oldTime,
      getValue: () => newTime,
      restoreOldValue: () => cell.restoreOldValue(),
    };
  },

  _wrapGroupedValueCell(cell) {
    const groupedRow = cell.getRow().getData();
    const fieldName = this._fieldNameFromColumn(cell.getField());
    const rawRow = this._rawRowForGroupedField(groupedRow.__group_key, fieldName);
    if (!rawRow) {
      cell.restoreOldValue();
      return null;
    }

    return {
      getRow: () => ({
        getData: () => ({
          measurement: rawRow.measurement,
          tags: rawRow.tags,
          field: rawRow.field,
          value_type: rawRow.value_type,
          time: rawRow.time,
          storage_variant: rawRow.storage_variant ?? null,
        }),
      }),
      getOldValue: () => cell.getOldValue(),
      getValue: () => cell.getValue(),
      restoreOldValue: () => cell.restoreOldValue(),
    };
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

  // Counts what's actually shown as rows on screen (one per point when
  // grouped, one per field otherwise) - distinct from getSelectedRows()/
  // getAllRows() above, which always expand back to raw per-field rows
  // because that's what Export/Delete/Retime need to act on. Toolbar labels
  // and dialogs use these instead, so the number a user sees always matches
  // what they visually selected, regardless of view mode.
  _buildRetagInfo(cell) {
    const tagKey = cell.getField().slice(4); // strip "tag_" prefix
    let row;
    if (this.groupByPoint) {
      const groupedRow = cell.getRow().getData();
      const rawRows = this.groupedRowsByKey.get(groupedRow.__group_key) ?? [];
      row = rawRows[0];
    } else {
      row = cell.getRow().getData();
    }
    if (!row || row.storage_variant !== "tag-based") {
      cell.restoreOldValue();
      return null;
    }
    const oldTagValue = cell.getOldValue();
    const newTagValue = cell.getValue();
    const newTags = { ...row.tags, [tagKey]: newTagValue };
    return {
      cell,
      measurement: row.measurement,
      oldTags: row.tags,
      newTags,
      tagKey,
      oldTagValue,
      newTagValue,
      field: row.field,
      value: row.value,
      value_type: row.value_type,
      time: row.time,
    };
  },

  getSelectedRowCount() {
    return this.tabulator ? this.tabulator.getSelectedData().length : 0;
  },

  getDisplayedRowCount() {
    return this.tabulator ? this.tabulator.getData().length : 0;
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
          storage_variant: row.storage_variant ?? null,
        });
      }
      groups.get(key).fields[row.field] = { value: row.value, value_type: row.value_type };
      // In ioBroker field-based mode the backend adds extra_fields (typed ack/
      // from/q) so retime can write all fields to the new timestamp - include
      // them here so they flow through to the retime API payload.
      if (row.extra_fields) {
        Object.assign(groups.get(key).fields, row.extra_fields);
      }
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
