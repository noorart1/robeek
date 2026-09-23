
const http = require("http");
const next = require("next");

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
