import type {
  EmotionBucket,
  FullReport,
  QuestionLens,
  ShiftFamily,
  ShiftFinding,
  SourceRef,
  TrendState,
} from "../lib/types";
import { activityMonthWindow } from "../lib/period";
import { formatNumber, truncate } from "./dom-utils";
import { areaY, dot, lineY, plot, rectY, ruleX, ruleY, text as plotText } from "@observablehq/plot";

type AtlasContext = {
  clearsConfidence: (score: number) => boolean;
  showEvidence: (title: string, sources: SourceRef[], notes?: string[]) => void;
  periodMonths: number | null;
  rhythmMeasure: "conversations" | "words";
  rhythmRouteId: "all" | QuestionLens["id"];
};

type RepeatPoint = {
  id: string;
  label: string;
  kind: "Exact wording" | "Meaning match";
  count: number;
  spanDays: number;
  confidence: number | null;
  sources: SourceRef[];
  latestDate: number;
};

const ROUTE_COLORS = ["#2157d5", "#008b7a", "#ef4b3e", "#8652c7", "#dc8700"];

const EMOTION_META: Record<EmotionBucket, { label: string; color: string }> = {
  curiosity: { label: "Curiosity", color: "#2157d5" },
  frustration: { label: "Frustration", color: "#ef4b3e" },
  urgency: { label: "Urgency", color: "#dc8700" },
  uncertainty: { label: "Uncertainty", color: "#8652c7" },
  excitement: { label: "Excitement", color: "#cf3fa0" },
  appreciation: { label: "Appreciation", color: "#008b7a" },
  neutral: { label: "Neutral / direct", color: "#66767d" },
};

const TREND_COLORS: Record<TrendState, string> = {
  emerging: "#008b7a",
  fading: "#ef4b3e",
  resurfacing: "#8652c7",
  steady: "#2157d5",
  insufficient: "#66767d",
};

const TREND_LABELS: Record<TrendState, string> = {
  emerging: "Emerging",
  fading: "Fading",
  resurfacing: "Resurfacing",
  steady: "Steady",
  insufficient: "Not enough history",
};

const shortMonthFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  timeZone: "UTC",
});
const fullDateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function $(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing visual atlas element: ${selector}`);
  return element;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  value?: string,
  className?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function formatMonth(label: string): string {
  const date = new Date(`${label}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? label : shortMonthFormat.format(date);
}

