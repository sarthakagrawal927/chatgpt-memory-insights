import { handleMarkdown } from "../data/markdown-registry";
export function GET({ request }: { request: Request }) {
  return handleMarkdown(request);
}
