function applyExplorerClick(container, count, isSelected, setSelected, isVisible, index, event) {
  const ctrl = event.ctrlKey || event.metaKey;

  if (event.shiftKey && container._anchorIndex !== null && container._anchorIndex !== undefined) {
    // Range-select only over currently visible (e.g. text-filtered) items,
    // so a hidden item between the anchor and the click doesn't get swept in.
    const visible = [];
    for (let i = 0; i < count; i++) if (isVisible(i)) visible.push(i);
    const anchorPos = visible.indexOf(container._anchorIndex);
    const clickedPos = visible.indexOf(index);

    if (anchorPos === -1 || clickedPos === -1) {
      for (let i = 0; i < count; i++) setSelected(i, i === index);
      container._anchorIndex = index;
      return;
    }

    const from = Math.min(anchorPos, clickedPos);
    const to = Math.max(anchorPos, clickedPos);
    if (!ctrl) {
      for (let i = 0; i < count; i++) setSelected(i, false);
    }
    for (let pos = from; pos <= to; pos++) setSelected(visible[pos], true);
    // Anchor intentionally stays put, like a file explorer: repeated
    // shift-clicks keep extending the range from the same origin point.
    return;
  }

  if (ctrl) {
    setSelected(index, !isSelected(index));
  } else {
    for (let i = 0; i < count; i++) setSelected(i, i === index);
  }
  container._anchorIndex = index;
}

const FilterBuilder = {
  async render(onSelectionChanged) {
    this.container = document.getElementById("schema-tree");
    this.searchInput = document.getElementById("schema-search");
    this.onSelectionChanged = onSelectionChanged;
    this.searchInput.oninput = () => this.filterByText(this.searchInput.value.trim().toLowerCase());

    this.container.innerHTML = "Loading...";
    if (!State.bucket) {
      this.container.innerHTML = "";
      return;
    }

    const measurements = await Api.getMeasurements(State.bucket, State.rangeStart);
    this.container.innerHTML = "";
    this.container._anchorIndex = null;

    const nodes = measurements.map((measurement) => this._buildMeasurementNode(measurement));
    for (const { wrapper } of nodes) this.container.appendChild(wrapper);
    this._measurements = measurements;
    this._measurementNodes = nodes;

    nodes.forEach(({ node }, index) => {
      node.addEventListener("click", (event) => {
        if (event.altKey) return; // handled separately for expand/collapse
        applyExplorerClick(
          this.container,
          measurements.length,
          (i) => State.isMeasurementSelected(measurements[i]),
          (i, value) => {
            if (State.isMeasurementSelected(measurements[i]) !== value) State.toggleMeasurement(measurements[i]);
            nodes[i].node.classList.toggle("selected", value);
          },
          (i) => nodes[i].node.style.display !== "none",
          index,
          event
        );
        this.onSelectionChanged();
      });
    });
  },

  _buildMeasurementNode(measurement) {
    const wrapper = document.createElement("div");

    const node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.label = measurement.toLowerCase();
    node.textContent = measurement;
    if (State.isMeasurementSelected(measurement)) node.classList.add("selected");

    const children = document.createElement("div");
    children.className = "tree-children";
    children.style.display = "none";
    let loaded = false;

    node.addEventListener("click", async (event) => {
      if (!event.altKey) return;
      children.style.display = children.style.display === "none" ? "block" : "none";
      if (!loaded && children.style.display === "block") {
        loaded = true;
        await this._loadTagKeys(measurement, children);
      }
    });

    wrapper.appendChild(node);
    wrapper.appendChild(children);
    return { wrapper, node };
  },

  async _loadTagKeys(measurement, container) {
    container.textContent = "Loading...";
    const tagKeys = await Api.getTagKeys(State.bucket, measurement, State.rangeStart);
    container.innerHTML = "";
    for (const tagKey of tagKeys) {
      container.appendChild(this._buildTagKeyNode(measurement, tagKey));
    }
  },

  _buildTagKeyNode(measurement, tagKey) {
    const wrapper = document.createElement("div");
    const node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.label = tagKey.toLowerCase();
    node.textContent = `${tagKey} =`;

    const children = document.createElement("div");
    children.className = "tree-children";
    children.style.display = "none";
    children._anchorIndex = null;
    let loaded = false;

    node.addEventListener("click", async () => {
      children.style.display = children.style.display === "none" ? "block" : "none";
      if (!loaded && children.style.display === "block") {
        loaded = true;
        children.textContent = "Loading...";
        const values = await Api.getTagValues(State.bucket, tagKey, measurement, State.rangeStart);
        children.innerHTML = "";

        const valueNodes = values.map((value) => this._buildTagValueNode(tagKey, value));
        for (const valueNode of valueNodes) children.appendChild(valueNode);

        valueNodes.forEach((valueNode, index) => {
          valueNode.addEventListener("click", (event) => {
            applyExplorerClick(
              children,
              values.length,
              (i) => State.isTagValueSelected(tagKey, values[i]),
              (i, selected) => {
                if (State.isTagValueSelected(tagKey, values[i]) !== selected) State.toggleTagValue(tagKey, values[i]);
                valueNodes[i].classList.toggle("selected", selected);
              },
              (i) => valueNodes[i].style.display !== "none",
              index,
              event
            );
            this.onSelectionChanged();
          });
        });
      }
    });

    wrapper.appendChild(node);
    wrapper.appendChild(children);
    return wrapper;
  },

  _buildTagValueNode(tagKey, value) {
    const node = document.createElement("div");
    node.className = "tree-node";
    node.dataset.label = value.toLowerCase();
    node.textContent = value;
    if (State.isTagValueSelected(tagKey, value)) node.classList.add("selected");
    return node;
  },

  getVisibleMeasurements() {
    if (!this._measurements) return [];
    return this._measurements.filter((_, i) => this._measurementNodes[i].node.style.display !== "none");
  },

  filterByText(term) {
    const nodes = this.container.querySelectorAll(".tree-node");
    for (const node of nodes) {
      // Keep selected nodes visible even when filtered out, so the active
      // selection always stays reachable (e.g. to deselect it again).
      const matches = !term || node.dataset.label.includes(term) || node.classList.contains("selected");
      node.style.display = matches ? "" : "none";
    }
  },

  clearSelectionVisuals() {
    const nodes = this.container.querySelectorAll(".tree-node.selected");
    for (const node of nodes) node.classList.remove("selected");
  },
};