function formatIsoDate(label: string): string {
  const date = new Date(`${label}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? label : fullDateFormat.format(date);
}

function emptyState(message: string): HTMLElement {
  return element("p", message, "atlas-empty");
}

function evidenceButton(
  label: string,
  meta: string,
  sources: SourceRef[],
  context: AtlasContext,
  notes: string[]
): HTMLButtonElement {
  const button = element("button", undefined, "chart-data-row");
  button.type = "button";
  button.append(element("strong", label), element("span", meta));
  button.addEventListener("click", () => context.showEvidence(label, sources, notes));
  return button;
}

function renderAtlasHighlight(report: FullReport, context: AtlasContext) {
  const button = document.querySelector<HTMLButtonElement>("#atlas-highlight");
  if (!button) return;
  const months = new Set(activityMonthWindow(report.deterministic, context.periodMonths));
  const ranked = report.deterministic.lenses.categories
    .map((lens) => ({
      lens,
      count: lens.byMonth
        .filter((datum) => months.has(datum.label))
        .reduce((sum, datum) => sum + datum.value, 0),
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
  const strongest = ranked[0];
  if (!strongest) {
    button.hidden = true;
    button.onclick = null;
    return;
  }
  const periodLabel =
    context.periodMonths === null
      ? "across all history"
      : `in the recent ${context.periodMonths} months`;
  $("#atlas-highlight-title").textContent =
    `${strongest.lens.label} was your busiest question route.`;
  $("#atlas-highlight-detail").textContent =
    `${formatNumber(strongest.count)} matched queries ${periodLabel}. Categories overlap, so this is a route into the evidence—not a personality label.`;
  const periodSources = strongest.lens.sources.filter((source) => {
    const date = new Date(source.date);
    if (Number.isNaN(date.getTime())) return false;
    return months.has(date.toISOString().slice(0, 7));
  });
  const sources = periodSources.length ? periodSources : strongest.lens.sources;
  button.onclick = () =>
    context.showEvidence(`${strongest.lens.label} questions`, sources, [
      `${formatNumber(strongest.count)} matched queries ${periodLabel}.`,
      strongest.lens.description,
      "Question categories can overlap.",
    ]);
  button.hidden = false;
}

function ditherPatternMark(colors: string[]) {
  return () => {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    colors.forEach((color, index) => {
      const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
      pattern.setAttribute("id", `atlas-dither-${index}`);
      pattern.setAttribute("width", "6");
      pattern.setAttribute("height", "6");
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      background.setAttribute("width", "6");
      background.setAttribute("height", "6");
      background.setAttribute("fill", color);
      background.setAttribute("fill-opacity", "0.82");
      const dotMark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dotMark.setAttribute("cx", "1.5");
      dotMark.setAttribute("cy", "1.5");
      dotMark.setAttribute("r", "0.8");
      dotMark.setAttribute("fill", "#f3f5f2");
      dotMark.setAttribute("fill-opacity", "0.72");
      const secondDot = dotMark.cloneNode() as SVGCircleElement;
      secondDot.setAttribute("cx", "4.5");
      secondDot.setAttribute("cy", "4.5");
      pattern.append(background, dotMark, secondDot);
      defs.append(pattern);
    });
    return defs;
  };
}

function attachPlotActions(
  chart: HTMLElement,
  selector: string,
  actions: Array<() => void>,
  labels: string[]
) {
  const marks = [...chart.querySelectorAll<SVGElement>(selector)];
  if (marks.length !== actions.length) return;
  marks.forEach((mark, index) => {
    mark.setAttribute("tabindex", "0");
    mark.setAttribute("role", "button");
    mark.setAttribute("aria-label", labels[index]);
    const activate = () => actions[index]();
    mark.addEventListener("click", activate);
    mark.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function renderActivityCalendar(report: FullReport, context: AtlasContext) {
  const chart = $("#activity-calendar");
  const data = $("#activity-calendar-data");
  const activity = report.deterministic.activityByDay;
  if (!activity) {
    chart.replaceChildren(
      emptyState("Daily detail was not stored in this older snapshot. Re-import the ZIP to add it.")
    );
    data.replaceChildren(
      element(
        "p",
        "Monthly activity is still available below in Rhythms. Re-import the original ZIP for daily values."
      )
    );
    return;
  }
  if (activity.length === 0 || !report.deterministic.dateRange.end) {
    chart.replaceChildren(emptyState("No dated conversations were available for a calendar."));
    data.replaceChildren(element("p", "No dated daily activity."));
    return;
  }

  const selectedMonths = activityMonthWindow(report.deterministic, context.periodMonths);
  if (selectedMonths.length === 0) {
    chart.replaceChildren(emptyState("No dated conversations were available in this period."));
    data.replaceChildren(element("p", "No dated daily activity in this period."));
    return;
  }
  const selectedMonthSet = new Set(selectedMonths);
  const end = new Date(report.deterministic.dateRange.end * 1_000);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const start = new Date(`${selectedMonths[0]}-01T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const visibleWeeks = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime() + 86_400_000) / (7 * 86_400_000))
  );
  const periodLabel =
    context.periodMonths === null
      ? `all history · ${selectedMonths.length} months`
      : `recent ${context.periodMonths} months`;
  $("#activity-window-label").textContent =
    `Conversation starts · ${periodLabel} · ${visibleWeeks} weeks`;
  const byDay = new Map(activity.map((datum) => [datum.label, datum]));
  const visibleDays = Array.from({ length: visibleWeeks * 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const label = date.toISOString().slice(0, 10);
    const month = label.slice(0, 7);
    return { date, label, datum: selectedMonthSet.has(month) ? byDay.get(label) : undefined };
  });
  const max = Math.max(1, ...visibleDays.map(({ datum }) => datum?.value ?? 0));

  const monthLine = element("div", undefined, "calendar-months");
  const seenMonths = new Set<string>();
  monthLine.style.setProperty("--week-count", String(visibleWeeks));
  for (let week = 0; week < visibleWeeks; week += 1) {
    const date = visibleDays[week * 7]?.date;
    const month = date?.toISOString().slice(0, 7) ?? "";
    const label = month && !seenMonths.has(month) ? formatMonth(month) : "";
    if (month) seenMonths.add(month);
    monthLine.append(element("span", label));
  }

  const dayLabels = element("div", undefined, "calendar-day-labels");
  for (const label of ["S", "M", "T", "W", "T", "F", "S"]) {
    dayLabels.append(element("span", label));
  }
  const cells = element("div", undefined, "calendar-cells");
  cells.style.setProperty("--week-count", String(visibleWeeks));
  for (const { label, datum } of visibleDays) {
    const value = datum?.value ?? 0;
    if (value === 0) {
      const cell = element("i");
      cell.setAttribute("aria-hidden", "true");
      cells.append(cell);
      continue;
    }
    const mark = element("span");
    mark.className = "calendar-day";
    mark.style.setProperty("--level", String(Math.max(0.12, value / max)));
    mark.setAttribute("aria-hidden", "true");
    mark.title = `${formatIsoDate(label)} · ${formatNumber(value)} conversation${value === 1 ? "" : "s"}`;
    cells.append(mark);
  }

  const calendarBody = element("div", undefined, "calendar-body");
  calendarBody.append(dayLabels, cells);
  const scale = element("div", undefined, "calendar-scale");
  scale.append(
    element("span", "Quiet"),
    ...[0.18, 0.38, 0.62, 0.88].map((level) => {
      const mark = element("i");
      mark.style.setProperty("--level", String(level));
      return mark;
    }),
    element("span", "Busy")
  );
  const calendarWindow = element("div", undefined, "calendar-window");
  calendarWindow.style.setProperty("--week-count", String(visibleWeeks));
  calendarWindow.append(monthLine, calendarBody);
  const calendarScroll = element("div", undefined, "calendar-scroll");
  calendarScroll.tabIndex = 0;
  calendarScroll.setAttribute(
    "aria-label",
    `Daily conversation activity for ${periodLabel}. Scroll horizontally for earlier dates.`
  );
  calendarScroll.append(calendarWindow);
  chart.replaceChildren(calendarScroll, scale);
  window.requestAnimationFrame(() => {
    calendarScroll.scrollLeft = calendarScroll.scrollWidth;
  });

  const active = visibleDays.filter(({ datum }) => (datum?.value ?? 0) > 0).reverse();
  data.replaceChildren(
    ...(active.length
      ? active.map(({ label, datum }) =>
          evidenceButton(
            formatIsoDate(label),
            `${formatNumber(datum?.value ?? 0)} conversation${datum?.value === 1 ? "" : "s"}`,
            datum?.sources ?? [],
            context,
            [`Daily activity in the selected ${periodLabel} window.`]
          )
        )
      : [element("p", `No active days in the selected ${periodLabel} window.`)])
  );
}

