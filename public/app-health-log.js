// App Health browser logs. Public, origin-pinned key; nothing here is secret.
// Logs form submits, clicks on [data-log] elements, and client errors to the
// Logs tab at health.sassmaker.com. window.appHealthLog(event, options) is
// available for custom events. Source: app-health/examples/dropin-log-client.
(function () {
  var KEY = "ahk_pub_6e16be9c9385a6def153b05b1feb391a1205ca00a2c4cd263fb7428dbed4302c", ENV = "production", URL = "https://ingest.sassmaker.com/v1/logs";
  function id() { return crypto.randomUUID(); }
  function send(event, o) {
    o = o || {};
    var props = {}, src = o.props || {};
    for (var k in src) if (src[k] !== undefined) props[k] = typeof src[k] === "string" ? src[k].slice(0, 500) : src[k];
    var body = JSON.stringify({ public_key: KEY, batch_id: id(), schema_version: "v1", environment: ENV,
      logs: [{ log_id: id(), timestamp: Date.now(), event: event, level: o.level || "info", title: o.title, description: o.description, icon: o.icon, props: props }] });
    if (document.visibilityState === "hidden" && navigator.sendBeacon) { navigator.sendBeacon(URL, new Blob([body], { type: "text/plain" })); return; }
    fetch(URL, { method: "POST", headers: { "content-type": "text/plain" }, body: body, keepalive: true }).catch(function () {});
  }
  window.appHealthLog = send;
  document.addEventListener("submit", function (e) {
    var f = e.target; if (!f || f.tagName !== "FORM") return;
    send("form.submitted", { title: f.id || f.getAttribute("name") || f.getAttribute("action") || "form", props: { page: location.pathname } });
  }, true);
  document.addEventListener("click", function (e) {
    var cta = e.target && e.target.closest ? e.target.closest("[data-app-health-event]") : null;
    var eventName = cta && cta.getAttribute("data-app-health-event");
    if (eventName && cta.tagName !== "INPUT" && window.appHealth && typeof window.appHealth.track === "function") {
      window.appHealth.track(eventName);
      if (cta.tagName === "A" && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && cta.target !== "_blank" && !cta.hasAttribute("download")) {
        e.preventDefault();
        var navigated = false;
        var navigate = function () {
          if (navigated) return;
          navigated = true;
          location.assign(cta.href);
        };
        setTimeout(navigate, 4500);
        Promise.resolve(window.appHealth.flush && window.appHealth.flush()).catch(function () {}).finally(navigate);
      }
    }
    var t = e.target && e.target.closest ? e.target.closest("[data-log]") : null;
    var name = t && t.getAttribute("data-log");
    if (name) send(name, { title: (t.textContent || "").trim().slice(0, 120) || name, props: { page: location.pathname } });
  }, true);
  document.addEventListener("change", function (e) {
    var input = e.target;
    var name = input && input.getAttribute && input.getAttribute("data-app-health-event");
    if (name && input.files && input.files.length && window.appHealth && typeof window.appHealth.track === "function") {
      window.appHealth.track(name);
    }
  }, true);
  window.addEventListener("error", function (e) {
    send("client.error", { level: "error", title: String(e.message || "error").slice(0, 200), props: { page: location.pathname } });
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    send("client.error", { level: "error", title: r.slice(0, 200), props: { page: location.pathname, kind: "rejection" } });
  });
})();
