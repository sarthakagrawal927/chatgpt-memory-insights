import type { EmotionBucket, FullReport, SourceRef } from "../lib/types";
import { activityMonthWindow } from "../lib/period";
import { formatNumber, truncate } from "./dom-utils";

type StoryContext = {
  showEvidence: (title: string, sources: SourceRef[], notes?: string[]) => void;
};

type StoryOpenOptions = {
  periodMonths: number | null;
  clearsConfidence: (score: number) => boolean;
  launcher: HTMLElement;
};

type StorySlide = {
  eyebrow: string;
  title: string;
  lede: string;
  renderBody: () => DocumentFragment | HTMLElement;
  evidence?: {
    label: string;
    title: string;
    sources: SourceRef[];
    notes: string[];
  };
};

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function $(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing story element: ${selector}`);
  return node;
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
  return Number.isNaN(date.getTime()) ? label : monthFormat.format(date);
}

function formatDate(timestamp: number): string {
  return timestamp ? dateFormat.format(new Date(timestamp * 1_000)) : "Unknown date";
}

function statGrid(values: Array<{ label: string; value: string }>): HTMLElement {
  const grid = element("dl", undefined, "story-stat-grid");
  values.forEach(({ label, value }) => {
    const item = element("div");
    item.append(element("dt", label), element("dd", value));
    grid.append(item);
  });
  return grid;
}

function rankedBars(values: Array<{ label: string; value: number; color?: string }>): HTMLElement {
  const list = element("div", undefined, "story-ranked-bars");
  const max = Math.max(1, ...values.map((datum) => datum.value));
  values.forEach((datum, index) => {
    const row = element("div", undefined, "story-ranked-row");
    const marker = element("span", String(index + 1).padStart(2, "0"));
    const copy = element("strong", datum.label);
    const track = element("i");
    track.style.setProperty("--story-level", String(datum.value / max));
    if (datum.color) track.style.setProperty("--story-color", datum.color);
    const value = element("b", formatNumber(datum.value));
    row.append(marker, copy, track, value);
    list.append(row);
  });
  return list;
}

function buildSlides(
  report: FullReport,
  periodMonths: number | null,
  clearsConfidence: (score: number) => boolean
): StorySlide[] {
  const deterministic = report.deterministic;
  const months = activityMonthWindow(report.deterministic, periodMonths);
  const monthSet = new Set(months);
  const periodLabel =
    periodMonths === null
      ? `${formatDate(deterministic.dateRange.start)} — ${formatDate(deterministic.dateRange.end)}`
      : `Recent ${periodMonths} months`;
  const activity = deterministic.activityByMonth.filter((datum) => monthSet.has(datum.label));
  const busiestMonth = activity.slice().sort((left, right) => right.value - left.value)[0];
  const periodStarts = activity.reduce((sum, datum) => sum + datum.value, 0);
  const lenses = deterministic.lenses.categories
    .map((lens) => ({
      lens,
      value: lens.byMonth
        .filter((datum) => monthSet.has(datum.label))
        .reduce((sum, datum) => sum + datum.value, 0),
    }))
    .filter(({ value }) => value > 0)
    .sort((left, right) => right.value - left.value);
  const topLens = lenses[0];
  const exactRepeats = deterministic.exactRepeats
    .filter(
      (repeat) =>
        periodMonths === null ||
        monthSet.has(new Date(repeat.lastAsked * 1_000).toISOString().slice(0, 7))
    )
    .map((repeat) => ({
      label: repeat.representative,
      count: repeat.count,
      kind: "Exact wording",
      confidence: null as number | null,
      sources: repeat.sources,
      first: repeat.firstAsked,
      last: repeat.lastAsked,
    }));
  const semanticRepeats = (report.semantic?.repeats ?? [])
    .filter((repeat) => clearsConfidence(repeat.confidence))
    .filter(
      (repeat) =>
        periodMonths === null ||
        repeat.sources.some((source) =>
          monthSet.has(new Date(source.date * 1_000).toISOString().slice(0, 7))
        )
    )
    .map((repeat) => {
      const dates = repeat.sources.map((source) => source.date).filter(Boolean);
      return {
        label: repeat.representative,
        count: repeat.count,
        kind: "Meaning match",
        confidence: repeat.confidence,
        sources: repeat.sources,
        first: dates.length ? Math.min(...dates) : 0,
        last: dates.length ? Math.max(...dates) : 0,
      };
    });
  const topRepeat = [...exactRepeats, ...semanticRepeats].sort(
    (left, right) => right.count - left.count
  )[0];
  const emotionCounts = deterministic.emotions.byMonth
    .filter((datum) => monthSet.has(datum.month))
    .reduce(
      (totals, datum) => {
        for (const bucket of Object.keys(totals) as EmotionBucket[]) {
          totals[bucket] += datum.counts[bucket];
        }
        return totals;
      },
      {
        curiosity: 0,
        frustration: 0,
        urgency: 0,
        uncertainty: 0,
        excitement: 0,
        appreciation: 0,
        neutral: 0,
      }
    );
  const emotionMeta: Record<EmotionBucket, { label: string; color: string }> = {
    curiosity: { label: "Curiosity", color: "#2157d5" },
    frustration: { label: "Frustration", color: "#ef4b3e" },
    urgency: { label: "Urgency", color: "#dc8700" },
    uncertainty: { label: "Uncertainty", color: "#8652c7" },
    excitement: { label: "Excitement", color: "#cf3fa0" },
    appreciation: { label: "Appreciation", color: "#168579" },
    neutral: { label: "Neutral / direct", color: "#66767d" },
  };
  const orderedEmotions = (Object.keys(emotionCounts) as EmotionBucket[])
    .map((bucket) => ({
      bucket,
      label: emotionMeta[bucket].label,
      color: emotionMeta[bucket].color,
      value: emotionCounts[bucket],
    }))
    .sort((left, right) => right.value - left.value);
  const topEmotion = orderedEmotions[0];
  const tone = deterministic.tone.byMonth
    .filter((datum) => monthSet.has(datum.month))
    .reduce(
      (totals, datum) => ({
        positive: totals.positive + datum.positive,
        neutral: totals.neutral + datum.neutral,
        negative: totals.negative + datum.negative,
      }),
      { positive: 0, neutral: 0, negative: 0 }
    );
  const toneTotal = tone.positive + tone.neutral + tone.negative;
  const topics = (report.semantic?.topics ?? [])
    .map((topic) => ({
      topic,
      selectedCount: topic.activityByMonth
        .filter((datum) => monthSet.has(datum.label))
        .reduce((sum, datum) => sum + datum.value, 0),
    }))
    .filter(({ selectedCount }) => selectedCount > 0)
    .sort((left, right) => {
      const trendRank = { resurfacing: 0, emerging: 1, steady: 2, fading: 3, insufficient: 4 };
      return (
        trendRank[left.topic.trend] - trendRank[right.topic.trend] ||
        right.selectedCount - left.selectedCount
      );
    });
  const topTopic = topics[0];

  return [
    {
      eyebrow: "Your history, in motion",
      title: "Your ChatGPT history, mapped.",
      lede: `${periodLabel}. A private story assembled in this browser from your derived report.`,
      renderBody: () =>
        statGrid([
          {
            label: "Conversations · all history",
            value: formatNumber(deterministic.totals.conversations),
          },
          {
            label: "Your prompts · all history",
            value: formatNumber(deterministic.totals.userPrompts),
          },
          {
            label: "Active days · all history",
            value: formatNumber(deterministic.totals.activeDays),
          },
        ]),
    },
    {
      eyebrow: "The cadence",
      title: busiestMonth
        ? `${formatMonth(busiestMonth.label)} was your busiest stop.`
        : "Your activity made its own rhythm.",
      lede: busiestMonth
        ? `${formatNumber(busiestMonth.value)} conversations began that month within the selected period.`
        : "No dated monthly activity was available in the selected period.",
      renderBody: () =>
        statGrid([
          { label: "Conversation starts · selected period", value: formatNumber(periodStarts) },
          {
            label: "Longest daily streak · all history",
            value: `${formatNumber(deterministic.totals.longestStreak)} days`,
          },
          {
            label: "Median conversation depth · all history",
            value: `${formatNumber(deterministic.depth.medianMessages)} messages`,
          },
        ]),
    },
    {
      eyebrow: "What you asked about",
      title: topLens
        ? `${topLens.lens.label} led the question routes.`
        : "Your questions crossed many routes.",
      lede: "These are overlapping local query lenses: one prompt can count in more than one route.",
      renderBody: () =>
        rankedBars(
          lenses.slice(0, 5).map(({ lens, value }, index) => ({
            label: lens.label,
            value,
            color: ["#2157d5", "#168579", "#ef4b3e", "#7554c8", "#dc8700"][index],
          }))
        ),
      evidence: topLens
        ? {
            label: "Open leading-route sources",
            title: topLens.lens.label,
            sources: topLens.lens.sources.filter((source) =>
              monthSet.has(new Date(source.date * 1_000).toISOString().slice(0, 7))
            ),
            notes: [
              `${formatNumber(topLens.value)} matching queries in the selected period.`,
              topLens.lens.description,
              "Question routes overlap.",
            ],
          }
        : undefined,
    },
    {
      eyebrow: "The return journey",
      title: topRepeat
        ? `You asked this ${formatNumber(topRepeat.count)} times.`
        : "No repeated question dominated this period.",
      lede: topRepeat
        ? `“${truncate(topRepeat.label, 180)}”`
        : "Exact wording and meaning-match repeats stay separate and confidence-filtered.",
      renderBody: () =>
        topRepeat
          ? statGrid([
              { label: "Repeat kind", value: topRepeat.kind },
              {
                label: "First → latest evidence",
                value: `${formatDate(topRepeat.first)} → ${formatDate(topRepeat.last)}`,
              },
              {
                label: "Evidence confidence",
                value:
                  topRepeat.confidence === null
                    ? "Deterministic"
                    : `${Math.round(topRepeat.confidence * 100)}%`,
              },
            ])
          : element(
              "p",
              "This can mean your recurring questions were phrased differently—or simply did not recur.",
              "story-note"
            ),
      evidence: topRepeat
        ? {
            label: "Open repeat sources",
            title: topRepeat.label,
            sources: topRepeat.sources,
            notes: [`${formatNumber(topRepeat.count)} asks in this repeat group.`, topRepeat.kind],
          }
        : undefined,
    },
    {
      eyebrow: "How your prompts sounded",
      title: topEmotion
        ? `${topEmotion.label} was the most common wording signal.`
        : "Your wording signals stayed quiet.",
      lede: "These are local vocabulary cues in your queries—not feelings, personality, diagnosis, or a claim about why you wrote them.",
      renderBody: () =>
        rankedBars(
          orderedEmotions.slice(0, 5).map(({ label, value, color }) => ({
            label,
            value,
            color,
          }))
        ),
      evidence: topEmotion
        ? {
            label: `Open ${topEmotion.label.toLowerCase()} wording sources`,
            title: `${topEmotion.label} wording`,
            sources: deterministic.emotions.sources[topEmotion.bucket].filter((source) =>
              monthSet.has(new Date(source.date * 1_000).toISOString().slice(0, 7))
            ),
            notes: [
              `${formatNumber(topEmotion.value)} queries matched this dominant wording signal in the selected period.`,
              `Negative wording represented ${toneTotal ? Math.round((tone.negative / toneTotal) * 100) : 0}% of period queries by the separate tone heuristic.`,
            ],
          }
        : undefined,
    },
    {
      eyebrow: "What moved",
      title: topTopic
        ? `${topTopic.topic.label.split(" · ")[0]} is ${topTopic.topic.trend}.`
        : report.semantic
          ? "No topic movement stood out in this period."
          : "Your semantic map is still forming.",
      lede: topTopic
        ? `${formatNumber(topTopic.selectedCount)} sampled conversations in the selected period. The movement label is local and does not explain why your interest changed.`
        : "The deterministic story remains complete even without model-backed topic movement.",
      renderBody: () =>
        topTopic
          ? statGrid([
              { label: "Local trend", value: topTopic.topic.trend },
              { label: "Momentum", value: topTopic.topic.momentum.toFixed(2) },
              { label: "Sampled conversations", value: formatNumber(topTopic.selectedCount) },
            ])
          : element(
              "p",
              "Return to the report for question routes, activity, repeats, and language signals.",
              "story-note"
            ),
      evidence: topTopic
        ? {
            label: "Open topic sources",
            title: topTopic.topic.label,
            sources: topTopic.topic.sources,
            notes: [
              `${formatNumber(topTopic.selectedCount)} sampled conversations in the selected period.`,
              `${topTopic.topic.trend} by the disclosed local time-series rule.`,
            ],
          }
        : undefined,
    },
    {
      eyebrow: "The map stays open",
      title: "The best insight is the one you can verify.",
      lede: "Search the full mapped memory, change the period or confidence lens, and open the conversations behind any pattern.",
      renderBody: () =>
        statGrid([
          {
            label: "Leading question route",
            value: topLens?.lens.label ?? "No clear leader",
          },
          {
            label: "Top wording signal",
            value: topEmotion?.label ?? "No clear leader",
          },
          {
            label: "Repeat groups in period",
            value: formatNumber(exactRepeats.length + semanticRepeats.length),
          },
        ]),
    },
  ];
}

export function createStoryController(context: StoryContext) {
  const dialog = document.querySelector<HTMLDialogElement>("#story-dialog");
  if (!dialog) throw new Error("Missing story dialog");
  const slideNode = $("#story-slide");
  const position = $("#story-position");
  const progress = $("#story-progress");
  const previous = document.querySelector<HTMLButtonElement>("#story-previous");
  const next = document.querySelector<HTMLButtonElement>("#story-next");
  const close = document.querySelector<HTMLButtonElement>("#close-story");
  if (!previous || !next || !close) throw new Error("Missing story controls");

  let slides: StorySlide[] = [];
  let index = 0;
  let launcher: HTMLElement | null = null;
  let touchStartX: number | null = null;
  let resumeAfterEvidence = false;
  let restoreLauncherOnClose = true;

  const render = () => {
    const story = slides[index];
    if (!story) return;
    const eyebrow = element("p", story.eyebrow, "story-eyebrow");
    const heading = element("h2", story.title);
    heading.id = "story-heading";
    const lede = element("p", story.lede, "story-lede");
    const body = story.renderBody();
    const fragments: Array<Node> = [eyebrow, heading, lede, body];
    if (story.evidence) {
      const evidenceButton = element("button", story.evidence.label, "story-evidence");
      evidenceButton.type = "button";
      evidenceButton.addEventListener("click", () => {
        const evidence = story.evidence;
        if (!evidence) return;
        resumeAfterEvidence = true;
        restoreLauncherOnClose = false;
        dialog.close();
        context.showEvidence(evidence.title, evidence.sources, evidence.notes);
      });
      fragments.push(evidenceButton);
    }
    slideNode.replaceChildren(...fragments);
    slideNode.classList.remove("is-entering");
    requestAnimationFrame(() => slideNode.classList.add("is-entering"));
    position.textContent = `Slide ${index + 1} of ${slides.length}`;
    previous.disabled = index === 0;
    next.textContent = index === slides.length - 1 ? "Return to report →" : "Next →";
    for (const button of progress.querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-current", String(Number(button.dataset.index) === index));
    }
    slideNode.focus({ preventScroll: true });
  };

  const move = (direction: number) => {
    const nextIndex = index + direction;
    if (nextIndex < 0) return;
    if (nextIndex >= slides.length) {
      dialog.close();
      return;
    }
    index = nextIndex;
    render();
  };

  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (restoreLauncherOnClose) launcher?.focus();
    restoreLauncherOnClose = true;
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
  });
  slideNode.addEventListener("pointerdown", (event) => {
    touchStartX = event.clientX;
  });
  slideNode.addEventListener("pointerup", (event) => {
    if (touchStartX === null) return;
    const distance = event.clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(distance) < 55) return;
    move(distance < 0 ? 1 : -1);
  });

  return {
    open(report: FullReport, options: StoryOpenOptions) {
      slides = buildSlides(report, options.periodMonths, options.clearsConfidence);
      index = 0;
      launcher = options.launcher;
      resumeAfterEvidence = false;
      progress.replaceChildren(
        ...slides.map((slide, slideIndex) => {
          const button = element("button");
          button.type = "button";
          button.dataset.index = String(slideIndex);
          button.setAttribute("aria-label", `Go to slide ${slideIndex + 1}: ${slide.eyebrow}`);
          button.addEventListener("click", () => {
            index = slideIndex;
            render();
          });
          return button;
        })
      );
      dialog.showModal();
      render();
    },
    resumeFromEvidence() {
      if (!resumeAfterEvidence || dialog.open) return false;
      resumeAfterEvidence = false;
      dialog.showModal();
      render();
      return true;
    },
    close() {
      resumeAfterEvidence = false;
      if (dialog.open) dialog.close();
    },
  };
}