function renderQuestionMix(report: FullReport, context: AtlasContext) {
  const chart = $("#question-mix-chart");
  const legend = $("#question-mix-legend");
  const data = $("#question-mix-data");
  chart.replaceChildren();
  const months = activityMonthWindow(report.deterministic, context.periodMonths);
  $("#question-window-label").textContent =
    `Top five overlapping query routes · ${context.periodMonths === null ? "all history" : `recent ${context.periodMonths} months`}`;
  const lenses = report.deterministic.lenses.categories
    .slice()
    .sort((left, right) => right.queryCount - left.queryCount)
    .slice(0, 5);
  if (months.length === 0 || lenses.length === 0) {
    legend.replaceChildren();
    data.replaceChildren(element("p", "No chronological question-lens data."));
    chart.append(emptyState("No chronological question-lens data."));
    return;
  }

  const stacked: Array<{
    month: string;
    label: string;
    value: number;
    y1: number;
    y2: number;
    fill: string;
  }> = [];
  for (const month of months) {
    let total = 0;
    lenses.forEach((lens, index) => {
      const value = lens.byMonth.find((datum) => datum.label === month)?.value ?? 0;
      stacked.push({
        month,
        label: lens.label,
        value,
        y1: total,
        y2: total + value,
        fill: `url(#atlas-dither-${index})`,
      });
      total += value;
    });
  }
  const plotElement = plot({
    className: "atlas-observable-plot",
    width: 720,
    height: 320,
    marginTop: 16,
    marginRight: 12,
    marginBottom: 44,
    marginLeft: 48,
    ariaLabel: "Stacked monthly activity for the five most frequent overlapping question routes",
    ariaDescription:
      "Each prompt may belong to more than one route, so the stacked height is not a share of a whole.",
    style: {
      background: "transparent",
      color: "#627178",
      fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      fontSize: "11px",
    },
    x: {
      domain: months,
      label: null,
      tickFormat: (value) => formatMonth(String(value)),
      tickRotate: 0,
    },
    y: { grid: true, label: "overlapping queries", nice: true },
    color: { type: "identity" },
    marks: [
      ditherPatternMark(ROUTE_COLORS),
      rectY(stacked, {
        x: "month",
        y1: "y1",
        y2: "y2",
        fill: "fill",
        inset: 1,
        title: (datum) =>
          `${datum.label}\n${formatMonth(datum.month)} · ${formatNumber(datum.value)} queries`,
      }),
      ruleY([0], { stroke: "#26353c" }),
    ],
  });
  chart.append(plotElement);

  legend.replaceChildren(
    ...lenses.map((lens, index) => {
      const button = element("button");
      button.type = "button";
      const marker = element("i");
      marker.style.background = ROUTE_COLORS[index];
      const selectedCount = lens.byMonth
        .filter((datum) => months.includes(datum.label))
        .reduce((sum, datum) => sum + datum.value, 0);
      button.append(marker, element("span", lens.label), element("b", formatNumber(selectedCount)));
      button.addEventListener("click", () =>
        context.showEvidence(lens.label, lens.sources, [
          lens.description,
          `${formatNumber(selectedCount)} matching queries in the selected period. Question routes overlap.`,
        ])
      );
      return button;
    })
  );
  data.replaceChildren(
    ...lenses.map((lens) =>
      evidenceButton(
        lens.label,
        months
          .map(
            (month) =>
              `${formatMonth(month)} ${formatNumber(lens.byMonth.find((datum) => datum.label === month)?.value ?? 0)}`
          )
          .join(" · "),
        lens.sources.filter((source) =>
          months.includes(new Date(source.date * 1_000).toISOString().slice(0, 7))
        ),
        context,
        [lens.description, "A query can count in more than one route."]
      )
    )
  );
}

