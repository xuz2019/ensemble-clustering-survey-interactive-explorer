"use strict";

const DATA_URL = "data/review-data.json";
const PALETTE = [
  "#187d79",
  "#c95f45",
  "#3e6f9e",
  "#a87919",
  "#725a9c",
  "#4f7b42",
  "#b05278",
  "#2f7d49",
  "#8a5a2f",
  "#5e738a",
];

let data = null;
const derived = {};
const state = {
  tab: "overview",
  query: "",
  metric: "NMI",
  methodCategory: "all",
  methodVenue: "all",
  methodSort: "metric-desc",
  heatmapCategory: "all",
  heatmapMethodCount: 20,
  selectedMethodIndex: 0,
  datasetName: "",
  heatmapDatasets: [],
  tableWorkbook: "",
  tableSheet: "",
  tableQuery: "",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading ${DATA_URL}`);
    }
    data = await response.json();
    deriveData();
    setupControls();
    bindEvents();
    render();
  } catch (error) {
    showLoadError(error);
  }
}

function deriveData() {
  state.metric = data.metrics[0] || "NMI";
  derived.categories = unique(data.methods.map((method) => method.category).filter(Boolean)).sort();
  derived.venues = unique(data.methods.map((method) => method.venue).filter(Boolean)).sort();
  derived.datasetNames = data.datasets.map((dataset) => dataset.name);
  derived.datasetByName = new Map(data.datasets.map((dataset) => [dataset.name, dataset]));
  derived.methodByIndex = new Map(data.methods.map((method) => [method.index, method]));
  derived.datasetIndexByMetric = {};
  Object.entries(data.matrix.mean).forEach(([metric, matrix]) => {
    derived.datasetIndexByMetric[metric] = new Map(
      matrix.datasets.map((datasetName, index) => [datasetName, index])
    );
  });

  state.datasetName = derived.datasetNames[0] || "";
  state.heatmapDatasets = derived.datasetNames.slice(0, 12);
  state.tableWorkbook = data.sourceFiles[0]?.file || "";
  state.tableSheet = data.rawWorkbooks[state.tableWorkbook]?.sheetOrder[0] || "";
}

function setupControls() {
  fillSelect($("#globalMetric"), data.metrics.map((metric) => option(metric, metric)), state.metric);
  fillSelect(
    $("#methodCategory"),
    [option("all", "All categories")].concat(derived.categories.map((category) => option(category, category))),
    state.methodCategory
  );
  fillSelect(
    $("#methodVenue"),
    [option("all", "All venues")].concat(derived.venues.map((venue) => option(venue, venue))),
    state.methodVenue
  );
  fillSelect(
    $("#heatmapCategory"),
    [option("all", "All categories")].concat(derived.categories.map((category) => option(category, category))),
    state.heatmapCategory
  );
  fillSelect(
    $("#datasetSelect"),
    data.datasets.map((dataset) => option(dataset.name, dataset.label)),
    state.datasetName
  );
  fillSelect(
    $("#workbookSelect"),
    data.sourceFiles.map((source) => option(source.file, source.file)),
    state.tableWorkbook
  );
  fillSheetSelect();
  fillHeatmapDatasetSelect();
}

function bindEvents() {
  $(".tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab) {
      return;
    }
    state.tab = tab.dataset.tab;
    activateTab();
  });

  $("#globalSearch").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  $("#globalMetric").addEventListener("change", (event) => {
    state.metric = event.target.value;
    render();
  });

  $("#methodCategory").addEventListener("change", (event) => {
    state.methodCategory = event.target.value;
    renderMethods();
  });

  $("#methodVenue").addEventListener("change", (event) => {
    state.methodVenue = event.target.value;
    renderMethods();
  });

  $("#methodSort").addEventListener("change", (event) => {
    state.methodSort = event.target.value;
    renderMethods();
  });

  $("#methodTable").addEventListener("click", handleMethodPick);
  $("#datasetRanking").addEventListener("click", handleMethodPick);
  $("#heatmapTable").addEventListener("click", handleMethodPick);

  $("#datasetSelect").addEventListener("change", (event) => {
    state.datasetName = event.target.value;
    renderDatasets();
  });

  $("#heatmapCategory").addEventListener("change", (event) => {
    state.heatmapCategory = event.target.value;
    renderHeatmap();
  });

  $("#heatmapMethodCount").addEventListener("change", (event) => {
    state.heatmapMethodCount = Number(event.target.value);
    renderHeatmap();
  });

  $("#heatmapDatasets").addEventListener("change", (event) => {
    state.heatmapDatasets = Array.from(event.target.selectedOptions).map((selected) => selected.value);
    renderHeatmap();
  });

  $("#spreadDatasets").addEventListener("click", () => {
    state.heatmapDatasets = highSpreadDatasets(state.metric, 12);
    fillHeatmapDatasetSelect();
    renderHeatmap();
  });

  $("#resetDatasets").addEventListener("click", () => {
    state.heatmapDatasets = derived.datasetNames.slice(0, 12);
    fillHeatmapDatasetSelect();
    renderHeatmap();
  });

  $("#workbookSelect").addEventListener("change", (event) => {
    state.tableWorkbook = event.target.value;
    state.tableSheet = data.rawWorkbooks[state.tableWorkbook]?.sheetOrder[0] || "";
    fillSheetSelect();
    renderRawTable();
  });

  $("#sheetSelect").addEventListener("change", (event) => {
    state.tableSheet = event.target.value;
    renderRawTable();
  });

  $("#tableSearch").addEventListener("input", (event) => {
    state.tableQuery = event.target.value.trim().toLowerCase();
    renderRawTable();
  });
}

function render() {
  if (!data) {
    return;
  }
  activateTab();
  renderHeader();
  renderOverview();
  renderMethods();
  renderDatasets();
  renderHeatmap();
  renderRawTable();
}

function renderHeader() {
  const generated = new Date(data.generatedAt);
  const sheetCount = data.sourceFiles.reduce((sum, source) => sum + source.sheets.length, 0);
  $("#sourceStamp").textContent = `${data.sourceFiles.length} workbooks, ${sheetCount} sheets, generated ${generated.toLocaleString()}`;
  $("#globalMetric").value = state.metric;
}

function renderOverview() {
  const sheetCount = data.sourceFiles.reduce((sum, source) => sum + source.sheets.length, 0);
  const stats = [
    ["Methods", data.methods.length],
    ["Datasets", data.datasets.length],
    ["Metrics", data.metrics.length],
    ["Sheets", sheetCount],
  ];
  $("#statsGrid").innerHTML = stats
    .map(([label, value]) => `<div class="stat"><strong>${formatCount(value)}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");

  const visibleMethods = filterByGlobalQuery(data.methods).sort((a, b) => metricValue(b) - metricValue(a));
  const topMethods = visibleMethods.slice(0, 12).map((method) => ({
    label: `${method.id} ${method.method}`,
    sublabel: method.category,
    value: metricValue(method),
    color: categoryColor(method.category),
    title: method.displayName,
  }));
  $("#topMethodsLabel").textContent = state.metric;
  renderHorizontalBars("#topMethodsChart", topMethods, { max: 1, valueLabel: state.metric });

  const categoryItems = derived.categories
    .map((category) => {
      const methods = data.methods.filter((method) => method.category === category);
      return {
        label: category,
        value: average(methods.map((method) => metricValue(method))),
        color: categoryColor(category),
      };
    })
    .filter((item) => item.value !== null)
    .sort((a, b) => b.value - a.value);
  $("#categoryMeansLabel").textContent = state.metric;
  renderHorizontalBars("#categoryChart", categoryItems, { max: 1, valueLabel: state.metric });

  const runtimeItems = filterByGlobalQuery(data.methods)
    .filter((method) => isFiniteNumber(method.runtime.average) && isFiniteNumber(metricValue(method)))
    .map((method) => ({
      x: Math.log10(Number(method.runtime.average) + 1),
      y: metricValue(method),
      xRaw: method.runtime.average,
      category: method.category,
      label: `${method.id} ${method.method}`,
    }));
  renderScatter("#runtimeScatter", runtimeItems, {
    xLabel: "log10(seconds + 1)",
    yLabel: state.metric,
    title: "Runtime vs metric",
    formatX: (value) => formatNumber(Math.pow(10, value) - 1, 2),
  });

  const hyperItems = filterByGlobalQuery(data.methods)
    .filter((method) => isFiniteNumber(method.hyperparameter.count) && isFiniteNumber(metricValue(method)))
    .map((method) => ({
      x: method.hyperparameter.count,
      y: metricValue(method),
      xRaw: method.hyperparameter.count,
      category: method.category,
      label: `${method.id} ${method.method}`,
    }));
  renderScatter("#hyperScatter", hyperItems, {
    xLabel: "hyperparameter count",
    yLabel: state.metric,
    title: "Hyperparameter count vs metric",
    formatX: (value) => formatNumber(value, 0),
  });

  $("#sourceGrid").innerHTML = data.sourceFiles
    .map((source) => {
      const rows = source.sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);
      return `<div class="source-item">
        <strong title="${escapeAttr(source.file)}">${escapeHtml(source.file)}</strong>
        <span>${source.sheets.length} sheets</span>
        <span>${formatCount(rows)} rows</span>
        <span>${formatCount(Math.round(source.bytes / 1024))} KB</span>
      </div>`;
    })
    .join("");
}

