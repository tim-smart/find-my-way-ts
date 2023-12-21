/** @internal */
export const isCloudflare =
  typeof navigator !== "undefined" &&
  typeof navigator.userAgent === "string" &&
  navigator.userAgent.includes("Cloudflare")