function renderLanguageMatrix(report: FullReport, context: AtlasContext) {
  const chart = $("#language-matrix");
  const data = $("#language-matrix-data");
  const months = activityMonthWindow(report.deterministic, context.periodMonths);
  $("#language-window-label").textContent =
    `Dominant vocabulary cue per query · ${context.periodMonths === null ? "all history" : `recent ${context.periodMonths} months`}`;
  const emotions = report.deterministic.emotions;
  const buckets = Object.keys(EMOTION_META) as EmotionBucket[];
  if (months.length === 0) {
    chart.replaceChildren(emptyState("No chronological language-signal data."));
    data.replaceChildren(element("p", "No chronological language-signal data."));
    return;
  }

  const grid = element("div", undefined, "language-grid");
  grid.style.setProperty("--month-count", String(months.length));
  grid.append(element("span", "Signal", "matrix-corner"));
  for (const month of months) grid.append(element("span", formatMonth(month), "matrix-month"));
  for (const bucket of buckets) {
    const meta = EMOTION_META[bucket];
    const rowButton = element("button");
    rowButton.type = "button";
    rowButton.className = "matrix-row-label";
    rowButton.style.setProperty("--signal-color", meta.color);
    rowButton.append(element("i"), element("span", meta.label));
    rowButton.addEventListener("click", () =>
      context.showEvidence(
        `${meta.label} wording`,
        emotions.sources[bucket].filter((source) =>
          months.includes(new Date(source.date * 1_000).toISOString().slice(0, 7))
        ),
        [
          `${formatNumber(
            emotions.byMonth
              .filter((datum) => months.includes(datum.month))
              .reduce((sum, datum) => sum + datum.counts[bucket], 0)
          )} queries matched this dominant vocabulary signal in the selected period.`,
          "This describes query wording, not how you felt.",
        ]
      )
    );
    grid.append(rowButton);
    const monthlyValues = months.map(
      (month) => emotions.byMonth.find((datum) => datum.month === month)?.counts[bucket] ?? 0
    );
    const max = Math.max(1, ...monthlyValues);
    monthlyValues.forEach((value, monthIndex) => {
      const cell = element("span", undefined, "matrix-cell");
      cell.style.setProperty("--signal-color", meta.color);
      cell.style.setProperty("--level", String(value / max));
      cell.title = `${meta.label} · ${months[monthIndex]} · ${formatNumber(value)} queries`;
      cell.setAttribute(
        "aria-label",
        `${meta.label}, ${formatMonth(months[monthIndex])}: ${formatNumber(value)} queries`
      );
      grid.append(cell);
    });
  }
  chart.replaceChildren(grid);
  data.replaceChildren(
    ...buckets.map((bucket) => {
      const meta = EMOTION_META[bucket];
      return evidenceButton(
        meta.label,
        months
          .map((month) => {
            const value =
              emotions.byMonth.find((datum) => datum.month === month)?.counts[bucket] ?? 0;
            return `${formatMonth(month)} ${formatNumber(value)}`;
          })
          .join(" · "),
        emotions.sources[bucket].filter((source) =>
          months.includes(new Date(source.date * 1_000).toISOString().slice(0, 7))
        ),
        context,
        [
          `${formatNumber(emotions.counts[bucket])} total queries matched this dominant vocabulary signal.`,
          "This describes query wording, not how you felt.",
        ]
      );
    })
  );
}

function repeatPoints(report: FullReport, context: AtlasContext): RepeatPoint[] {
  const visibleMonths = new Set(activityMonthWindow(report.deterministic, context.periodMonths));
  const exact: RepeatPoint[] = report.deterministic.exactRepeats.map((repeat) => ({
    id: repeat.id,
    label: repeat.representative,
    kind: "Exact wording",
    count: repeat.count,
    spanDays: Math.max(0, Math.round((repeat.lastAsked - repeat.firstAsked) / 86_400)),
    confidence: null,
    sources: repeat.sources,
    latestDate: repeat.lastAsked,
  }));
  const semantic: RepeatPoint[] = (report.semantic?.repeats ?? [])
    .filter((repeat) => context.clearsConfidence(repeat.confidence))
    .map((repeat) => {
      const dates = repeat.sources.map((source) => source.date).filter(Boolean);
      return {
        id: repeat.id,
        label: repeat.representative,
        kind: "Meaning match",
        count: repeat.count,
        spanDays:
          dates.length > 1
            ? Math.max(0, Math.round((Math.max(...dates) - Math.min(...dates)) / 86_400))
            : 0,
        confidence: repeat.confidence,
        sources: repeat.sources,
        latestDate: dates.length ? Math.max(...dates) : 0,
      };
    });
  return [...exact, ...semantic]
    .filter(
      (point) =>
        context.periodMonths === null ||
        visibleMonths.has(new Date(point.latestDate * 1_000).toISOString().slice(0, 7))
    )
    .sort((left, right) => right.count - left.count || right.spanDays - left.spanDays)
    .slice(0, 22);
}

type RepeatPlotPoint = RepeatPoint & {
  x: number;
  fill: string;
  symbol: string;
  shortLabel: string;
};

