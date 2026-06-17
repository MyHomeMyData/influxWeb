const DetailPanel = {
  init() {
    this.panel = document.getElementById("detail-panel");
    this.content = document.getElementById("detail-content");
    document.getElementById("detail-close").addEventListener("click", () => this.close());
  },

  async show(pointId) {
    this.content.textContent = "Loading...";
    this.panel.classList.add("open");
    try {
      const detail = await Api.getPointDetail(pointId);
      this._render(detail);
    } catch (error) {
      this.content.textContent = `Failed to load point: ${error.message}`;
    }
  },

  _render(detail) {
    const tagRows = Object.entries(detail.tags)
      .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
      .join("");
    const fieldRows = Object.entries(detail.fields)
      .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
      .join("");

    this.content.innerHTML = `
      <h2>${detail.measurement}</h2>
      <p class="status-line">${detail.time}</p>
      <h3>Tags</h3>
      <dl>${tagRows}</dl>
      <h3>Fields</h3>
      <dl>${fieldRows}</dl>
    `;
  },

  close() {
    this.panel.classList.remove("open");
  },
};
