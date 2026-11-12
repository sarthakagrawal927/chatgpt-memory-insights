import { handleMarkdown } from "../../../data/markdown-registry";
export function getStaticPaths() {
  return [{ params: { document: "_catalog" } }];
}
export function GET({ request }: { request: Request }) {
  return handleMarkdown(new Request(new URL("/api/md/_catalog", request.url)));
}