function repeatLandscapePlot(plotPoints: RepeatPlotPoint[]) {
  return plot({
    className: "atlas-observable-plot",
    width: 620,
    height: 350,
    marginTop: 26,
    marginRight: 20,
    marginBottom: 54,
    marginLeft: 54,
    ariaLabel: "Repeated questions by frequency and elapsed time",
    ariaDescription:
      "Circles are exact wording groups. Diamonds are meaning-match groups that clear the active confidence threshold.",
    style: {
      background: "transparent",
      color: "#627178",
      fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      fontSize: "11px",
    },
    x: {
      type: "log",
      label: "days between first and latest ask",
      tickFormat: (value) => formatNumber(Math.max(0, Number(value) - 1)),
    },
    y: { grid: true, label: "times asked", nice: true },
    r: { range: [5, 13] },
    symbol: { domain: ["circle", "diamond"], range: ["circle", "diamond"] },
    color: { type: "identity" },
    marks: [
      ditherPatternMark(["#ef4b3e", "#8652c7"]),
      ruleY([1], { stroke: "#26353c" }),
      dot(plotPoints, {
        x: "x",
        y: "count",
        r: "count",
        symbol: "symbol",
        fill: "fill",
        stroke: "#26353c",
        strokeWidth: 1.2,
        title: (point) =>
          `${point.kind}\n${point.count} asks · ${point.spanDays} days\n${truncate(point.label, 120)}`,
      }),
      plotText(
        plotPoints.filter((point) => point.shortLabel),
        {
          x: "x",
          y: "count",
          text: "shortLabel",
          dx: 9,
          dy: -9,
          textAnchor: "start",
          fontSize: 10,
          fill: "#26353c",
        }
      ),
    ],
  });
}

function renderRepeatLandscape(report: FullReport, context: AtlasContext) {
  const chart = $("#repeat-landscape");
  const data = $("#repeat-landscape-data");
  chart.replaceChildren();
  const points = repeatPoints(report, context);
  if (points.length === 0) {
    chart.append(
      emptyState(
        report.semantic ? "No repeat groups cleared this lens." : "No exact repeat groups yet."
      )
    );
    data.replaceChildren(element("p", "No repeat groups available for this view."));
    return;
  }
  const plotPoints = points.map((point, index) => ({
    ...point,
    x: point.spanDays + 1,
    fill: `url(#atlas-dither-${point.kind === "Exact wording" ? 0 : 1})`,
    symbol: point.kind === "Exact wording" ? "circle" : "diamond",
    shortLabel: index < 5 ? truncate(point.label, 22) : "",
  }));
  chart.append(repeatLandscapePlot(plotPoints));
  attachPlotActions(
    chart,
    'g[aria-label="dot"] > circle, g[aria-label="dot"] > path',
    points.map(
      (point) => () =>
        context.showEvidence(point.label, point.sources, [
          `${formatNumber(point.count)} asks across ${formatNumber(point.spanDays)} days.`,
          point.kind === "Meaning match" && point.confidence !== null
            ? `${Math.round(point.confidence * 100)}% semantic evidence confidence.`
            : point.kind,
        ])
    ),
    points.map(
      (point) =>
        `${truncate(point.label, 90)}. ${point.count} asks across ${point.spanDays} days. ${point.kind}. Open sources.`
    )
  );
  data.replaceChildren(
    ...points.map((point) =>
      evidenceButton(
        truncate(point.label, 110),
        `${formatNumber(point.count)} asks · ${formatNumber(point.spanDays)} days · ${point.kind}`,
        point.sources,
        context,
        [
          `${formatNumber(point.count)} asks across ${formatNumber(point.spanDays)} days.`,
          point.kind,
        ]
      )
    )
  );
}

