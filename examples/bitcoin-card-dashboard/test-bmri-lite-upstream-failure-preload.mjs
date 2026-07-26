const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://community-api.coinmetrics.io/")) {
    return new Response("upstream unavailable", { status: 503, statusText: "Service Unavailable" });
  }
  return originalFetch(input, init);
};
