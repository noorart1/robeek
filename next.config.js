
const isDev = process.env.NODE_ENV !== "production";

// Everything the app loads comes from its own origin: no CDNs, no external
// fonts (Cairo is self-hosted), no third-party scripts. Next.js injects
// inline bootstrap scripts, hence 'unsafe-inline'; development also needs
// eval and the hot-reload websocket.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Older browsers that ignore frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  },
  // HTTPS only from now on for this host. No includeSubDomains: other
  // subdomains of alburagh.com are not ours to commit to HTTPS.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }])
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,

  // Nothing uses next/image. Turning the optimizer off takes the
  // /_next/image endpoint, and sharp/libvips behind it, off the network.
  images: { unoptimized: true },

  experimental: {
    cpus: 1,
    workerThreads: false
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The host's LiteSpeed server honours Next's one-year s-maxage on
        // prerendered pages (/, /login) and kept serving the previous
        // build's copies after a deploy. Nothing here should sit in a shared
        // cache (it is an authenticated app with children's data), so opt
        // out of LiteSpeed caching for everything but the hashed build
        // assets. The Purge header clears the two stale copies cached
        // before this rule existed.
        source: "/((?!_next/static).*)",
        headers: [
          { key: "X-LiteSpeed-Cache-Control", value: "no-cache" },
          { key: "X-LiteSpeed-Purge", value: "/, /login" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
