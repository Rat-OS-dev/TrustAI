const { app, BrowserWindow, shell } = require("electron");

const APP_URL = "https://rat-os-dev.github.io/TrustAI/";
const APP_HOST = new URL(APP_URL).host;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    title: "Trust AI",
    autoHideMenuBar: true,
    backgroundColor: "#0b1020",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === "https:" && target.host === APP_HOST) {
        return { action: "allow" };
      }
      if (target.protocol === "https:" || target.protocol === "http:") {
        shell.openExternal(url);
      }
    } catch {
      // Ignore malformed external URLs.
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      if (target.host !== APP_HOST || target.protocol !== "https:") {
        event.preventDefault();
        if (target.protocol === "https:" || target.protocol === "http:") {
          shell.openExternal(url);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  win.loadURL(APP_URL);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
