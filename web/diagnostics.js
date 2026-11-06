window.prombeeErrors = [];
window.addEventListener("error", event => {
  window.prombeeErrors.push({message: event.message, source: event.filename, line: event.lineno});
});
window.addEventListener("unhandledrejection", event => {
  window.prombeeErrors.push({message: String(event.reason?.message || event.reason)});
});
window.addEventListener("securitypolicyviolation", event => {
  window.prombeeErrors.push({message: event.violatedDirective, blocked: event.blockedURI});
});
