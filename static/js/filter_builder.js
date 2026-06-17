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
    for (const measurement of measurements) {
      this.container.appendChild(this._buildMeasurementNode(measurement));
    }
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
      if (event.altKey) {
        children.style.display = children.style.display === "none" ? "block" : "none";
        if (!loaded && children.style.display === "block") {
          loaded = true;
          await this._loadTagKeys(measurement, children);
        }
        return;
      }
      State.toggleMeasurement(measurement);
      node.classList.toggle("selected");
      this.onSelectionChanged();
    });

    wrapper.appendChild(node);
    wrapper.appendChild(children);
    return wrapper;
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
    let loaded = false;

    node.addEventListener("click", async () => {
      children.style.display = children.style.display === "none" ? "block" : "none";
      if (!loaded && children.style.display === "block") {
        loaded = true;
        children.textContent = "Loading...";
        const values = await Api.getTagValues(State.bucket, tagKey, measurement, State.rangeStart);
        children.innerHTML = "";
        for (const value of values) {
          children.appendChild(this._buildTagValueNode(tagKey, value));
        }
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

    node.addEventListener("click", () => {
      State.toggleTagValue(tagKey, value);
      node.classList.toggle("selected");
      this.onSelectionChanged();
    });

    return node;
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
