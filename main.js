const {
    app,
    BrowserWindow,
    session,
    dialog,
    desktopCapturer
} = require("electron");

const { autoUpdater } = require("electron-updater");

const APP_URL = "https://noxvoice.onrender.com";

let mainWindow = null;
let updateWindow = null;

/* ================= WINDOW / SCREEN STREAM PICKER ================= */

function shortName(name) {
    const clean = String(name || "Unknown").trim();

    if (clean.length > 36) {
        return clean.slice(0, 33) + "...";
    }

    return clean;
}

async function chooseStreamSource(sources) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return sources[0] || null;
    }

    const buttons = sources.map((source) => {
        const isWindow = String(source.id || "").startsWith("window");
        const label = isWindow ? "Window: " : "Screen: ";

        return label + shortName(source.name);
    });

    buttons.push("Cancel");

    const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "NoxVoice Stream",
        message: "Choose what you want to stream",
        detail: "Choose a specific window or screen. Audio uses system loopback audio.",
        buttons: buttons,
        cancelId: buttons.length - 1,
        defaultId: 0,
        noLink: true
    });

    if (result.response === buttons.length - 1) {
        return null;
    }

    return sources[result.response] || null;
}

function setupScreenShareHandler() {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ["window", "screen"],
                thumbnailSize: {
                    width: 320,
                    height: 180
                },
                fetchWindowIcons: true
            });

            if (!sources || sources.length === 0) {
                callback({
                    video: null,
                    audio: null
                });

                return;
            }

            const selectedSource = await chooseStreamSource(sources);

            if (!selectedSource) {
                callback({
                    video: null,
                    audio: null
                });

                return;
            }

            console.log(
                "Selected stream source:",
                selectedSource.name,
                selectedSource.id
            );

            callback({
                video: selectedSource,
                audio: "loopback"
            });

        } catch (err) {
            console.error("Screen/window stream picker error:", err);

            callback({
                video: null,
                audio: null
            });
        }
    });

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const url = webContents.getURL();

        if (url.startsWith(APP_URL)) {
            if (
                permission === "media" ||
                permission === "display-capture" ||
                permission === "fullscreen"
            ) {
                callback(true);
                return;
            }
        }

        callback(false);
    });
}

/* ================= UPDATE WINDOW ================= */

function createUpdateWindow() {
    updateWindow = new BrowserWindow({
        width: 430,
        height: 260,
        resizable: false,
        frame: false,
        center: true,
        backgroundColor: "#11131a",
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    updateWindow.loadURL(
        "data:text/html;charset=utf-8," +
        encodeURIComponent(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>NoxVoice Update</title>
                <style>
                    * {
                        box-sizing: border-box;
                    }

                    body {
                        margin: 0;
                        width: 100vw;
                        height: 100vh;
                        background: linear-gradient(135deg, #11131a, #202437);
                        color: white;
                        font-family: Arial, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                    }

                    .box {
                        width: 100%;
                        text-align: center;
                        padding: 24px;
                    }

                    .logo {
                        width: 74px;
                        height: 74px;
                        border-radius: 22px;
                        background: #5865f2;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 18px;
                        font-size: 34px;
                        box-shadow: 0 0 28px rgba(88, 101, 242, 0.65);
                    }

                    h1 {
                        font-size: 24px;
                        margin: 0 0 10px;
                    }

                    p {
                        margin: 0;
                        color: #c9d0e3;
                        font-size: 14px;
                    }

                    .bar {
                        width: 100%;
                        height: 8px;
                        background: #2b3040;
                        border-radius: 99px;
                        overflow: hidden;
                        margin-top: 22px;
                    }

                    .fill {
                        width: 35%;
                        height: 100%;
                        background: #5865f2;
                        border-radius: 99px;
                        animation: move 1.2s infinite ease-in-out;
                    }

                    @keyframes move {
                        0% {
                            transform: translateX(-100%);
                        }

                        50% {
                            transform: translateX(120%);
                        }

                        100% {
                            transform: translateX(320%);
                        }
                    }

                    .small {
                        margin-top: 12px;
                        font-size: 12px;
                        color: #8f98b3;
                    }
                </style>
            </head>
            <body>
                <div class="box">
                    <div class="logo">🎧</div>
                    <h1>NoxVoice</h1>
                    <p id="status">Checking for updates...</p>
                    <div class="bar">
                        <div class="fill"></div>
                    </div>
                    <div class="small">Please wait before login</div>
                </div>

                <script>
                    const { ipcRenderer } = require("electron");

                    ipcRenderer.on("update-status", function(event, message) {
                        document.getElementById("status").innerText = message;
                    });
                </script>
            </body>
            </html>
        `)
    );

    updateWindow.once("ready-to-show", () => {
        updateWindow.show();
    });
}

function sendUpdateStatus(message) {
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.webContents.send("update-status", message);
    }
}

function closeUpdateWindow() {
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.close();
    }

    updateWindow = null;
}

/* ================= MAIN WINDOW ================= */

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 780,
        minWidth: 900,
        minHeight: 600,
        show: false,
        backgroundColor: "#1e212b",
        title: "NoxVoice",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });

    mainWindow.once("ready-to-show", () => {
        closeUpdateWindow();
        mainWindow.show();
    });

    mainWindow.webContents.on("before-input-event", (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === "i") {
            mainWindow.webContents.openDevTools({
                mode: "detach"
            });
        }

        if (input.key === "F12") {
            mainWindow.webContents.openDevTools({
                mode: "detach"
            });
        }
    });

    session.defaultSession.clearCache()
        .then(() => {
            mainWindow.loadURL(APP_URL + "/?desktopFresh=" + Date.now());
        })
        .catch(() => {
            mainWindow.loadURL(APP_URL + "/?desktopFresh=" + Date.now());
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
        sendUpdateStatus("Checking for updates...");
        console.log("Checking for update...");
    });

    autoUpdater.on("update-available", (info) => {
        sendUpdateStatus("Update found. Downloading version " + info.version + "...");
        console.log("Update available:", info.version);
    });

    autoUpdater.on("update-not-available", () => {
        sendUpdateStatus("No update found. Opening NoxVoice...");

        setTimeout(() => {
            createMainWindow();
        }, 900);
    });

    autoUpdater.on("download-progress", (progress) => {
        const percent = Math.round(progress.percent || 0);

        sendUpdateStatus("Downloading update... " + percent + "%");

        console.log("Download progress:", percent + "%");
    });

    autoUpdater.on("update-downloaded", () => {
        sendUpdateStatus("Update ready. Restarting NoxVoice...");

        setTimeout(() => {
            autoUpdater.quitAndInstall(false, true);
        }, 1200);
    });

    autoUpdater.on("error", (err) => {
        console.error("Auto updater error:", err);

        sendUpdateStatus("Could not check update. Opening NoxVoice...");

        setTimeout(() => {
            createMainWindow();
        }, 1200);
    });
}

function checkForUpdatesBeforeLogin() {
    createUpdateWindow();
    setupAutoUpdater();

    if (app.isPackaged) {
        setTimeout(() => {
            autoUpdater.checkForUpdates();
        }, 800);
    } else {
        sendUpdateStatus("Development mode. Opening NoxVoice...");

        setTimeout(() => {
            createMainWindow();
        }, 900);
    }
}

/* ================= APP EVENTS ================= */

app.whenReady().then(() => {
    setupScreenShareHandler();
    checkForUpdatesBeforeLogin();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            checkForUpdatesBeforeLogin();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});