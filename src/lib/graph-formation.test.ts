import { describe, expect, it } from "vitest";
import { classifyQuestionLensIds } from "./insights";
import { FORMATION_ROUTES, formationPoint, formationRouteIds } from "./graph-formation";
import type { GraphFormationConversation } from "./types";

function conversation(
  routeIds: GraphFormationConversation["routeIds"]
): GraphFormationConversation {
  return {
    id: "conversation-1",
    title: "A conversation",
    date: 1,
    routeIds,
  };
}

describe("progressive graph formation", () => {
  it("reuses overlapping disclosed question-domain rules", () => {
    expect(
      classifyQuestionLensIds([
        "Help me debug this TypeScript API and plan the next deployment step",
      ])
    ).toEqual(["software", "planning"]);
  });

  it("keeps unmatched conversations on the other route", () => {
    expect(formationRouteIds(conversation([]))).toEqual(["other"]);
  });

  it("caps visual edges while retaining a stable primary route", () => {
    expect(formationRouteIds(conversation(["health", "learning", "planning", "career"]))).toEqual([
      "health",
      "learning",
      "planning",
    ]);
  });

  it("places every conversation deterministically within the canvas bounds", () => {
    const item = conversation(["software"]);
    expect(formationPoint(item, 7)).toEqual(formationPoint(item, 7));
    expect(formationPoint(item, 7)).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(formationPoint(item, 7).x).toBeGreaterThanOrEqual(0.035);
    expect(formationPoint(item, 7).x).toBeLessThanOrEqual(0.965);
    expect(formationPoint(item, 7).y).toBeGreaterThanOrEqual(0.06);
    expect(formationPoint(item, 7).y).toBeLessThanOrEqual(0.94);
  });

  it("provides one labelled hub for every lens plus unmatched history", () => {
    expect(FORMATION_ROUTES).toHaveLength(11);
    expect(new Set(FORMATION_ROUTES.map((route) => route.id)).size).toBe(11);
  });
});
