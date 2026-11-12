if (!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
  // The browser SDK consumes this documented initialization queue when it loads.
  // Do not call init on a placeholder function before the async SDK is available.
  const queue = (window.posthog = window.posthog || []);
  if (!queue.__SV) {
    queue.__SV = 1;
    queue._i = [];
    queue.capture = (...args) => queue.push(["capture", ...args]);
    queue._i.push([
      "phc_qgiAarw4Co4pw9fz3Fxj4UJaHmqzFetqs4JrXhGc35Nd",
      {
        api_host: "https://us.i.posthog.com",
        person_profiles: "always",
        capture_pageview: false,
        autocapture: false,
        loaded: () => {
          window.posthog.capture("page_view", { project_id: "chatgpt-memory-insights" });
        },
      },
      "posthog",
    ]);
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = "https://us-assets.i.posthog.com/static/array.js";
    document.head.append(script);
  }
}
