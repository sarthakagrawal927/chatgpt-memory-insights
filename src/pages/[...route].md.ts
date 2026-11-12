import { markdownRoutes, handleMarkdown } from "../data/markdown-registry";
export function getStaticPaths() {
  return markdownRoutes.map((route) => ({
    params: { route: new URL(route.md).pathname.slice(1, -3) },
  }));
}
export function GET({ request }: { request: Request }) {
  return handleMarkdown(request);
}
