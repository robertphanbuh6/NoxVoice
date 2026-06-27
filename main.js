const {
    app,
    BrowserWindow,
    session,
    dialog,
    desktopCapturer,
    ipcMain
} = require("electron");

const { autoUpdater } = require("electron-updater");
const path = require("path");

const APP_URL = "https://noxvoice.onrender.com";

let mainWindow = null;
let updateWindow = null;
let streamPickerWindow = null;

/* ================= WINDOW / SCREEN STREAM PICKER ================= */

function shortName(name) {
    const clean = String(name || "Unknown").trim();

    if (clean.length <= 70) {
        return clean;
    }

    return clean.slice(0, 67) + "...";
}

function getSourceType(source) {
    const id = String(source.id || "").toLowerCase();

    if (id.startsWith("window")) {
        return "Window";
    }

    return "Screen";
}

function makeSourcePayload(sources) {
    return sources.map((source) => {
        return {
            id: source.id,
            name: source.name || "Unknown",
            type: getSourceType(source)
        };
    });
}

async function chooseStreamSource(sources) {
    return new Promise((resolve) => {
        if (!sources || sources.length === 0) {
            resolve(null);
            return;
        }

        if (!mainWindow || mainWindow.isDestroyed()) {
            resolve(sources[0] || null);
            return;
        }

        if (streamPickerWindow && !streamPickerWindow.isDestroyed()) {
            streamPickerWindow.close();
            streamPickerWindow = null;
        }

        const pickerId =
            "nox-stream-picker-" +
            Date.now().toString() +
            "-" +
            Math.random().toString(16).slice(2);

        const selectChannel = pickerId + ":select";
        const cancelChannel = pickerId + ":cancel";

        let finished = false;

        function finish(source) {
            if (finished) {
                return;
            }

            finished = true;

            ipcMain.removeAllListeners(selectChannel);
            ipcMain.removeAllListeners(cancelChannel);

            if (streamPickerWindow && !streamPickerWindow.isDestroyed()) {
                streamPickerWindow.destroy();
            }

            streamPickerWindow = null;

            resolve(source || null);
        }

        ipcMain.once(selectChannel, (event, sourceId) => {
            const selectedSource = sources.find((source) => {
                return source.id === sourceId;
            });

            finish(selectedSource || null);
        });

        ipcMain.once(cancelChannel, () => {
            finish(null);
        });

        const payload = makeSourcePayload(sources);

        streamPickerWindow = new BrowserWindow({
            width: 760,
            height: 560,
            minWidth: 680,
            minHeight: 500,
            parent: mainWindow,
            modal: true,
            frame: false,
            resizable: true,
            center: true,
            backgroundColor: "#11131a",
            show: false,
            title: "NoxVoice Game Mode Stream Picker",
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        streamPickerWindow.once("ready-to-show", () => {
            if (streamPickerWindow && !streamPickerWindow.isDestroyed()) {
                streamPickerWindow.show();
                streamPickerWindow.focus();
            }
        });

        streamPickerWindow.on("closed", () => {
            finish(null);
        });

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>NoxVoice Game Mode Stream Picker</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            width: 100vw;
            height: 100vh;
            background: #11131a;
            color: white;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }

        .app {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background:
                radial-gradient(circle at top left, rgba(88, 101, 242, 0.28), transparent 32%),
                linear-gradient(135deg, #11131a, #1b2030);
        }

        .titlebar {
            height: 48px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            -webkit-app-region: drag;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 15px;
            font-weight: 800;
        }

        .logo {
            width: 32px;
            height: 32px;
            border-radius: 11px;
            background: #5865f2;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 22px rgba(88, 101, 242, 0.55);
        }

        .close {
            width: 34px;
            height: 30px;
            border: 0;
            border-radius: 8px;
            color: #d5dbeb;
            background: transparent;
            font-size: 18px;
            cursor: pointer;
            -webkit-app-region: no-drag;
        }

        .close:hover {
            background: #ed4245;
            color: white;
        }

        .header {
            padding: 18px 22px 12px;
        }

        h1 {
            margin: 0 0 6px;
            font-size: 24px;
        }

        .subtitle {
            color: #aeb7cf;
            font-size: 13px;
            line-height: 1.45;
        }

        .toolbar {
            display: flex;
            gap: 10px;
            align-items: center;
            padding: 0 22px 14px;
        }

        .tab {
            height: 34px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.055);
            color: #dce2f3;
            padding: 0 14px;
            font-weight: 800;
            cursor: pointer;
        }

        .tab.active {
            background: #5865f2;
            border-color: #5865f2;
            color: white;
        }

        .search {
            flex: 1;
            height: 34px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 9px;
            background: rgba(0, 0, 0, 0.24);
            color: white;
            outline: none;
            padding: 0 12px;
        }

        .content {
            flex: 1;
            overflow-y: auto;
            padding: 0 22px 16px;
        }

        .list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .source {
            display: grid;
            grid-template-columns: 52px 1fr auto;
            align-items: center;
            gap: 12px;
            padding: 12px;
            border-radius: 14px;
            border: 2px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.22);
            cursor: pointer;
            transition: 0.12s ease;
        }

        .source:hover {
            border-color: rgba(88, 101, 242, 0.75);
            background: rgba(88, 101, 242, 0.13);
            transform: translateY(-1px);
        }

        .source.selected {
            border-color: #5865f2;
            box-shadow: 0 0 0 3px rgba(88, 101, 242, 0.25);
            background: rgba(88, 101, 242, 0.18);
        }

        .icon {
            width: 52px;
            height: 44px;
            border-radius: 12px;
            background: #0b0d14;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 23px;
            color: #dfe4ff;
        }

        .name {
            font-size: 15px;
            font-weight: 800;
            color: white;
            word-break: break-word;
        }

        .meta {
            font-size: 12px;
            color: #aeb7cf;
            margin-top: 4px;
        }

        .badge {
            height: 26px;
            border-radius: 999px;
            background: rgba(88, 101, 242, 0.22);
            color: #dce2ff;
            padding: 0 10px;
            display: flex;
            align-items: center;
            font-size: 12px;
            font-weight: 900;
        }

        .empty {
            text-align: center;
            padding: 45px 0;
            color: #aeb7cf;
        }

        .footer {
            height: 76px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 22px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(10, 12, 19, 0.72);
        }

        .tip {
            color: #aeb7cf;
            font-size: 12px;
            line-height: 1.4;
        }

        .buttons {
            display: flex;
            gap: 10px;
        }

        .cancel,
        .start {
            height: 40px;
            min-width: 112px;
            border: 0;
            border-radius: 10px;
            color: white;
            font-weight: 900;
            cursor: pointer;
            padding: 0 16px;
        }

        .cancel {
            background: #4b5565;
        }

        .cancel:hover {
            background: #5b6678;
        }

        .start {
            background: #5865f2;
        }

        .start:hover {
            background: #4752c4;
        }

        .start:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        ::-webkit-scrollbar {
            width: 10px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.04);
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.22);
            border-radius: 10px;
        }
    </style>
</head>
<body>
    <div class="app">
        <div class="titlebar">
            <div class="brand">
                <div class="logo">🎧</div>
                <div>NoxVoice Stream</div>
            </div>
            <button class="close" id="closeBtn">×</button>
        </div>

        <div class="header">
            <h1>Choose what to stream</h1>
            <div class="subtitle">
                Use Game Mode for fullscreen games like CS2, or Window Mode for apps/borderless games. Audio uses system loopback audio.
            </div>
        </div>

        <div class="toolbar">
            <button class="tab active" data-filter="Screen">Game Mode</button>
            <button class="tab" data-filter="Window">Window Mode</button>
            <button class="tab" data-filter="All">All Sources</button>
            <input id="search" class="search" placeholder="Search screen, game, or window..." />
        </div>

        <div class="content">
            <div id="list" class="list"></div>
        </div>

        <div class="footer">
            <div class="tip">
                Tip: for CS2/fullscreen games, use Game Mode and choose your monitor. For apps/borderless games, use Window Mode.
            </div>

            <div class="buttons">
                <button class="cancel" id="cancelBtn">Cancel</button>
                <button class="start" id="startBtn" disabled>Start Stream</button>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require("electron");

        const sources = ${JSON.stringify(payload)}.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'Screen' ? -1 : 1;
        });
        const selectChannel = ${JSON.stringify(selectChannel)};
        const cancelChannel = ${JSON.stringify(cancelChannel)};

        let selectedId = "";
        let filter = "Screen";

        const list = document.getElementById("list");
        const search = document.getElementById("search");
        const startBtn = document.getElementById("startBtn");
        const cancelBtn = document.getElementById("cancelBtn");
        const closeBtn = document.getElementById("closeBtn");

        function iconFor(source) {
            return source.type === "Window" ? "▣" : "🎮";
        }

        function visibleSources() {
            const q = search.value.trim().toLowerCase();

            return sources.filter((source) => {
                if (filter !== "All" && source.type !== filter) {
                    return false;
                }

                if (q && !source.name.toLowerCase().includes(q)) {
                    return false;
                }

                return true;
            });
        }

        function render() {
            list.innerHTML = "";

            const visible = visibleSources();

            if (visible.length === 0) {
                const empty = document.createElement("div");
                empty.className = "empty";
                empty.innerText = "No matching windows found.";
                list.appendChild(empty);
                return;
            }

            visible.forEach((source) => {
                const row = document.createElement("div");
                row.className = "source";

                if (source.id === selectedId) {
                    row.classList.add("selected");
                }

                row.onclick = () => {
                    selectedId = source.id;
                    startBtn.disabled = false;
                    render();
                };

                row.ondblclick = () => {
                    ipcRenderer.send(selectChannel, source.id);
                };

                const icon = document.createElement("div");
                icon.className = "icon";
                icon.innerText = iconFor(source);

                const text = document.createElement("div");

                const name = document.createElement("div");
                name.className = "name";
                name.innerText = source.name;

                const meta = document.createElement("div");
                meta.className = "meta";

                if (source.type === "Window") {
                    meta.innerText = "Window Mode: best for apps and borderless games";
                } else {
                    meta.innerText = "Game Mode: best for fullscreen games like CS2";
                }

                text.appendChild(name);
                text.appendChild(meta);

                const badge = document.createElement("div");
                badge.className = "badge";
                if (source.type === "Screen") {
                    badge.innerText = "Game Mode";
                } else {
                    badge.innerText = "Window";
                }

                row.appendChild(icon);
                row.appendChild(text);
                row.appendChild(badge);

                list.appendChild(row);
            });
        }

        document.querySelectorAll(".tab").forEach((btn) => {
            btn.onclick = () => {
                document.querySelectorAll(".tab").forEach((other) => {
                    other.classList.remove("active");
                });

                btn.classList.add("active");
                filter = btn.dataset.filter;
                render();
            };
        });

        search.oninput = render;

        startBtn.onclick = () => {
            if (!selectedId) {
                return;
            }

            ipcRenderer.send(selectChannel, selectedId);
        };

        cancelBtn.onclick = () => {
            ipcRenderer.send(cancelChannel);
        };

        closeBtn.onclick = () => {
            ipcRenderer.send(cancelChannel);
        };

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                ipcRenderer.send(cancelChannel);
            }

            if (event.key === "Enter" && selectedId) {
                ipcRenderer.send(selectChannel, selectedId);
            }
        });

        render();
    </script>
</body>
</html>
        `;

        streamPickerWindow.loadURL(
            "data:text/html;charset=utf-8," +
            encodeURIComponent(html)
        );
    });
}

function setupScreenShareHandler() {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ["window", "screen"],
                thumbnailSize: { width: 0, height: 0 },
                fetchWindowIcons: false
            });

            console.log("Available stream sources:");
            sources.forEach((source, index) => {
                console.log(index + ":", source.id, source.name);
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

            console.log("Available stream source selected:", selectedSource.id, selectedSource.name);

            callback({
                video: {
                    id: selectedSource.id,
                    name: selectedSource.name
                },
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
                    * { box-sizing: border-box; }
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
                        0% { transform: translateX(-100%); }
                        50% { transform: translateX(120%); }
                        100% { transform: translateX(320%); }
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
                    <div class="bar"><div class="fill"></div></div>
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
            webSecurity: true,
            preload: path.join(__dirname, "preload.js")
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
