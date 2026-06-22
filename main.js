const { app, BrowserWindow, session, desktopCapturer, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 650,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });

    session.defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback) => {
            if (
                permission === "media" ||
                permission === "microphone" ||
                permission === "camera" ||
                permission === "display-capture"
            ) {
                callback(true);
            } else {
                callback(false);
            }
        }
    );

    session.defaultSession.setDisplayMediaRequestHandler(
        async (request, callback) => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ["screen", "window"]
                });

                if (!sources || sources.length === 0) {
                    callback({});
                    return;
                }

                callback({
                    video: sources[0],
                    audio: "loopback"
                });

            } catch (err) {
                console.error("Display media error:", err);
                callback({});
            }
        }
    );

    // Force fresh online version, prevents old cached app.js in EXE
    session.defaultSession.clearCache().then(() => {
        const freshUrl = "https://noxvoice.onrender.com?desktop=" + Date.now();

        mainWindow.loadURL(freshUrl);
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

/* ================= AUTO UPDATER ================= */

function setupAutoUpdater() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
        console.log("Checking for update...");
    });

    autoUpdater.on("update-available", (info) => {
        console.log("Update available:", info.version);
    });

    autoUpdater.on("update-not-available", () => {
        console.log("No update available.");
    });

    autoUpdater.on("download-progress", (progress) => {
        console.log("Update download:", Math.round(progress.percent) + "%");
    });

    autoUpdater.on("error", (err) => {
        console.error("Auto updater error:", err);
    });

    autoUpdater.on("update-downloaded", () => {
        dialog.showMessageBox({
            type: "info",
            title: "NoxVoice Update Ready",
            message: "A new NoxVoice update has been downloaded. Restart now to install it?",
            buttons: ["Restart Now", "Later"],
            defaultId: 0,
            cancelId: 1
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    autoUpdater.checkForUpdatesAndNotify();
}

/* ================= APP EVENTS ================= */

app.whenReady().then(() => {
    createWindow();

    if (app.isPackaged) {
        setupAutoUpdater();
    } else {
        console.log("Auto updater disabled in development mode.");
    }

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});