function renderMethods() {
  const methods = sortMethods(getMethodRows());
  $("#methodCountLabel").textContent = `${methods.length} / ${data.methods.length}`;
  if (!methods.length) {
    $("#methodTable").innerHTML = `<div class="empty-state">No matching methods.</div>`;
  } else {
    $("#methodTable").innerHTML = `<table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Method</th>
          <th>Category</th>
          <th>Venue</th>
          <th class="numeric">${escapeHtml(state.metric)}</th>
          <th class="numeric">Runtime</th>
          <th class="numeric">Params</th>
        </tr>
      </thead>
      <tbody>
        ${methods
          .map((method) => {
            const selected = method.index === state.selectedMethodIndex ? " is-selected" : "";
            return `<tr class="method-row${selected}" data-method-index="${method.index}">
              <td><span class="pill">${escapeHtml(method.id)}</span></td>
              <td>
                <div class="method-name">
                  <strong>${escapeHtml(method.method)}</strong>
                  <span>${escapeHtml(shortName(method.displayName, 76))}</span>
                </div>
              </td>
              <td>${escapeHtml(method.category)}</td>
              <td>${escapeHtml(method.venue)}</td>
              <td class="numeric">${formatNumber(metricValue(method), 4)}</td>
              <td class="numeric">${formatRuntime(method.runtime.average)}</td>
              <td class="numeric">${formatMaybeNumber(method.hyperparameter.count, 0)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
  }
  renderMethodDetail();
}

function renderMethodDetail() {
  const method = derived.methodByIndex.get(state.selectedMethodIndex) || data.methods[0];
  if (!method) {
    $("#methodDetail").innerHTML = `<div class="empty-state">No method selected.</div>`;
    return;
  }
  const metricBars = data.metrics
    .map((metric) => {
      const value = method.metrics[metric];
      const width = Math.max(0, Math.min(100, Number(value || 0) * 100));
      return `<div class="mini-bar-row">
        <span>${escapeHtml(metric)}</span>
        <div class="mini-track"><div class="mini-fill" style="width:${width}%"></div></div>
        <strong class="numeric">${formatNumber(value, 3)}</strong>
      </div>`;
    })
    .join("");

  const datasetLeaders = data.datasets
    .map((dataset) => ({
      dataset,
      value: datasetValue(method.index, state.metric, dataset.name, "mean"),
    }))
    .filter((item) => isFiniteNumber(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  $("#methodDetail").innerHTML = `<div class="detail-body">
    <div class="detail-title">
      <span class="pill">${escapeHtml(method.id)}</span>
      <h2>${escapeHtml(method.method)}</h2>
      <p>${escapeHtml(method.displayName)}</p>
    </div>

    <div class="meta-grid">
      <div class="meta-box"><span>Category</span><strong>${escapeHtml(method.category || "NA")}</strong></div>
      <div class="meta-box"><span>Venue</span><strong>${escapeHtml(method.venue || "NA")}</strong></div>
      <div class="meta-box"><span>Avg. runtime</span><strong>${formatRuntime(method.runtime.average)}</strong></div>
      <div class="meta-box"><span>Timeouts</span><strong>${formatMaybeNumber(method.runtime.timeouts, 0)}</strong></div>
    </div>

    <div>
      <h3 class="detail-subhead">Metric Profile</h3>
      <div class="mini-bars">${metricBars}</div>
    </div>

    <div>
      <h3 class="detail-subhead">Parameter Setup</h3>
      <p class="detail-text">${escapeHtml(method.parameterSetup || "NA")}</p>
    </div>

    <div>
      <h3 class="detail-subhead">Strongest Datasets (${escapeHtml(state.metric)})</h3>
      <div class="mini-bars">
        ${datasetLeaders
          .map((item) => `<div class="mini-bar-row">
            <span title="${escapeAttr(item.dataset.label)}">${escapeHtml(shortName(item.dataset.label, 18))}</span>
            <div class="mini-track"><div class="mini-fill" style="width:${Math.max(0, Math.min(100, item.value * 100))}%"></div></div>
            <strong class="numeric">${formatNumber(item.value, 3)}</strong>
          </div>`)
          .join("") || `<p class="detail-text">NA</p>`}
      </div>
    </div>
  </div>`;
}

function renderDatasets() {
  const dataset = derived.datasetByName.get(state.datasetName) || data.datasets[0];
  if (!dataset) {
    return;
  }
  $("#datasetSelect").value = dataset.name;
  $("#datasetMetaLabel").textContent = dataset.sourceName || dataset.name;
  $("#datasetProfile").innerHTML = `<div class="profile-list">
    <div class="profile-row"><span>Name</span><strong>${escapeHtml(dataset.label)}</strong></div>
    <div class="profile-row"><span>Instances</span><strong>${formatMaybeNumber(dataset.instances, 0)}</strong></div>
    <div class="profile-row"><span>Features</span><strong>${formatMaybeNumber(dataset.features, 0)}</strong></div>
    <div class="profile-row"><span>Classes</span><strong>${formatMaybeNumber(dataset.classes, 0)}</strong></div>
  </div>`;

  const ranked = data.methods
    .map((method) => ({
      method,
      mean: datasetValue(method.index, state.metric, dataset.name, "mean"),
      std: datasetValue(method.index, state.metric, dataset.name, "std"),
    }))
    .filter((row) => isFiniteNumber(row.mean))
    .sort((a, b) => b.mean - a.mean);

  $("#datasetMetricLabel").textContent = state.metric;
  renderHorizontalBars(
    "#datasetTopChart",
    ranked.slice(0, 12).map((row) => ({
      label: `${row.method.id} ${row.method.method}`,
      sublabel: row.method.category,
      value: row.mean,
      color: categoryColor(row.method.category),
      title: row.method.displayName,
    })),
    { max: 1, valueLabel: state.metric }
  );

  $("#datasetRankLabel").textContent = `${ranked.length} methods`;
  $("#datasetRanking").innerHTML = `<table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Method</th>
        <th>Category</th>
        <th class="numeric">Mean</th>
        <th class="numeric">Std.</th>
        <th class="numeric">Average ${escapeHtml(state.metric)}</th>
      </tr>
    </thead>
    <tbody>
      ${ranked
        .slice(0, 30)
        .map((row, index) => `<tr class="method-row" data-method-index="${row.method.index}">
          <td>${index + 1}</td>
          <td><div class="method-name"><strong>${escapeHtml(row.method.method)}</strong><span>${escapeHtml(row.method.id)} - ${escapeHtml(row.method.venue)}</span></div></td>
          <td>${escapeHtml(row.method.category)}</td>
          <td class="numeric">${formatNumber(row.mean, 4)}</td>
          <td class="numeric">${formatMaybeNumber(row.std, 4)}</td>
          <td class="numeric">${formatNumber(metricValue(row.method), 4)}</td>
        </tr>`)
        .join("")}
    </tbody>
  </table>`;
}

function renderHeatmap() {
  const selectedDatasets = state.heatmapDatasets.length ? state.heatmapDatasets : derived.datasetNames.slice(0, 12);
  const methods = data.methods
    .filter((method) => state.heatmapCategory === "all" || method.category === state.heatmapCategory)
    .filter((method) => matchesGlobalQuery(method))
    .sort((a, b) => metricValue(b) - metricValue(a))
    .slice(0, state.heatmapMethodCount);

  const allValues = [];
  methods.forEach((method) => {
    selectedDatasets.forEach((datasetName) => {
      const value = datasetValue(method.index, state.metric, datasetName, "mean");
      if (isFiniteNumber(value)) {
        allValues.push(value);
      }
    });
  });
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 1);

  $("#heatmapLabel").textContent = `${state.metric} - ${methods.length} methods - ${selectedDatasets.length} datasets`;
  if (!methods.length || !selectedDatasets.length) {
    $("#heatmapTable").innerHTML = `<div class="empty-state">No heatmap data.</div>`;
    return;
  }

  $("#heatmapTable").innerHTML = `<table class="heatmap-table">
    <thead>
      <tr>
        <th>Method</th>
        ${selectedDatasets
          .map((datasetName) => {
            const dataset = derived.datasetByName.get(datasetName);
            const label = dataset ? dataset.label : datasetName;
            return `<th title="${escapeAttr(label)}">${escapeHtml(shortName(label, 20))}</th>`;
          })
          .join("")}
      </tr>
    </thead>
    <tbody>
      ${methods
        .map((method) => `<tr class="method-row" data-method-index="${method.index}">
          <td><div class="method-name"><strong>${escapeHtml(method.id)}</strong><span>${escapeHtml(shortName(method.method, 34))}</span></div></td>
          ${selectedDatasets
            .map((datasetName) => {
              const value = datasetValue(method.index, state.metric, datasetName, "mean");
              if (!isFiniteNumber(value)) {
                return `<td class="numeric">NA</td>`;
              }
              const heat = heatColor(value, minValue, maxValue);
              const textColor = heat.textDark ? "#102124" : "#ffffff";
              return `<td class="heat-cell" style="background:${heat.color};color:${textColor}" title="${escapeAttr(formatNumber(value, 6))}">${formatNumber(value, 3)}</td>`;
            })
            .join("")}
        </tr>`)
        .join("")}
    </tbody>
  </table>`;
}

function renderRawTable() {
  const workbook = data.rawWorkbooks[state.tableWorkbook];
  const sheet = workbook?.sheets[state.tableSheet];
  if (!workbook || !sheet) {
    $("#rawTable").innerHTML = `<div class="empty-state">No sheet selected.</div>`;
    return;
  }

  $("#workbookSelect").value = state.tableWorkbook;
  $("#sheetSelect").value = state.tableSheet;
  $("#rawTableTitle").textContent = state.tableSheet;

  const query = state.tableQuery;
  const rows = query
    ? sheet.rows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(query)))
    : sheet.rows;

  $("#rawTableLabel").textContent = `${rows.length} / ${sheet.rowCount} rows - ${sheet.columnCount} columns`;
  const headers = sheet.headers.map((header, index) => header || `Column ${index + 1}`);
  if (!rows.length) {
    $("#rawTable").innerHTML = `<div class="empty-state">No matching rows.</div>`;
    return;
  }

  $("#rawTable").innerHTML = `<table>
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => `<tr>${headers
          .map((_, index) => {
            const value = row[index] ?? "";
            const numeric = isFiniteNumber(value) ? " numeric" : "";
            return `<td class="${numeric}" title="${escapeAttr(rawValue(value))}">${escapeHtml(rawValue(value))}</td>`;
          })
          .join("")}</tr>`)
        .join("")}
    </tbody>
  </table>`;
}