function renderTopicMomentum(report: FullReport, context: AtlasContext) {
  const chart = $("#topic-momentum");
  const state = $("#topic-momentum-state");
  const data = $("#topic-momentum-data");
  chart.replaceChildren();
  if (!report.semantic) {
    state.hidden = false;
    chart.classList.add("is-hidden");
    data.replaceChildren(element("p", "Topic momentum appears after semantic analysis."));
    return;
  }
  const selectedMonths = activityMonthWindow(report.deterministic, context.periodMonths);
  const topics = report.semantic.topics
    .map((topic) => ({
      ...topic,
      selectedCount: topic.activityByMonth
        .filter((datum) => selectedMonths.includes(datum.label))
        .reduce((sum, datum) => sum + datum.value, 0),
    }))
    .filter((topic) => topic.selectedCount > 0)
    .slice()
    .sort((left, right) => right.selectedCount - left.selectedCount)
    .slice(0, 18);
  if (topics.length === 0) {
    state.hidden = false;
    state.replaceChildren(
      element("strong", "No sampled topics were available."),
      element("small", "The deterministic atlas remains usable.")
    );
    chart.classList.add("is-hidden");
    data.replaceChildren(element("p", "No sampled topics."));
    return;
  }
  state.hidden = true;
  chart.classList.remove("is-hidden");
  const maxMomentum = Math.max(0.2, ...topics.map((topic) => Math.abs(topic.momentum)));
  const plotTopics = topics.map((topic, index) => ({
    ...topic,
    normalizedMomentum: topic.momentum / maxMomentum,
    shortLabel: index < 6 ? truncate(topic.label.split(" · ")[0], 18) : "",
    fill: `url(#atlas-dither-${Object.keys(TREND_COLORS).indexOf(topic.trend)})`,
  }));
  const labelGap = Math.max(
    4,
    Math.ceil(Math.max(...topics.map((topic) => topic.selectedCount)) * 0.08)
  );
  let previousLabelY = -Infinity;
  const labeledTopics = plotTopics
    .filter((topic) => topic.shortLabel)
    .slice()
    .sort((left, right) => left.selectedCount - right.selectedCount)
    .map((topic) => {
      const labelY = Math.max(topic.selectedCount, previousLabelY + labelGap);
      previousLabelY = labelY;
      return { ...topic, labelY };
    });
  const trendColors = Object.keys(TREND_COLORS).map((trend) => TREND_COLORS[trend as TrendState]);
  const plotElement = plot({
    className: "atlas-observable-plot",
    width: 620,
    height: 350,
    marginTop: 28,
    marginRight: 58,
    marginBottom: 52,
    marginLeft: 56,
    ariaLabel: "Semantic topics by local momentum and selected-period conversation count",
    ariaDescription:
      "Marks left of zero are fading locally, marks right of zero are emerging locally, and mark size reflects sampled conversation count in the selected period.",
    style: {
      background: "transparent",
      color: "#627178",
      fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      fontSize: "11px",
    },
    x: {
      domain: [-1, 1],
      label: "fading ← local movement → emerging",
      tickFormat: (value) => (Number(value) === 0 ? "steady" : ""),
    },
    y: { grid: true, label: "sampled conversations", nice: true },
    r: { range: [6, 18] },
    color: { type: "identity" },
    marks: [
      ditherPatternMark(trendColors),
      ruleX([0], { stroke: "#26353c", strokeDasharray: "4,4" }),
      dot(plotTopics, {
        x: "normalizedMomentum",
        y: "selectedCount",
        r: "selectedCount",
        fill: "fill",
        stroke: "#26353c",
        strokeWidth: 1.2,
        title: (topic) =>
          `${topic.label}\n${topic.selectedCount} selected-period conversations · ${TREND_LABELS[topic.trend as TrendState]}`,
      }),
      ...labeledTopics.flatMap((topic) => [
        lineY(
          [
            { x: topic.normalizedMomentum, y: topic.selectedCount },
            { x: topic.normalizedMomentum, y: topic.labelY },
          ],
          {
            x: "x",
            y: "y",
            stroke: "#9ba6aa",
            strokeWidth: 0.8,
          }
        ),
        plotText([topic], {
          x: "normalizedMomentum",
          y: "labelY",
          text: "shortLabel",
          dx: topic.normalizedMomentum > 0.45 ? -9 : 9,
          dy: -7,
          textAnchor: topic.normalizedMomentum > 0.45 ? "end" : "start",
          fontSize: 10,
          fill: "#26353c",
        }),
      ]),
    ],
  });
  chart.append(plotElement);
  attachPlotActions(
    chart,
    'g[aria-label="dot"] > circle, g[aria-label="dot"] > path',
    topics.map(
      (topic) => () =>
        context.showEvidence(topic.label, topic.sources, [
          `${formatNumber(topic.selectedCount)} sampled conversations in the selected period.`,
          `${TREND_LABELS[topic.trend]} by the disclosed all-history local time-series rule.`,
          `Momentum score ${topic.momentum.toFixed(2)}.`,
        ])
    ),
    topics.map(
      (topic) =>
        `${topic.label}. ${topic.selectedCount} selected-period conversations. ${TREND_LABELS[topic.trend]}. Open sources.`
    )
  );
  data.replaceChildren(
    ...topics.map((topic) =>
      evidenceButton(
        topic.label,
        `${formatNumber(topic.selectedCount)} selected-period conversations · ${TREND_LABELS[topic.trend]} · momentum ${topic.momentum.toFixed(2)}`,
        topic.sources,
        context,
        [
          `${formatNumber(topic.selectedCount)} sampled conversations in the selected period.`,
          `${TREND_LABELS[topic.trend]} by the disclosed local time-series rule.`,
        ]
      )
    )
  );
}

function shapeGroup(
  title: string,
  subtitle: string,
  values: Array<{ label: string; value: number }>
): HTMLElement {
  const group = element("section", undefined, "shape-group");
  const heading = element("header");
  heading.append(element("strong", title), element("small", subtitle));
  group.append(heading);
  const max = Math.max(1, ...values.map((datum) => datum.value));
  for (const datum of values) {
    const row = element("div", undefined, "shape-row");
    const track = element("span", undefined, "shape-track");
    const fill = element("i");
    fill.style.width = `${(datum.value / max) * 100}%`;
    track.append(fill);
    row.append(element("span", datum.label), track, element("b", formatNumber(datum.value)));
    group.append(row);
  }
  return group;
}

function renderConversationShape(report: FullReport) {
  const chart = $("#conversation-shape");
  const data = $("#conversation-shape-data");
  const deterministic = report.deterministic;
  const depth = [
    { label: "Short · 1–4 messages", value: deterministic.depth.short },
    { label: "Medium · 5–14", value: deterministic.depth.medium },
    { label: "Deep · 15+", value: deterministic.depth.deep },
  ];
  const weekday = deterministic.activityByWeekday;
  const models = deterministic.modelUsage.slice(0, 5);
  chart.replaceChildren(
    shapeGroup(
      "Depth",
      `Median ${formatNumber(deterministic.depth.medianMessages)} messages`,
      depth
    ),
    shapeGroup("Weekday rhythm", "Conversation starts", weekday),
    shapeGroup("Model mix", "Top five exported model labels", models)
  );
  data.replaceChildren(
    element(
      "p",
      `Depth — ${depth.map((datum) => `${datum.label}: ${formatNumber(datum.value)}`).join(" · ")}`
    ),
    element(
      "p",
      `Weekdays — ${weekday.map((datum) => `${datum.label}: ${formatNumber(datum.value)}`).join(" · ")}`
    ),
    element(
      "p",
      `Models — ${models.map((datum) => `${datum.label}: ${formatNumber(datum.value)}`).join(" · ") || "No model labels"}`
    )
  );
}

