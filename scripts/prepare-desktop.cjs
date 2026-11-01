const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const standalonePublic = path.join(standalone, "public");
const standaloneStatic = path.join(standalone, ".next", "static");

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) {
    return;
  }

  fs.mkdirSync(destination, { recursive: true });

  fs.cpSync(source, destination, {
    recursive: true,
    force: true
  });
}

copyDirectory(
  path.join(root, "public"),
  standalonePublic
);

copyDirectory(
  path.join(root, ".next", "static"),
  standaloneStatic
);

console.log("Desktop application files prepared.");