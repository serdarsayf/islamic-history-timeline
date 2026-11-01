const { app, BrowserWindow, dialog } = require("electron");
const { fork } = require("node:child_process");
const path = require("node:path");

const PORT = 3210;
const URL = `http://127.0.0.1:${PORT}`;

let serverProcess;
let mainWindow;

function startServer() {
  const standaloneDir = path.join(
    app.getAppPath(),
    ".next",
    "standalone"
  );

  const serverPath = path.join(standaloneDir, "server.js");

  serverProcess = fork(serverPath, [], {
    cwd: standaloneDir,
    execPath: process.execPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1"
    },
    stdio: "inherit"
  });
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(URL);

      if (response.ok) {
        return true;
      }
    } catch {
      // Server is still starting.
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return false;
}

async function createWindow() {
  startServer();

  const ready = await waitForServer();

  if (!ready) {
    dialog.showErrorBox(
      "Startup Error",
      "The timeline application could not start."
    );

    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Islamic History Timeline",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  await mainWindow.loadURL(URL);
}

app.whenReady().then(createWindow);

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});