function renderActivityRhythms(report: FullReport, context: AtlasContext) {
  const chart = $("#activity-chart");
  const data = $("#rhythm-data-list");
  const routeSelect = document.querySelector<HTMLSelectElement>("#rhythm-route");
  const wordButton = document.querySelector<HTMLButtonElement>('[data-rhythm-measure="words"]');
  const hasDetailedRhythms = Boolean(report.deterministic.activityRhythms?.length);
  if (routeSelect) routeSelect.disabled = !hasDetailedRhythms;
  if (wordButton) wordButton.disabled = !hasDetailedRhythms;

  const measure = hasDetailedRhythms ? context.rhythmMeasure : "conversations";
  const routeId = hasDetailedRhythms ? context.rhythmRouteId : "all";
  const months = activityMonthWindow(report.deterministic, context.periodMonths);
  const storedSeries = report.deterministic.activityRhythms?.find(
    (series) => series.id === routeId
  );
  const fallback = new Map(
    report.deterministic.activityByMonth.map((datum) => [
      datum.label,
      {
        label: datum.label,
        conversations: datum.value,
        messages: 0,
        userPrompts: 0,
        words: 0,
      },
    ])
  );
  const byMonth = new Map(
    (storedSeries?.byMonth ?? [...fallback.values()]).map((datum) => [datum.label, datum])
  );
  const values = months.map((month) => ({
    month,
    value: byMonth.get(month)?.[measure] ?? 0,
  }));
  const metricLabel = measure === "words" ? "approximate words" : "conversations";
  const routeLabel = storedSeries?.label ?? "All conversations";
  const total = values.reduce((sum, datum) => sum + datum.value, 0);
  const peak = values
    .slice()
    .sort((left, right) => right.value - left.value || right.month.localeCompare(left.month))[0];
  $("#rhythm-total").textContent = `${formatNumber(total)} ${metricLabel}`;
  $("#rhythm-peak").textContent =
    peak && peak.value > 0
      ? `${formatMonth(peak.month)} · ${formatNumber(peak.value)}`
      : "No activity";
  $("#rhythm-method").textContent = hasDetailedRhythms
    ? routeId === "all"
      ? `${routeLabel} · ${metricLabel} by conversation start month.`
      : `${routeLabel} route · ${metricLabel} from complete matched conversations. Routes overlap.`
    : "Conversation starts from an older saved report. Re-import for words and route filters.";
  chart.setAttribute("aria-label", `${routeLabel}: ${metricLabel} by month in the selected period`);

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-rhythm-measure]")) {
    button.setAttribute("aria-pressed", String(button.dataset.rhythmMeasure === measure));
  }
  if (routeSelect) routeSelect.value = routeId;

  if (values.length === 0) {
    chart.replaceChildren(emptyState("No monthly activity was available in this period."));
    data.replaceChildren(element("p", "No monthly activity was available in this period."));
    return;
  }
  const peakValue = Math.max(1, ...values.map((datum) => datum.value));
  const plotElement = plot({
    className: "atlas-observable-plot",
    width: 1040,
    height: 340,
    marginTop: 28,
    marginRight: 34,
    marginBottom: 48,
    marginLeft: measure === "words" ? 78 : 58,
    ariaLabel: `${routeLabel}: ${metricLabel} by month`,
    ariaDescription:
      routeId === "all"
        ? `Monthly ${metricLabel} across the selected period.`
        : `Monthly ${metricLabel} for complete conversations with a matching ${routeLabel} query. Routes overlap.`,
    style: {
      background: "transparent",
      color: "#58666d",
      fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      fontSize: "11px",
    },
    x: {
      type: "band",
      label: null,
      tickFormat: (value) => formatMonth(String(value)),
    },
    y: {
      grid: true,
      label: metricLabel,
      domain: [0, peakValue],
      nice: true,
      tickFormat: (value) => formatNumber(Number(value)),
    },
    marks: [
      ruleY([0], { stroke: "#9aa7a4" }),
      areaY(values, {
        x: "month",
        y: "value",
        curve: "monotone-x",
        fill: "#2157d5",
        fillOpacity: 0.13,
      }),
      lineY(values, {
        x: "month",
        y: "value",
        curve: "monotone-x",
        stroke: "#2157d5",
        strokeWidth: 2.5,
      }),
      dot(values, {
        x: "month",
        y: "value",
        r: 3.5,
        fill: "#ffffff",
        stroke: "#2157d5",
        strokeWidth: 2,
        title: (datum) => `${datum.month}\n${formatNumber(datum.value)} ${metricLabel}`,
      }),
    ],
  });
  plotElement.classList.add("rhythm-observable-plot");
  chart.replaceChildren(plotElement);
  data.replaceChildren(
    ...values.map((datum) =>
      element(
        "p",
        `${datum.month} · ${formatNumber(datum.value)} ${metricLabel}`,
        "rhythm-data-row"
      )
    )
  );
}

const SHIFT_FAMILY_LABELS: Record<ShiftFamily, string> = {
  cadence: "Cadence",
  lens: "Question lens",
  emotion: "Emotion",
};