function activateTab() {
  $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === state.tab));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === state.tab));
}

function fillSheetSelect() {
  const workbook = data.rawWorkbooks[state.tableWorkbook];
  const sheets = workbook ? workbook.sheetOrder : [];
  fillSelect($("#sheetSelect"), sheets.map((sheetName) => option(sheetName, sheetName)), state.tableSheet);
}

function fillHeatmapDatasetSelect() {
  const select = $("#heatmapDatasets");
  select.innerHTML = data.datasets
    .map((dataset) => `<option value="${escapeAttr(dataset.name)}">${escapeHtml(dataset.label)}</option>`)
    .join("");
  Array.from(select.options).forEach((item) => {
    item.selected = state.heatmapDatasets.includes(item.value);
  });
}

function option(value, label) {
  return { value, label };
}

function fillSelect(element, options, value) {
  element.innerHTML = options
    .map((item) => `<option value="${escapeAttr(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  if (value !== undefined && value !== null) {
    element.value = value;
  }
}

function handleMethodPick(event) {
  const row = event.target.closest("[data-method-index]");
  if (!row) {
    return;
  }
  state.selectedMethodIndex = Number(row.dataset.methodIndex);
  state.tab = "methods";
  render();
}

function getMethodRows() {
  return data.methods
    .filter((method) => state.methodCategory === "all" || method.category === state.methodCategory)
    .filter((method) => state.methodVenue === "all" || method.venue === state.methodVenue)
    .filter((method) => matchesGlobalQuery(method));
}

function sortMethods(methods) {
  const copy = methods.slice();
  copy.sort((a, b) => {
    if (state.methodSort === "metric-asc") {
      return metricValue(a) - metricValue(b);
    }
    if (state.methodSort === "runtime-asc") {
      return sortableRuntime(a) - sortableRuntime(b);
    }
    if (state.methodSort === "runtime-desc") {
      return sortableRuntime(b) - sortableRuntime(a);
    }
    if (state.methodSort === "method-asc") {
      return a.method.localeCompare(b.method);
    }
    return metricValue(b) - metricValue(a);
  });
  return copy;
}

function filterByGlobalQuery(methods) {
  return methods.filter((method) => matchesGlobalQuery(method));
}

function matchesGlobalQuery(method) {
  if (!state.query) {
    return true;
  }
  const text = [
    method.id,
    method.method,
    method.displayName,
    method.category,
    method.venue,
    method.parameterSetup,
    method.hyperparameter.countedTerms,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(state.query);
}

function metricValue(method) {
  const value = method?.metrics?.[state.metric];
  return isFiniteNumber(value) ? Number(value) : 0;
}

function sortableRuntime(method) {
  return isFiniteNumber(method.runtime.average) ? Number(method.runtime.average) : Number.POSITIVE_INFINITY;
}

function datasetValue(methodIndex, metric, datasetName, kind) {
  const matrix = data.matrix[kind]?.[metric];
  const indexMap = derived.datasetIndexByMetric[metric];
  const datasetIndex = indexMap?.get(datasetName);
  if (!matrix || datasetIndex === undefined) {
    return null;
  }
  const row = matrix.values[methodIndex];
  const value = row ? row[datasetIndex] : null;
  return isFiniteNumber(value) ? Number(value) : null;
}

function highSpreadDatasets(metric, count) {
  const matrix = data.matrix.mean[metric];
  if (!matrix) {
    return derived.datasetNames.slice(0, count);
  }
  return matrix.datasets
    .map((datasetName, datasetIndex) => {
      const values = matrix.values.map((row) => row[datasetIndex]).filter(isFiniteNumber).map(Number);
      return {
        datasetName,
        spread: values.length ? Math.max(...values) - Math.min(...values) : -1,
      };
    })
    .sort((a, b) => b.spread - a.spread)
    .slice(0, count)
    .map((item) => item.datasetName);
}

function renderHorizontalBars(selector, items, options = {}) {
  const container = typeof selector === "string" ? $(selector) : selector;
  const values = items.map((item) => item.value).filter(isFiniteNumber).map(Number);
  if (!items.length || !values.length) {
    container.innerHTML = `<div class="empty-state">No chart data.</div>`;
    return;
  }
  const width = 860;
  const rowHeight = 34;
  const margin = { top: 12, right: 74, bottom: 18, left: 252 };
  const height = margin.top + margin.bottom + rowHeight * items.length;
  const max = options.max || Math.max(...values, 1);
  const chartWidth = width - margin.left - margin.right;

  const rows = items
    .map((item, index) => {
      const y = margin.top + index * rowHeight + 5;
      const value = Number(item.value || 0);
      const barWidth = Math.max(2, (Math.max(0, value) / max) * chartWidth);
      const label = shortName(item.label, 34);
      const sublabel = item.sublabel ? shortName(item.sublabel, 32) : "";
      return `<g>
        <title>${escapeHtml(item.title || item.label)} - ${formatNumber(value, 5)}</title>
        <text x="8" y="${y + 13}" class="svg-label">${escapeHtml(label)}</text>
        <text x="8" y="${y + 28}" class="svg-sublabel">${escapeHtml(sublabel)}</text>
        <rect x="${margin.left}" y="${y}" width="${chartWidth}" height="20" rx="4" fill="#e8eeec"></rect>
        <rect x="${margin.left}" y="${y}" width="${barWidth}" height="20" rx="4" fill="${item.color || PALETTE[index % PALETTE.length]}"></rect>
        <text x="${width - 8}" y="${y + 15}" text-anchor="end" class="svg-value">${formatNumber(value, 3)}</text>
      </g>`;
    })
    .join("");

  container.innerHTML = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(options.valueLabel || "bar chart")}">
    <style>
      .svg-label{font:700 13px Inter,system-ui,sans-serif;fill:#1c2427}
      .svg-sublabel{font:11px Inter,system-ui,sans-serif;fill:#627074}
      .svg-value{font:700 12px Inter,system-ui,sans-serif;fill:#243033}
    </style>
    ${rows}
  </svg>`;
}

function renderScatter(selector, items, options) {
  const container = typeof selector === "string" ? $(selector) : selector;
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">No chart data.</div>`;
    return;
  }

  const width = 760;
  const height = 330;
  const margin = { top: 22, right: 22, bottom: 48, left: 58 };
  const xs = items.map((item) => Number(item.x)).filter(isFiniteNumber);
  const ys = items.map((item) => Number(item.y)).filter(isFiniteNumber);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 0.1;
    maxY += 0.1;
  }
  const padY = (maxY - minY) * 0.08;
  minY = Math.max(0, minY - padY);
  maxY = Math.min(1, maxY + padY);
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const sx = (value) => margin.left + ((value - minX) / (maxX - minX)) * plotW;
  const sy = (value) => margin.top + (1 - (value - minY) / (maxY - minY)) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const grid = ticks
    .map((tick) => {
      const yValue = minY + (maxY - minY) * tick;
      const y = sy(yValue);
      return `<g>
        <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="#e4ebe8"></line>
        <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" class="axis-text">${formatNumber(yValue, 2)}</text>
      </g>`;
    })
    .join("");

  const points = items
    .map((item) => {
      const x = sx(Number(item.x));
      const y = sy(Number(item.y));
      return `<circle cx="${x}" cy="${y}" r="4.8" fill="${categoryColor(item.category)}" opacity="0.82">
        <title>${escapeHtml(item.label)} - x ${escapeHtml(options.formatX ? options.formatX(item.xRaw) : formatNumber(item.xRaw, 2))} - y ${formatNumber(item.y, 4)}</title>
      </circle>`;
    })
    .join("");

  container.innerHTML = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(options.title)}">
    <style>
      .axis-text{font:11px Inter,system-ui,sans-serif;fill:#627074}
      .axis-label{font:700 12px Inter,system-ui,sans-serif;fill:#334043}
    </style>
    <rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" fill="#fbfcfa" stroke="#d9e0de"></rect>
    ${grid}
    <line x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}" stroke="#aab8b5"></line>
    <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#aab8b5"></line>
    ${points}
    <text x="${margin.left + plotW / 2}" y="${height - 10}" text-anchor="middle" class="axis-label">${escapeHtml(options.xLabel)}</text>
    <text x="16" y="${margin.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 16 ${margin.top + plotH / 2})" class="axis-label">${escapeHtml(options.yLabel)}</text>
  </svg>`;
}

function categoryColor(category) {
  const index = Math.max(0, derived.categories.indexOf(category));
  return PALETTE[index % PALETTE.length];
}

function heatColor(value, minValue, maxValue) {
  const ratio = maxValue === minValue ? 0.5 : (value - minValue) / (maxValue - minValue);
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = 24 + clamped * 156;
  const saturation = 68 - clamped * 12;
  const lightness = 91 - clamped * 44;
  return {
    color: `hsl(${hue} ${saturation}% ${lightness}%)`,
    textDark: clamped < 0.64,
  };
}

function average(values) {
  const nums = values.filter(isFiniteNumber).map(Number);
  if (!nums.length) {
    return null;
  }
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function unique(values) {
  return Array.from(new Set(values));
}

function isFiniteNumber(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

function formatNumber(value, digits = 3) {
  if (!isFiniteNumber(value)) {
    return "NA";
  }
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function formatMaybeNumber(value, digits = 3) {
  return isFiniteNumber(value) ? formatNumber(value, digits) : "NA";
}

function formatRuntime(value) {
  if (value === "TO") {
    return "TO";
  }
  if (!isFiniteNumber(value)) {
    return "NA";
  }
  return `${formatNumber(value, Number(value) >= 100 ? 1 : 2)}s`;
}

function formatCount(value) {
  if (!isFiniteNumber(value)) {
    return "NA";
  }
  return Number(value).toLocaleString();
}

function rawValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function shortName(value, maxLength) {
  const text = rawValue(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function escapeHtml(value) {
  return rawValue(value).replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showLoadError(error) {
  const target = $("#loadError");
  target.hidden = false;
  target.textContent = `Could not load ${DATA_URL}. Start a local static server from interactive_review_explorer and open it over http://. ${error.message}`;
}
