const http = require("http");
const next = require("next");
const { loadEnvConfig } = require("@next/env");

// Load .env ourselves so MAINTENANCE_MODE is known before Next starts.
loadEnvConfig(__dirname);

// MAINTENANCE_MODE=1 in .env (then restart) takes the whole app offline:
// every request gets a 503 page and Next.js is never started, so it works
// even while the build or the database is broken.
const maintenance = ["1", "true", "on"].includes(
  String(process.env.MAINTENANCE_MODE || "").toLowerCase()
);

const maintenancePage = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>النظام متوقف مؤقتاً</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center;
         justify-content: center; font-family: Tahoma, Arial, sans-serif;
         background: #f5f7fa; color: #1f2937; text-align: center; }
  main { padding: 32px 24px; max-width: 420px; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 0; line-height: 1.8; color: #4b5563; }
</style>
</head>
<body>
<main>
  <h1>النظام متوقف مؤقتاً للصيانة</h1>
  <p>نعتذر عن الإزعاج، سيعود النظام للعمل قريباً.</p>
</main>
</body>
</html>`;

function serveMaintenance(req, res) {
  res.writeHead(503, {
    "Content-Type": "text/html; charset=utf-8",
    "Retry-After": "3600",
    "Cache-Control": "no-store",
    // Keep LiteSpeed from caching this page past the maintenance window.
    "X-LiteSpeed-Cache-Control": "no-cache",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
  });
  res.end(req.method === "HEAD" ? undefined : maintenancePage);
}

if (maintenance) {
  http.createServer(serveMaintenance).listen(process.env.PORT || 3000, () => {
    console.log("School Management System is in maintenance mode");
  });
} else {
  const app = next({
    dev: false,
    dir: __dirname
  });

  const handle = app.getRequestHandler();

  app.prepare()
    .then(() => {
      const server = http.createServer((req, res) => {
        handle(req, res);
      });

      server.listen(process.env.PORT || 3000, () => {
        console.log(
          "School Management System is running"
        );
      });
    })
    .catch((error) => {
      console.error("Next.js startup error:", error);
      process.exit(1);
    });
}
