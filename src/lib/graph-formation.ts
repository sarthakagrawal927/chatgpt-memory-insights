import type { GraphFormationConversation, QuestionLens } from "./types";

export type FormationRouteId = QuestionLens["id"] | "other";

export type FormationRoute = {
  id: FormationRouteId;
  label: string;
  color: string;
  x: number;
  y: number;
};

export const FORMATION_ROUTES: FormationRoute[] = [
  { id: "math", label: "Math", color: "#2157d5", x: 0.15, y: 0.18 },
  { id: "health", label: "Health", color: "#168579", x: 0.38, y: 0.12 },
  { id: "software", label: "Software", color: "#7554c8", x: 0.66, y: 0.13 },
  { id: "money", label: "Money", color: "#d69a17", x: 0.86, y: 0.27 },
  { id: "career", label: "Career", color: "#7554c8", x: 0.87, y: 0.58 },
  { id: "learning", label: "Learning", color: "#2157d5", x: 0.7, y: 0.82 },
  { id: "creative", label: "Creative", color: "#e44b33", x: 0.33, y: 0.84 },
  {
    id: "relationships",
    label: "Relationships",
    color: "#168579",
    x: 0.13,
    y: 0.65,
  },
  { id: "travel", label: "Travel", color: "#2157d5", x: 0.09, y: 0.38 },
  { id: "planning", label: "Planning", color: "#e44b33", x: 0.5, y: 0.48 },
  { id: "other", label: "Other", color: "#5d6970", x: 0.5, y: 0.7 },
];

const ROUTE_BY_ID = new Map(FORMATION_ROUTES.map((route) => [route.id, route]));

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function formationRouteIds(conversation: GraphFormationConversation): FormationRouteId[] {
  return conversation.routeIds.length > 0 ? conversation.routeIds.slice(0, 3) : ["other"];
}

export function formationPoint(
  conversation: GraphFormationConversation,
  index: number
): { x: number; y: number } {
  const primary = ROUTE_BY_ID.get(formationRouteIds(conversation)[0]) ?? ROUTE_BY_ID.get("other")!;
  const hash = stableHash(`${conversation.id}:${index}`);
  const angle = ((hash % 3_600) / 3_600) * Math.PI * 2;
  const radius = 0.025 + (((hash >>> 12) % 1_000) / 1_000) * 0.075;
  return {
    x: Math.max(0.035, Math.min(0.965, primary.x + Math.cos(angle) * radius)),
    y: Math.max(0.06, Math.min(0.94, primary.y + Math.sin(angle) * radius * 0.72)),
  };
}

export function formationRoute(id: FormationRouteId): FormationRoute {
  return ROUTE_BY_ID.get(id) ?? ROUTE_BY_ID.get("other")!;
}
