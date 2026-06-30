// RFC3339 timestamps from this app always carry 6 fractional digits
// (microseconds) when not exactly on the second, but JS's toISOString-style
// formatting (and Python's isoformat()) omits the fractional part entirely
// when it's zero - so "no match" means "000000", not "unknown".
function subMillisecondDigits(time) {
  const match = time.match(/\.(\d+)Z$/);
  const fraction = (match ? match[1] : "").padEnd(6, "0");
  return fraction.slice(3, 6);
}

// ioBroker (and most smarthome sources) write millisecond-precision
// timestamps, so the microsecond digits below that are normally "000" - a
// hand-edited Time cell going from all-zero to non-zero there is far more
// likely to be an accidental stray keystroke (e.g. while only meaning to
// change the hour) than an intentional sub-millisecond retime.
function hasSuspiciousSubMillisecondChange(oldTime, newTime) {
  const oldDigits = subMillisecondDigits(oldTime);
  const newDigits = subMillisecondDigits(newTime);
  return oldDigits === "000" && newDigits !== "000";
}

const RetimeConfirmModal = {
  init(onRetimed) {
    this.onRetimed = onRetimed;
    this.overlay = document.getElementById("retime-confirm-modal");
    this.body = document.getElementById("retime-confirm-modal-body");
    this.confirmButton = document.getElementById("retime-confirm-modal-confirm");
    this.cancelButton = document.getElementById("retime-confirm-modal-cancel");

    this.cancelButton.addEventListener("click", () => this._cancel());
    this.confirmButton.addEventListener("click", () => this._confirm());
  },

  // points: RetimePoint[] - bucket/measurement/tags/old_time/new_time/fields,
  // already resolved (either typed directly for a single inline Time edit, or
  // computed server-side for a bulk offset/normalize operation).
  // onCancelled: optional callback run if the user cancels or the write
  // fails - used by the inline-edit path to revert the cell's displayed value.
  async open(points, onCancelled) {
    this.points = points;
    this.onCancelled = onCancelled;
    this.preview = null;
    this.confirmButton.disabled = true;
    this.overlay.classList.add("open");
    this.body.innerHTML = "<p>Loading preview...</p>";

    try {
      this.preview = await Api.previewRetime(points);
      this._renderPreview();
      this.confirmButton.disabled = this.preview.matched_count === 0;
    } catch (error) {
      this.body.innerHTML = `<p class="status-line error">Preview failed: ${error.message}</p>`;
    }
  },

  _renderPreview() {
    if (this.preview.matched_count === 0) {
      this.body.innerHTML = "<p>Nothing to retime.</p>";
      return;
    }

    const rows = this.points
      .map((point) => {
        const tagsText = Object.entries(point.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        const fieldsText = Object.entries(point.fields)
          .map(([k, entry]) => `${k}=${entry.value}`)
          .join(", ");
        return `<tr><td>${point.measurement}</td><td>${tagsText}</td><td>${fieldsText}</td><td>${point.old_time} &rarr; ${point.new_time}</td></tr>`;
      })
      .join("");

    const suspicious = this.points.some((point) => hasSuspiciousSubMillisecondChange(point.old_time, point.new_time));
    const warning = suspicious
      ? `<p class="status-line truncated">One or more new times add sub-millisecond precision that
         wasn't there before - double-check this wasn't an accidental edit of the trailing digits.</p>`
      : "";

    this.body.innerHTML = `
      ${warning}
      <p><strong>${this.preview.matched_count}</strong> point(s) will be retimed.</p>
      <table class="preview-table">
        <thead><tr><th>Measurement</th><th>Tags</th><th>Fields</th><th>Old time &rarr; New time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  _cancel() {
    this.onCancelled?.();
    this.close();
  },

  close() {
    this.overlay.classList.remove("open");
  },

  async _confirm() {
    if (!this.preview || this.preview.matched_count === 0) return;
    this.confirmButton.disabled = true;
    this.body.innerHTML += "<p>Retiming...</p>";

    try {
      await Api.executeRetime(this.points, this.preview.confirm_token);
      this.close();
      this.onRetimed(this.preview.matched_count);
    } catch (error) {
      this.onCancelled?.();
      this.body.innerHTML += `<p class="status-line error">Retime failed: ${error.message}</p>`;
      this.confirmButton.disabled = false;
    }
  },
};
