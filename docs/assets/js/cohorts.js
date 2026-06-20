/**
 * Renders AI for Beginners cohort schedule from JSON.
 * Add data-cohort-root to a container, or use built-in slot IDs.
 */
(function () {
  const script = document.currentScript;
  const configUrl = script?.dataset?.config;
  if (!configUrl) return;

  function statusClass(status) {
    if (status === "open") return "cohort-status-open";
    if (status === "announced") return "cohort-status-announced";
    return "cohort-status-closed";
  }

  function nextOpen(cohorts) {
    return cohorts.find((c) => c.status === "open" && c.isDefault) || cohorts.find((c) => c.status === "open");
  }

  function renderScheduleList(container, data) {
    container.innerHTML = `
      <p class="cohort-schedule-note">${data.scheduleNote}</p>
      <ul class="cohort-list">
        ${data.cohorts
          .map(
            (c) => `
          <li class="cohort-list-item ${statusClass(c.status)}${c.isDefault && c.status === "open" ? " cohort-list-item--featured" : ""}">
            <div class="cohort-list-main">
              <span class="cohort-name">${c.name}</span>
              <span class="cohort-date">${c.label}</span>
              <span class="cohort-time">${c.timeLabel} (${c.timezone})</span>
            </div>
            <span class="cohort-status-badge ${statusClass(c.status)}">${c.statusLabel}</span>
          </li>`
          )
          .join("")}
      </ul>`;
  }

  function renderHeroSlots(next, data) {
    document.querySelectorAll("[data-cohort-hero-date]").forEach((el) => {
      el.textContent = next ? next.label : "Dates announced soon";
    });
    document.querySelectorAll("[data-cohort-hero-time]").forEach((el) => {
      el.textContent = next
        ? `${next.timeLabel} (${next.timezone}) · 3 hours`
        : data.scheduleNote;
    });
    document.querySelectorAll("[data-cohort-hero-name]").forEach((el) => {
      el.textContent = next ? next.name : "";
    });
    document.querySelectorAll("[data-cohort-hero-badge]").forEach((el) => {
      if (next) {
        el.textContent = `${next.name} · ${next.statusLabel}`;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
    document.querySelectorAll("[data-cohort-register-step]").forEach((el) => {
      el.textContent = next
        ? `Join us on ${next.label} at ${next.timeLabel.split(" – ")[0]} (${next.timezone})`
        : "We'll email you when the next cohort opens";
    });
    document.querySelectorAll("[data-cohort-hub-date]").forEach((el) => {
      el.textContent = next ? `${next.name} · ${next.label}` : "Monthly cohorts";
    });
    document.querySelectorAll("[data-cohort-deck-tag]").forEach((el) => {
      if (next) {
        el.textContent = next.name.replace("Cohort ", "C");
        el.className = "deck-tag cohort-open";
      }
    });
    document.querySelectorAll("[data-cohort-hub-feature]").forEach((el) => {
      el.textContent = next
        ? `✅ ${next.label} · ${next.timeLabel} ${next.timezone} (${next.name})`
        : "✅ Monthly live cohorts · 3 hours";
    });

    const registerBlocks = document.querySelectorAll("[data-cohort-register-block]");
    registerBlocks.forEach((block) => {
      const open = !!next;
      block.querySelectorAll("a[href*='checkout']").forEach((a) => {
        a.style.display = open ? "" : "none";
      });
      const paused = block.querySelector("[data-cohort-paused-msg]");
      if (paused) paused.hidden = open;
    });
  }

  fetch(configUrl)
    .then((r) => r.json())
    .then((data) => {
      const next = nextOpen(data.cohorts);
      const scheduleEl = document.getElementById("cohort-schedule");
      if (scheduleEl) renderScheduleList(scheduleEl, data);
      renderHeroSlots(next, data);
    })
    .catch((err) => console.warn("Cohort schedule unavailable", err));
})();
