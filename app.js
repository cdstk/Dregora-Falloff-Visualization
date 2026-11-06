(() => {
  "use strict";

  const DATA = window.SRP_DATA;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAX_DAMAGE = 1000;
  const MIN_DAMAGE = 1;
  const DEFAULT_DAMAGE = 100;
  const TOP_BAR_COUNT = 18;
  const EPSILON = 1e-9;

  const state = {
    damage: DEFAULT_DAMAGE,
    search: "",
    sortKey: "effectiveHealthMax",
    sortDir: "desc",
    metric: "damage",
    barMetric: "extraHits",
    selectedId: null,
  };

  const el = {
    heroMobCount: document.getElementById("heroMobCount"),
    damageSlider: document.getElementById("damageSlider"),
    damageNumber: document.getElementById("damageNumber"),
    damageNote: document.getElementById("damageNote"),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    sortDirButton: document.getElementById("sortDirButton"),
    resetButton: document.getElementById("resetButton"),
    exportButton: document.getElementById("exportButton"),
    statDamage: document.getElementById("statDamage"),
    statDamageSub: document.getElementById("statDamageSub"),
    statMobs: document.getElementById("statMobs"),
    statMobsSub: document.getElementById("statMobsSub"),
    statHpRange: document.getElementById("statHpRange"),
    statExtraHits: document.getElementById("statExtraHits"),
    statExtraHitsSub: document.getElementById("statExtraHitsSub"),
    falloffChart: document.getElementById("falloffChart"),
    barChart: document.getElementById("barChart"),
    barMetric: document.getElementById("barMetric"),
    tableSummary: document.getElementById("tableSummary"),
    tableBody: document.getElementById("mobTableBody"),
    tableEmpty: document.getElementById("tableEmpty"),
    detailPanel: document.getElementById("detailPanel"),
    footerMeta: document.getElementById("footerMeta"),
    tooltip: document.getElementById("tooltip"),
    metricButtons: [...document.querySelectorAll(".segment[data-metric]")],
    sortHeaders: [...document.querySelectorAll("thead th[data-sort]")],
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function divisor(damage) {
    return clamp(6 / 7 + damage / 140, 1, 3);
  }

  function afterFalloff(damage) {
    return damage / divisor(damage);
  }

  function reductionPercent(damage) {
    if (damage <= 0) return 0;
    return (1 - afterFalloff(damage) / damage) * 100;
  }

  function exactHits(hp, damage) {
    return hp / damage;
  }

  function hitsToKill(hp, damage) {
    return Math.max(1, Math.ceil(hp / damage - EPSILON));
  }

  function formatNumber(value, maxDecimals = 1) {
    const rounded = Number(value.toFixed(maxDecimals));
    return rounded.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  }

  function formatPercent(value, maxDecimals = 1) {
    return `${formatNumber(value, maxDecimals)}%`;
  }

  function formatSigned(value, maxDecimals = 1) {
    const formatted = formatNumber(value, maxDecimals);
    return value > 0 ? `+${formatted}` : formatted;
  }

  function formatMultiplier(value) {
    return `${formatNumber(value, 2)}×`;
  }

  function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
  }

  function escapeCsv(value) {
    const text = String(value);
    if (/[",\r\n]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) {
        node.setAttribute(key, value);
      }
    }
    return node;
  }

  function addSvgText(parent, x, y, text, className, anchor = "start") {
    const node = svg("text", {
      x,
      y,
      class: className,
      "text-anchor": anchor,
    });
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
    const span = domainMax - domainMin || 1;
    return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
  }

  function niceTicks(maxValue, targetCount = 5) {
    if (!Number.isFinite(maxValue) || maxValue <= 0) return [0];
    const rough = maxValue / targetCount;
    const power = 10 ** Math.floor(Math.log10(rough));
    const normalized = rough / power;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
    const ticks = [];
    for (let value = 0; value <= maxValue + 1e-9; value += step) {
      ticks.push(Number(value.toFixed(6)));
    }
    return ticks;
  }

  function integerTicks(maxValue, targetCount = 4) {
    if (!Number.isFinite(maxValue) || maxValue <= 0) return [0];
    if (maxValue <= 4) {
      return Array.from({ length: Math.ceil(maxValue) + 1 }, (_, index) => index);
    }

    const rough = maxValue / targetCount;
    const power = 10 ** Math.floor(Math.log10(rough));
    const normalized = rough / power;
    const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const step = Math.max(1, Math.round(multiplier * power));
    const ticks = [];
    for (let value = 0; value <= maxValue + 1e-9; value += step) {
      ticks.push(value);
    }
    return ticks;
  }

  function formatTick(value, isPercent = false) {
    if (isPercent) return `${formatNumber(value, 0)}%`;
    return formatNumber(value, 0);
  }

  function showTooltip(event, html) {
    el.tooltip.innerHTML = html;
    el.tooltip.hidden = false;

    const padding = 14;
    const width = el.tooltip.offsetWidth;
    const height = el.tooltip.offsetHeight;
    let left = event.clientX + padding;
    let top = event.clientY + padding;

    if (left + width > window.innerWidth - 10) left = event.clientX - width - padding;
    if (top + height > window.innerHeight - 10) top = event.clientY - height - padding;

    el.tooltip.style.left = `${Math.max(8, left)}px`;
    el.tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function hideTooltip() {
    el.tooltip.hidden = true;
  }

  function defaultDirForKey(key) {
    return ["name", "id"].includes(key) ? "asc" : "desc";
  }

  const mobs = DATA.mobs;
  const dimensions = DATA.dimensionHealthMultipliers;
  const maxDimension = DATA.maxDimension;
  const maxDimensionMultiplier = DATA.maxDimensionMultiplier;

  function dimensionLabel(dimension) {
    if (dimension === -1) return "Nether";
    if (dimension === 0) return "Overworld";
    if (dimension === 1) return "The End";
    return `Dim ${dimension}`;
  }

  function tableCell(className, text) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function getRows() {
    const damageAfter = afterFalloff(state.damage);
    return mobs.map((mob) => {
      const hitsBefore = hitsToKill(mob.effectiveHealthMax, state.damage);
      const hitsAfter = hitsToKill(mob.effectiveHealthMax, damageAfter);
      const extraHits = hitsAfter - hitsBefore;

      return {
        ...mob,
        hitsBefore,
        hitsAfter,
        extraHits,
        percentIncrease: hitsBefore > 0 ? (extraHits / hitsBefore) * 100 : 0,
      };
    });
  }

  function visibleRows() {
    const query = state.search.trim().toLowerCase();
    const rows = getRows().filter((row) => {
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || row.id.toLowerCase().includes(query);
    });

    const direction = state.sortDir === "asc" ? 1 : -1;
    const key = state.sortKey;

    rows.sort((a, b) => {
      if (key === "name" || key === "id") {
        const order = a[key].localeCompare(b[key]);
        if (order !== 0) return order * direction;
        return a.name.localeCompare(b.name);
      }

      const difference = (a[key] ?? 0) - (b[key] ?? 0);
      if (difference !== 0) return difference * direction;
      return a.name.localeCompare(b.name);
    });

    return rows;
  }

  function updateRangeFill() {
    const percent = ((state.damage - MIN_DAMAGE) / (MAX_DAMAGE - MIN_DAMAGE)) * 100;
    el.damageSlider.style.setProperty("--range-fill", `${clamp(percent, 0, 100)}%`);
    el.damageSlider.setAttribute(
      "aria-valuetext",
      `${state.damage} damage, ${formatNumber(afterFalloff(state.damage))} after falloff`
    );
  }

  function setDamage(value, { updateNumber = true, updateSlider = true } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    state.damage = clamp(Math.round(parsed), MIN_DAMAGE, MAX_DAMAGE);
    if (updateSlider) el.damageSlider.value = String(state.damage);
    if (updateNumber) el.damageNumber.value = String(state.damage);
    updateRangeFill();
    scheduleRender();
  }

  function selectMob(id, { toggle = true } = {}) {
    state.selectedId = toggle && state.selectedId === id ? null : id;
    renderTable(visibleRows());
    renderDetail();
  }

  function renderDamageNote() {
    const damage = state.damage;
    const currentDivisor = divisor(damage);
    const damageAfter = afterFalloff(damage);

    if (damage <= 20) {
      el.damageNote.innerHTML = "Damage at or below <strong>20</strong> is not reduced.";
    } else if (damage >= 300) {
      el.damageNote.innerHTML =
        "Divisor is capped at <strong>3×</strong> — hits deal one third damage.";
    } else {
      el.damageNote.innerHTML = `Divisor <strong>${formatNumber(currentDivisor, 2)}×</strong> → ${formatNumber(damageAfter)} damage after falloff.`;
    }
  }

  function renderStats(rows) {
    const damageAfter = afterFalloff(state.damage);
    const reduction = reductionPercent(state.damage);

    el.statDamage.textContent = `${formatNumber(state.damage, 0)} → ${formatNumber(damageAfter)}`;
    el.statDamageSub.textContent =
      reduction <= 0 ? "no reduction at this damage" : `${formatPercent(reduction)} reduction`;

    el.statMobs.textContent = formatNumber(rows.length, 0);
    el.statMobsSub.textContent = `of ${formatNumber(mobs.length, 0)} configured`;

    if (rows.length > 0) {
      const healthValues = rows.map((row) => row.effectiveHealthMax);
      el.statHpRange.textContent = `${formatNumber(Math.min(...healthValues))} – ${formatNumber(Math.max(...healthValues))}`;
    } else {
      el.statHpRange.textContent = "–";
    }

    const totalBefore = rows.reduce((sum, row) => sum + row.hitsBefore, 0);
    const totalAfter = rows.reduce((sum, row) => sum + row.hitsAfter, 0);
    const extraHits = totalAfter - totalBefore;

    el.statExtraHits.textContent = formatSigned(extraHits, 0);
    el.statExtraHitsSub.textContent = `${formatNumber(totalBefore, 0)} before → ${formatNumber(totalAfter, 0)} after`;

    if (rows.length > 0) {
      el.tableSummary.textContent = `${formatNumber(rows.length, 0)} mob${rows.length === 1 ? "" : "s"} at ${formatNumber(state.damage, 0)} pre-falloff damage · ${formatNumber(totalBefore, 0)} → ${formatNumber(totalAfter, 0)} total hits`;
    } else {
      el.tableSummary.textContent = "No mobs match the current search.";
    }
  }

  function renderTable(rows) {
    const fragment = document.createDocumentFragment();

    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.tabIndex = 0;
      if (row.id === state.selectedId) tr.classList.add("is-selected");

      tr.appendChild(tableCell("mob-name", row.name));
      tr.appendChild(tableCell("mob-id", row.id));
      tr.appendChild(tableCell("num", formatNumber(row.baseHealth)));
      tr.appendChild(tableCell("num", formatMultiplier(row.healthMultiplier)));
      tr.appendChild(tableCell("num hp-cell", formatNumber(row.effectiveHealthMax)));
      tr.appendChild(tableCell("num", formatNumber(row.hitsBefore, 0)));
      tr.appendChild(
        tableCell(
          row.extraHits > 0 ? "num after-cell" : "num",
          formatNumber(row.hitsAfter, 0)
        )
      );
      tr.appendChild(
        tableCell(
          row.extraHits > 0 ? "num extra-positive" : "num",
          formatSigned(row.extraHits, 0)
        )
      );
      tr.appendChild(
        tableCell(
          row.percentIncrease > 0 ? "num percent-positive" : "num",
          formatPercent(row.percentIncrease)
        )
      );

      tr.addEventListener("click", () => selectMob(row.id));
      tr.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectMob(row.id);
        }
      });

      fragment.appendChild(tr);
    }

    el.tableBody.replaceChildren(fragment);
    el.tableEmpty.hidden = rows.length > 0;
  }

  function renderFalloffChart() {
    const width = 960;
    const height = 340;
    const margin = { top: 22, right: 26, bottom: 48, left: 62 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const isPercent = state.metric === "reduction";
    const yMax = isPercent ? 70 : 340;

    const xScale = linearScale(0, MAX_DAMAGE, margin.left, margin.left + innerWidth);
    const yScale = linearScale(0, yMax, margin.top + innerHeight, margin.top);

    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": isPercent
        ? "Reduction percent by pre-falloff damage"
        : "Post-falloff damage by pre-falloff damage",
    });

    const defs = svg("defs");
    const gradient = svg("linearGradient", {
      id: "falloffGradient",
      x1: "0",
      x2: "0",
      y1: "0",
      y2: "1",
    });
    const gradientColor = isPercent ? "#f472b6" : "#a3e635";
    gradient.appendChild(svg("stop", { offset: "0%", "stop-color": gradientColor, "stop-opacity": "0.3" }));
    gradient.appendChild(svg("stop", { offset: "100%", "stop-color": gradientColor, "stop-opacity": "0" }));
    defs.appendChild(gradient);
    root.appendChild(defs);

    const yTicks = niceTicks(yMax, 5);
    for (const tick of yTicks) {
      const y = yScale(tick);
      root.appendChild(
        svg("line", {
          x1: margin.left,
          x2: margin.left + innerWidth,
          y1: y,
          y2: y,
          class: "grid-line",
        })
      );
      addSvgText(root, margin.left - 10, y + 4, formatTick(tick, isPercent), "axis-label", "end");
    }

    for (let tick = 0; tick <= MAX_DAMAGE; tick += 200) {
      const x = xScale(tick);
      root.appendChild(
        svg("line", {
          x1: x,
          x2: x,
          y1: margin.top,
          y2: margin.top + innerHeight,
          class: "grid-line",
        })
      );
      addSvgText(root, x, height - 18, formatNumber(tick, 0), "axis-label", "middle");
    }

    root.appendChild(
      svg("line", {
        x1: margin.left,
        x2: margin.left + innerWidth,
        y1: margin.top + innerHeight,
        y2: margin.top + innerHeight,
        class: "axis-line",
      })
    );

    addSvgText(
      root,
      margin.left + innerWidth / 2,
      height - 2,
      "Pre-falloff damage",
      "axis-title",
      "middle"
    );
    addSvgText(
      root,
      16,
      margin.top + innerHeight / 2,
      isPercent ? "Reduction %" : "Post-falloff damage",
      "axis-title",
      "middle"
    ).setAttribute("transform", `rotate(-90 16 ${margin.top + innerHeight / 2})`);

    const points = [];
    for (let damage = 0; damage <= MAX_DAMAGE; damage += 2) {
      points.push({
        x: damage,
        y: isPercent ? reductionPercent(damage) : afterFalloff(damage),
      });
    }
    if (points[points.length - 1].x !== MAX_DAMAGE) {
      points.push({
        x: MAX_DAMAGE,
        y: isPercent ? reductionPercent(MAX_DAMAGE) : afterFalloff(MAX_DAMAGE),
      });
    }

    const pathData = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xScale(point.x).toFixed(2)},${yScale(point.y).toFixed(2)}`)
      .join(" ");
    const areaData = `${pathData} L${xScale(MAX_DAMAGE).toFixed(2)},${yScale(0).toFixed(2)} L${xScale(0).toFixed(2)},${yScale(0).toFixed(2)} Z`;

    root.appendChild(svg("path", { d: areaData, class: "curve-area" }));
    root.appendChild(
      svg("path", {
        d: pathData,
        class: "curve-line",
        style: isPercent ? "stroke: #f472b6" : undefined,
      })
    );

    const breakpoints = [20, 300];
    for (const breakpoint of breakpoints) {
      const value = isPercent ? reductionPercent(breakpoint) : afterFalloff(breakpoint);
      const x = xScale(breakpoint);
      const y = yScale(value);

      const dot = svg("circle", { cx: x, cy: y, r: 4, class: "breakpoint-dot" });
      dot.appendChild(svg("title")).textContent = `${breakpoint} damage → ${formatNumber(value)}${isPercent ? "% reduction" : " damage"}`;
      root.appendChild(dot);
      addSvgText(root, x, y - 11, formatNumber(breakpoint, 0), "breakpoint-label", "middle");
    }

    const selectedX = xScale(state.damage);
    root.appendChild(
      svg("line", {
        x1: selectedX,
        x2: selectedX,
        y1: margin.top,
        y2: margin.top + innerHeight,
        class: "selected-line",
      })
    );

    const selectedValue = isPercent ? reductionPercent(state.damage) : afterFalloff(state.damage);
    root.appendChild(
      svg("circle", {
        cx: selectedX,
        cy: yScale(selectedValue),
        r: 5,
        class: "selected-dot",
      })
    );

    const hoverLine = svg("line", {
      class: "chart-hover-line",
      y1: margin.top,
      y2: margin.top + innerHeight,
      opacity: 0,
    });
    const hoverDot = svg("circle", { class: "chart-hover-dot", r: 4, opacity: 0 });
    root.appendChild(hoverLine);
    root.appendChild(hoverDot);

    const overlay = svg("rect", {
      x: margin.left,
      y: margin.top,
      width: innerWidth,
      height: innerHeight,
      fill: "transparent",
      style: "cursor: crosshair",
    });

    function damageFromEvent(event) {
      const bounds = root.getBoundingClientRect();
      const localX = ((event.clientX - bounds.left) / bounds.width) * width;
      return clamp(Math.round(((localX - margin.left) / innerWidth) * MAX_DAMAGE), MIN_DAMAGE, MAX_DAMAGE);
    }

    function updateHover(event) {
      const damage = damageFromEvent(event);
      const x = xScale(damage);
      const value = isPercent ? reductionPercent(damage) : afterFalloff(damage);

      hoverLine.setAttribute("x1", x);
      hoverLine.setAttribute("x2", x);
      hoverLine.setAttribute("opacity", 1);
      hoverDot.setAttribute("cx", x);
      hoverDot.setAttribute("cy", yScale(value));
      hoverDot.setAttribute("opacity", 1);

      showTooltip(
        event,
        `<strong>${formatNumber(damage, 0)} pre-falloff</strong><br>` +
          `<span class="tooltip-muted">Post-falloff</span> <strong>${formatNumber(afterFalloff(damage))}</strong><br>` +
          `<span class="tooltip-muted">Reduction</span> <strong>${formatPercent(reductionPercent(damage))}</strong>`
      );
    }

    overlay.addEventListener("mousemove", updateHover);
    overlay.addEventListener("mouseleave", () => {
      hoverLine.setAttribute("opacity", 0);
      hoverDot.setAttribute("opacity", 0);
      hideTooltip();
    });
    overlay.addEventListener("click", (event) => {
      setDamage(damageFromEvent(event));
    });

    root.appendChild(overlay);
    el.falloffChart.replaceChildren(root);
  }

  function renderBarChart(rows) {
    const metric = state.barMetric;
    const sorted = [...rows]
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name))
      .slice(0, TOP_BAR_COUNT);

    if (sorted.length === 0) {
      el.barChart.innerHTML = '<p class="chart-empty">No mobs match the current search.</p>';
      return;
    }

    const maxValue = Math.max(...sorted.map((row) => row[metric]));

    if (maxValue <= 0) {
      el.barChart.innerHTML = `<p class="chart-empty">No extra hits at ${formatNumber(state.damage, 0)} damage — every shown mob dies in the same number of hits.</p>`;
      return;
    }

    const width = 720;
    const rowHeight = 27;
    const top = 8;
    const barX = 182;
    const barWidth = 470;
    const height = Math.max(120, top * 2 + sorted.length * rowHeight);

    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label":
        metric === "extraHits"
          ? "Top mobs by extra hits to kill"
          : metric === "hitsAfter"
            ? "Top mobs by hits to kill after falloff"
            : "Top mobs by effective health",
    });

    const barClass =
      metric === "extraHits" ? "bar-extra" : metric === "hitsAfter" ? "bar-after" : "bar-hp";

    sorted.forEach((row, index) => {
      const y = top + index * rowHeight;
      const barY = y + 6;
      const value = row[metric];
      const valueWidth = maxValue > 0 ? (value / maxValue) * barWidth : 0;

      const group = svg("g", { class: "bar-row", tabindex: "0", role: "button" });
      const title = svg("title");
      title.textContent = `${row.name}: ${formatNumber(row.hitsBefore, 0)} hits before → ${formatNumber(row.hitsAfter, 0)} after (${formatSigned(row.extraHits, 0)} extra)`;
      group.appendChild(title);

      group.appendChild(
        svg("rect", {
          x: 0,
          y: barY,
          width: barX - 6,
          height: 14,
          fill: "transparent",
        })
      );

      const name = addSvgText(group, 0, barY + 11, truncate(row.name, 23), "bar-name");

      group.appendChild(
        svg("rect", {
          x: barX,
          y: barY,
          width: barWidth,
          height: 14,
          rx: 4,
          class: "bar-track",
        })
      );

      if (valueWidth > 0) {
        group.appendChild(
          svg("rect", {
            x: barX,
            y: barY,
            width: Math.max(2, valueWidth),
            height: 14,
            rx: 4,
            class: barClass,
          })
        );
      }

      const valueText =
        metric === "effectiveHealthMax"
          ? formatNumber(value)
          : metric === "extraHits"
            ? formatSigned(value, 0)
            : formatNumber(value, 0);

      addSvgText(group, width - 2, barY + 11, valueText, "bar-value", "end");

      if (row.id === state.selectedId) {
        name.style.fill = "var(--lime)";
      }

      group.addEventListener("click", () => selectMob(row.id, { toggle: false }));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectMob(row.id, { toggle: false });
        }
      });

      root.appendChild(group);
    });

    el.barChart.replaceChildren(root);
  }

  function detailChip(label, value, isResult = false) {
    const chip = createEl("div", isResult ? "breakdown-chip is-result" : "breakdown-chip");
    chip.appendChild(createEl("span", null, label));
    chip.appendChild(createEl("strong", null, value));
    return chip;
  }

  function detailMetric(label, value, className = "") {
    const metric = createEl("div", className ? `detail-metric ${className}` : "detail-metric");
    metric.appendChild(createEl("span", null, label));
    metric.appendChild(createEl("strong", null, value));
    return metric;
  }

  function renderDetailChart(container, mob) {
    const width = 560;
    const height = 230;
    const margin = { top: 24, right: 14, bottom: 38, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xMin = Math.min(20, state.damage);
    const xMax = MAX_DAMAGE;
    const damageAfter = afterFalloff(state.damage);
    const hitsBefore = hitsToKill(mob.effectiveHealthMax, state.damage);
    const hitsAfter = hitsToKill(mob.effectiveHealthMax, damageAfter);
    const yMax = Math.max(2, hitsToKill(mob.effectiveHealthMax, xMin));

    const xScale = linearScale(xMin, xMax, margin.left, margin.left + innerWidth);
    const yScale = linearScale(0, yMax, margin.top + innerHeight, margin.top);

    const root = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `Hits to kill ${mob.name} before and after falloff`,
    });

    const yTicks = integerTicks(yMax, 4);
    for (const tick of yTicks) {
      const y = yScale(tick);
      root.appendChild(
        svg("line", {
          x1: margin.left,
          x2: margin.left + innerWidth,
          y1: y,
          y2: y,
          class: "grid-line",
        })
      );
      addSvgText(root, margin.left - 8, y + 4, formatNumber(tick, 0), "axis-label", "end");
    }

    const xTicks = [...new Set([xMin, 200, 400, 600, 800, 1000])].filter((tick) => tick <= xMax);
    for (const tick of xTicks) {
      const x = xScale(tick);
      root.appendChild(
        svg("line", {
          x1: x,
          x2: x,
          y1: margin.top,
          y2: margin.top + innerHeight,
          class: "grid-line",
        })
      );
      addSvgText(root, x, height - 20, formatNumber(tick, 0), "axis-label", "middle");
    }

    root.appendChild(
      svg("line", {
        x1: margin.left,
        x2: margin.left + innerWidth,
        y1: margin.top + innerHeight,
        y2: margin.top + innerHeight,
        class: "axis-line",
      })
    );

    addSvgText(root, margin.left + innerWidth / 2, height - 3, "Pre-falloff damage", "axis-title", "middle");
    addSvgText(root, 13, margin.top + innerHeight / 2, "Hits", "axis-title", "middle").setAttribute(
      "transform",
      `rotate(-90 13 ${margin.top + innerHeight / 2})`
    );

    const pointsBefore = [];
    const pointsAfter = [];
    for (let damage = xMin; damage <= xMax; damage += 1) {
      pointsBefore.push({ x: damage, y: hitsToKill(mob.effectiveHealthMax, damage) });
      pointsAfter.push({ x: damage, y: hitsToKill(mob.effectiveHealthMax, afterFalloff(damage)) });
    }

    function stepPath(points) {
      return points
        .map((point, index) => {
          const x = xScale(point.x).toFixed(2);
          const y = yScale(point.y).toFixed(2);
          return index === 0 ? `M${x},${y}` : `H${x}V${y}`;
        })
        .join(" ");
    }

    root.appendChild(svg("path", { d: stepPath(pointsBefore), class: "detail-curve-before" }));
    root.appendChild(svg("path", { d: stepPath(pointsAfter), class: "detail-curve-after" }));

    const legendStart = margin.left + innerWidth - 150;
    const legendY = margin.top + 2;

    root.appendChild(
      svg("line", {
        x1: legendStart,
        x2: legendStart + 18,
        y1: legendY,
        y2: legendY,
        class: "detail-legend-line-before",
      })
    );
    addSvgText(root, legendStart + 23, legendY + 3, "before", "detail-legend-text");

    root.appendChild(
      svg("line", {
        x1: legendStart + 76,
        x2: legendStart + 94,
        y1: legendY,
        y2: legendY,
        class: "detail-legend-line-after",
      })
    );
    addSvgText(root, legendStart + 99, legendY + 3, "after", "detail-legend-text");

    const selectedX = xScale(state.damage);
    root.appendChild(
      svg("line", {
        x1: selectedX,
        x2: selectedX,
        y1: margin.top,
        y2: margin.top + innerHeight,
        class: "detail-selected-line",
      })
    );

    root.appendChild(
      svg("circle", {
        cx: selectedX,
        cy: yScale(hitsBefore),
        r: 3.5,
        fill: "#536578",
        stroke: "#0b1118",
        "stroke-width": 2,
      })
    );
    root.appendChild(
      svg("circle", {
        cx: selectedX,
        cy: yScale(hitsAfter),
        r: 3.5,
        fill: "#fb923c",
        stroke: "#0b1118",
        "stroke-width": 2,
      })
    );

    container.replaceChildren(root);
  }

  function renderDetail() {
    const mob = state.selectedId ? mobs.find((entry) => entry.id === state.selectedId) : null;

    if (!mob) {
      el.detailPanel.innerHTML = `
        <div class="detail-placeholder">
          <p class="detail-kicker">Mob breakdown</p>
          <h2>Select a mob</h2>
          <p>Click any row in the table to see its health multipliers and hits-to-kill curve.</p>
        </div>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    const header = createEl("div", "detail-header");
    const headerText = createEl("div");
    headerText.appendChild(createEl("p", "detail-kicker", "Mob breakdown"));
    headerText.appendChild(createEl("h2", null, mob.name));
    headerText.appendChild(createEl("p", "detail-id", mob.id));

    const closeButton = createEl("button", "detail-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close mob breakdown");
    closeButton.addEventListener("click", () => {
      state.selectedId = null;
      renderTable(visibleRows());
      renderDetail();
    });

    header.appendChild(headerText);
    header.appendChild(closeButton);
    fragment.appendChild(header);

    const breakdown = createEl("div", "breakdown");
    breakdown.appendChild(detailChip("Base HP", formatNumber(mob.baseHealth)));
    breakdown.appendChild(createEl("span", "breakdown-op", "×"));
    breakdown.appendChild(detailChip("Mob HP ×", formatMultiplier(mob.healthMultiplier)));
    breakdown.appendChild(createEl("span", "breakdown-op", "×"));
    breakdown.appendChild(
      detailChip(`Dim ${maxDimension} ×`, formatMultiplier(maxDimensionMultiplier))
    );
    breakdown.appendChild(createEl("span", "breakdown-op", "="));
    breakdown.appendChild(detailChip("Effective HP", formatNumber(mob.effectiveHealthMax), true));
    fragment.appendChild(breakdown);

    const hitsBefore = hitsToKill(mob.effectiveHealthMax, state.damage);
    const hitsAfter = hitsToKill(mob.effectiveHealthMax, afterFalloff(state.damage));

    const metrics = createEl("div", "detail-metrics");
    metrics.appendChild(detailMetric("Effective HP", formatNumber(mob.effectiveHealthMax)));
    metrics.appendChild(detailMetric("Hits before", formatNumber(hitsBefore, 0)));
    metrics.appendChild(detailMetric("Hits after", formatNumber(hitsAfter, 0), "is-after"));
    metrics.appendChild(
      detailMetric("Extra hits", formatSigned(hitsAfter - hitsBefore, 0), "is-extra")
    );
    fragment.appendChild(metrics);

    const dimensionHead = createEl("div", "detail-chart-head");
    dimensionHead.appendChild(createEl("h3", null, "Health by dimension"));
    dimensionHead.appendChild(createEl("span", null, "per-mob multiplier included"));
    fragment.appendChild(dimensionHead);

    const dimensionGrid = createEl("div", "dimension-grid");
    for (const entry of dimensions) {
      const health = mob.effectiveHealthByDimension[String(entry.dimension)];
      const isMax = entry.dimension === maxDimension;
      const item = createEl("div", isMax ? "dimension-item is-max" : "dimension-item");
      item.appendChild(createEl("span", null, dimensionLabel(entry.dimension)));
      item.appendChild(createEl("strong", null, `${formatNumber(health)} HP`));
      item.appendChild(createEl("small", null, formatMultiplier(entry.multiplier)));
      dimensionGrid.appendChild(item);
    }
    fragment.appendChild(dimensionGrid);

    const chartHead = createEl("div", "detail-chart-head");
    chartHead.appendChild(createEl("h3", null, "Hits to kill vs damage"));
    chartHead.appendChild(
      createEl(
        "span",
        null,
        `${formatNumber(hitsBefore, 0)} → ${formatNumber(hitsAfter, 0)} at ${formatNumber(state.damage, 0)} dmg`
      )
    );
    fragment.appendChild(chartHead);

    const chart = createEl("div", "chart detail-chart");
    fragment.appendChild(chart);

    el.detailPanel.replaceChildren(fragment);
    renderDetailChart(chart, mob);
  }

  function exportCsv() {
    const rows = visibleRows();
    const dimensionsList = dimensions.map((entry) => entry.dimension);
    const damageAfter = afterFalloff(state.damage);

    const header = [
      "id",
      "name",
      "base_health",
      "health_multiplier",
      "effective_health_max",
      ...dimensionsList.map((dimension) => `effective_health_dim_${dimension}`),
      "pre_falloff_damage",
      "post_falloff_damage",
      "hits_before",
      "hits_after",
      "extra_hits",
      "percent_increase",
    ];

    const dataRows = rows.map((row) => [
      row.id,
      row.name,
      row.baseHealth,
      row.healthMultiplier,
      row.effectiveHealthMax,
      ...dimensionsList.map((dimension) => row.effectiveHealthByDimension[String(dimension)]),
      state.damage,
      Number(damageAfter.toFixed(4)),
      row.hitsBefore,
      row.hitsAfter,
      row.extraHits,
      Number(row.percentIncrease.toFixed(2)),
    ]);

    const csv = [header, ...dataRows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    const blob = new Blob([`${csv}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `srp-hits-to-kill-${state.damage}dmg.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function syncSortControls() {
    const hasOption = [...el.sortSelect.options].some((option) => option.value === state.sortKey);
    if (hasOption) el.sortSelect.value = state.sortKey;

    el.sortDirButton.textContent = state.sortDir === "asc" ? "Ascending" : "Descending";

    for (const th of el.sortHeaders) {
      if (th.dataset.sort === state.sortKey) {
        th.setAttribute("aria-sort", state.sortDir === "asc" ? "ascending" : "descending");
      } else {
        th.removeAttribute("aria-sort");
      }
    }
  }

  function syncMetricButtons() {
    for (const button of el.metricButtons) {
      button.classList.toggle("is-active", button.dataset.metric === state.metric);
    }
  }

  function resetAll() {
    state.damage = DEFAULT_DAMAGE;
    state.search = "";
    state.sortKey = "effectiveHealthMax";
    state.sortDir = "desc";
    state.metric = "damage";
    state.barMetric = "extraHits";
    state.selectedId = null;

    el.damageSlider.value = String(state.damage);
    el.damageNumber.value = String(state.damage);
    el.searchInput.value = "";
    el.barMetric.value = state.barMetric;

    updateRangeFill();
    syncSortControls();
    syncMetricButtons();
    render();
  }

  let renderTimer = null;

  function scheduleRender() {
    if (renderTimer !== null) return;
    renderTimer = window.setTimeout(() => {
      renderTimer = null;
      render();
    }, 16);
  }

  function render() {
    const rows = visibleRows();
    renderDamageNote();
    renderStats(rows);
    renderFalloffChart();
    renderTable(rows);
    renderBarChart(rows);
    renderDetail();
  }

  function bindEvents() {
    el.damageSlider.addEventListener("input", () => {
      setDamage(el.damageSlider.value, { updateSlider: false });
    });

    el.damageNumber.addEventListener("input", () => {
      const raw = el.damageNumber.value.trim();
      if (raw === "") return;

      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;

      const clamped = clamp(Math.round(parsed), MIN_DAMAGE, MAX_DAMAGE);
      state.damage = clamped;
      el.damageSlider.value = String(clamped);
      updateRangeFill();
      if (parsed !== clamped) el.damageNumber.value = String(clamped);
      scheduleRender();
    });

    el.damageNumber.addEventListener("blur", () => {
      const parsed = Number(el.damageNumber.value);
      if (!Number.isFinite(parsed)) {
        el.damageNumber.value = String(state.damage);
        return;
      }
      setDamage(parsed);
    });

    el.searchInput.addEventListener("input", () => {
      state.search = el.searchInput.value;
      scheduleRender();
    });

    el.sortSelect.addEventListener("change", () => {
      state.sortKey = el.sortSelect.value;
      state.sortDir = defaultDirForKey(state.sortKey);
      syncSortControls();
      render();
    });

    el.sortDirButton.addEventListener("click", () => {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      syncSortControls();
      render();
    });

    for (const th of el.sortHeaders) {
      const button = th.querySelector(".th-button");
      if (!button) continue;

      button.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = defaultDirForKey(key);
        }
        syncSortControls();
        render();
      });
    }

    for (const button of el.metricButtons) {
      button.addEventListener("click", () => {
        state.metric = button.dataset.metric;
        syncMetricButtons();
        renderFalloffChart();
      });
    }

    el.barMetric.addEventListener("change", () => {
      state.barMetric = el.barMetric.value;
      renderBarChart(visibleRows());
    });

    el.resetButton.addEventListener("click", resetAll);
    el.exportButton.addEventListener("click", exportCsv);

    window.addEventListener("scroll", hideTooltip, { passive: true });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      hideTooltip();
      if (state.selectedId) {
        state.selectedId = null;
        renderTable(visibleRows());
        renderDetail();
      }
    });
  }

  function init() {
    if (!DATA || !Array.isArray(mobs) || mobs.length === 0) {
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<p style="margin:20px;padding:16px;border:1px solid #7f1d1d;border-radius:10px;background:#2a0f12;color:#fecaca;">Could not load data/srp-data.js. Regenerate it with <code>node scripts/extract-srp-data.mjs</code>.</p>'
      );
      return;
    }

    el.heroMobCount.textContent = `${formatNumber(mobs.length, 0)} mobs`;
    el.damageSlider.value = String(state.damage);
    el.damageNumber.value = String(state.damage);
    el.barMetric.value = state.barMetric;

    const generatedDate = new Date(DATA.generatedAt);
    el.footerMeta.textContent = `Generated ${generatedDate.toLocaleString("en-US")} · ${formatNumber(mobs.length, 0)} mobs · max dimension ${maxDimension} at ${formatMultiplier(maxDimensionMultiplier)}.`;

    updateRangeFill();
    syncSortControls();
    syncMetricButtons();
    bindEvents();
    render();
  }

  init();
})();