function shiftValueLabel(finding: ShiftFinding, value: number): string {
  // Cadence findings are absolute conversations per month; lens and emotion
  // findings are shares of that month's activity. Formatting them alike would
  // read as a percentage of nothing.
  return finding.family === "cadence"
    ? `${formatNumber(Math.round(value))}/mo`
    : `${Math.round(value * 100)}%`;
}

function shiftWindowLabel(findings: ShiftFinding[]): string {
  const months = findings[0]?.byMonth.map(({ label }) => label) ?? [];
  if (months.length < 3) return "All history · earlier third vs recent third · no model needed";
  const edge = Math.max(1, Math.floor(months.length / 3));
  const rangeLabel = (values: string[]) => {
    const first = values[0];
    const last = values.at(-1);
    if (!(first && last)) return "";
    return first === last ? formatMonth(first) : `${formatMonth(first)}–${formatMonth(last)}`;
  };
  return `All history · ${rangeLabel(months.slice(0, edge))} vs ${rangeLabel(months.slice(-edge))} · no model needed`;
}

function renderHistoricalShifts(report: FullReport) {
  const chart = $("#historical-shifts");
  const state = $("#historical-shifts-state");
  const data = $("#historical-shifts-data");
  const period = $("#historical-shifts-period");
  chart.replaceChildren();
  const shifts = report.deterministic.shifts;
  const findings = shifts?.findings ?? [];
  period.textContent = shiftWindowLabel(findings);
  if (findings.length === 0) {
    state.hidden = false;
    chart.classList.add("is-hidden");
    data.replaceChildren(
      element(
        "p",
        shifts && shifts.months < 3
          ? `Only ${shifts.months} month(s) of history; three are needed to compare.`
          : "No measurable shift in cadence, question lenses, or emotions."
      )
    );
    return;
  }
  state.hidden = true;
  chart.classList.remove("is-hidden");

  const ordered = findings
    .slice()
    .sort((left, right) => Math.abs(right.momentum) - Math.abs(left.momentum));
  const rows = ordered.map((finding) => ({
    ...finding,
    rowLabel: truncate(`${SHIFT_FAMILY_LABELS[finding.family]} · ${finding.label}`, 34),
    color: TREND_COLORS[finding.trend],
    changeLabel: `${shiftValueLabel(finding, finding.earlyShare)} → ${shiftValueLabel(
      finding,
      finding.recentShare
    )}`,
    tip: `${finding.label} — ${TREND_LABELS[finding.trend]}, ${shiftValueLabel(
      finding,
      finding.earlyShare
    )} → ${shiftValueLabel(finding, finding.recentShare)}`,
  }));
  const domain = rows.map((row) => row.rowLabel);

  const plotElement = plot({
    className: "atlas-observable-plot",
    width: 720,
    height: Math.max(180, 40 + rows.length * 24),
    marginLeft: 240,
    marginRight: 128,
    x: {
      domain: [-1, 1],
      label: "← fading    ·    relative change    ·    emerging →",
      grid: true,
      ticks: 5,
    },
    y: { domain, label: null },
    color: { type: "identity" },
    marks: [
      ruleX([0], { stroke: "#c9ccc7" }),
      ruleY(rows, {
        y: "rowLabel",
        x1: 0,
        x2: "momentum",
        stroke: "color",
        strokeWidth: 2,
        strokeLinecap: "round",
      }),
      dot(rows, {
        y: "rowLabel",
        x: "momentum",
        fill: "color",
        stroke: "#fcfcfb",
        strokeWidth: 2,
        r: 5,
        title: "tip",
      }),
      plotText(rows, {
        y: "rowLabel",
        x: 1,
        text: "changeLabel",
        dx: 14,
        textAnchor: "start",
        fill: "#4b5459",
        fontSize: 11,
      }),
    ],
  });
  chart.append(plotElement);

  data.replaceChildren(
    element(
      "p",
      `${shiftWindowLabel(findings).replace(" · no model needed", "")}. Lens and wording rows are monthly shares; cadence is conversations per month.`
    ),
    ...rows.map((row) =>
      element(
        "p",
        `${SHIFT_FAMILY_LABELS[row.family]} · ${row.label}: ${TREND_LABELS[row.trend]}, ` +
          `${shiftValueLabel(row, row.earlyShare)} → ${shiftValueLabel(row, row.recentShare)} ` +
          `(momentum ${row.momentum >= 0 ? "+" : ""}${row.momentum.toFixed(2)})`
      )
    )
  );
}

export function renderVisualAtlas(report: FullReport, context: AtlasContext) {
  $("#atlas-period-note").textContent =
    context.periodMonths === null
      ? "All stored months shown where exact period filtering is supported. Shape, overview, and What changed remain all-time."
      : `Recent ${context.periodMonths} months applied to chronological charts, query tone, and language signals. Shape, overview, and What changed remain all-time.`;
  renderAtlasHighlight(report, context);
  renderActivityCalendar(report, context);
  renderQuestionMix(report, context);
  renderLanguageMatrix(report, context);
  renderRepeatLandscape(report, context);
  renderTopicMomentum(report, context);
  renderConversationShape(report);
  renderActivityRhythms(report, context);
  renderHistoricalShifts(report);
}
