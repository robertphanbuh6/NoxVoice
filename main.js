const {
    app,
    BrowserWindow,
    session,
    ipcMain,
    desktopCapturer
} = require("electron");

const { autoUpdater } = require("electron-updater");

const APP_URL = "https://noxvoice.onrender.com";

let mainWindow = null;
let updateWindow = null;
let streamPickerWindow = null;

/* ================= CUSTOM STREAM PICKER ================= */

function getSourceType(source) {
    const id = String(source.id || "").toLowerCase();

    if (id.startsWith("window")) {
        return "Window";
    }

    return "Screen";
}

function createSourcePayload(sources) {
    return sources.map((source) => {
        let thumbnail = "";

        try {
            if (source.thumbnail) {
                thumbnail = source.thumbnail.toDataURL();
            }
        } catch (err) {
            thumbnail = "";
        }

        return {
            id: source.id,
            name: source.name || "Unknown",
            type: getSourceType(source),
            thumbnail: thumbnail
        };
    });
}

function chooseStreamSource(sources) {
    return new Promise((resolve) => {
        if (!sources || sources.length === 0) {
            resolve(null);
            return;
        }

        if (streamPickerWindow && !streamPickerWindow.isDestroyed()) {
            streamPickerWindow.close();
            streamPickerWindow = null;
        }

        const pickerId =
            "stream-picker-" +
            Date.now().toString() +
            "-" +
            Math.random().toString(16).slice(2);

        const selectChannel = pickerId + ":select";
        const cancelChannel = pickerId + ":cancel";

        let finished = false;

        function finish(selectedSource) {
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

            resolve(selectedSource || null);
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

        const payload = createSourcePayload(sources);

        streamPickerWindow = new BrowserWindow({
            width: 860,
            height: 620,
            minWidth: 720,
            minHeight: 520,
            parent: mainWindow || undefined,
            modal: true,
            frame: false,
            resizable: true,
            center: true,
            backgroundColor: "#11131a",
            show: false,
            title: "Choose Stream",
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
    <title>NoxVoice Stream Picker</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            width: 100vw;
            height: 100vh;
            background: #11131a;
            color: #ffffff;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }

        .window {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background:
                radial-gradient(circle at top left, rgba(88, 101, 242, 0.24), transparent 34%),
                linear-gradient(135deg, #11131a, #1d2232);
        }

        .titlebar {
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            -webkit-app-region: drag;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 800;
            font-size: 15px;
        }

        .logo {
            width: 30px;
            height: 30px;
            border-radius: 10px;
            background: #5865f2;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 18px rgba(88, 101, 242, 0.45);
        }

        .close-btn {
            width: 34px;
            height: 30px;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: #cbd2e4;
            font-size: 18px;
            cursor: pointer;
            -webkit-app-region: no-drag;
        }

        .close-btn:hover {
            background: #ed4245;
            color: white;
        }

        .header {
            padding: 18px 22px 12px;
        }

        .header h1 {
            margin: 0 0 6px;
            font-size: 24px;
        }

        .header p {
            margin: 0;
            color: #aeb7cf;
            font-size: 13px;
            line-height: 1.5;
        }

        .toolbar {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 22px 14px;
        }

        .tab-btn {
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.055);
            color: #dce2f3;
            border-radius: 999px;
            height: 34px;
            padding: 0 14px;
            cursor: pointer;
            font-weight: 700;
        }

        .tab-btn.active {
            background: #5865f2;
            border-color: #5865f2;
            color: #ffffff;
        }

        .search {
            flex: 1;
            height: 34px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 9px;
            background: rgba(0, 0, 0, 0.22);
            color: white;
            outline: none;
            padding: 0 12px;
        }

        .content {
            flex: 1;
            overflow-y: auto;
            padding: 0 22px 16px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
            gap: 14px;
            padding-bottom: 8px;
        }

        .card {
            border: 2px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.22);
            border-radius: 14px;
            overflow: hidden;
            cursor: pointer;
            transition: 0.12s ease;
        }

        .card:hover {
            transform: translateY(-2px);
            border-color: rgba(88, 101, 242, 0.75);
            background: rgba(88, 101, 242, 0.12);
        }

        .card.selected {
            border-color: #5865f2;
            box-shadow: 0 0 0 3px rgba(88, 101, 242, 0.25);
            background: rgba(88, 101, 242, 0.18);
        }

        .thumb-wrap {
            height: 118px;
            background: #05060a;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .thumb {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .thumb-empty {
            color: #7f8aa7;
            font-size: 38px;
        }

        .card-info {
            padding: 10px;
        }

        .type {
            display: inline-flex;
            align-items: center;
            height: 20px;
            padding: 0 8px;
            border-radius: 999px;
            background: rgba(88, 101, 242, 0.2);
            color: #d9defc;
            font-size: 11px;
            font-weight: 800;
            margin-bottom: 7px;
        }

        .name {
            font-size: 13px;
            line-height: 1.35;
            color: #ffffff;
            min-height: 36px;
            word-break: break-word;
        }

        .footer {
            height: 76px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 22px;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(10, 12, 19, 0.74);
        }

        .hint {
            color: #aeb7cf;
            font-size: 12px;
            line-height: 1.4;
        }

        .actions {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .cancel,
        .start {
            height: 40px;
            min-width: 112px;
            border: none;
            border-radius: 10px;
            color: white;
            font-weight: 800;
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

        .empty {
            text-align: center;
            color: #aeb7cf;
            padding: 45px 0;
            font-size: 14px;
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
    <div class="window">
        <div class="titlebar">
            <div class="brand">
                <div class="logo">🎧</div>
                <div>NoxVoice Stream</div>
            </div>
            <button class="close-btn" id="closeBtn">×</button>
        </div>

        <div class="header">
            <h1>Choose what to stream</h1>
            <p>Select a specific window or your entire screen. Audio uses system loopback audio, so use headphones to avoid echo.</p>
        </div>

        <div class="toolbar">
            <button class="tab-btn active" data-filter="All">All</button>
            <button class="tab-btn" data-filter="Window">Windows</button>
            <button class="tab-btn" data-filter="Screen">Screens</button>
            <input class="search" id="searchInput" placeholder="Search windows..." />
        </div>

        <div class="content">
            <div class="grid" id="grid"></div>
        </div>

        <div class="footer">
            <div class="hint">
                Tip: choose the game/app window, not NoxVoice, to avoid mirror effect.
            </div>
            <div class="actions">
                <button class="cancel" id="cancelBtn">Cancel</button>
                <button class="start" id="startBtn" disabled>Start Stream</button>
            </div>
        </div>
    </div>

    <script>
        const { ipcRenderer } = require("electron");

        const sources = ${JSON.stringify(payload)};
        const selectChannel = ${JSON.stringify(selectChannel)};
        const cancelChannel = ${JSON.stringify(cancelChannel)};

        let selectedId = "";
        let currentFilter = "All";

        const grid = document.getElementById("grid");
        const searchInput = document.getElementById("searchInput");
        const startBtn = document.getElementById("startBtn");
        const cancelBtn = document.getElementById("cancelBtn");
        const closeBtn = document.getElementById("closeBtn");

        function matchesFilter(source) {
            const query = searchInput.value.trim().toLowerCase();

            if (currentFilter !== "All" && source.type !== currentFilter) {
                return false;
            }

            if (query && !source.name.toLowerCase().includes(query)) {
                return false;
            }

            return true;
        }

        function render() {
            grid.innerHTML = "";

            const filtered = sources.filter(matchesFilter);

            if (filtered.length === 0) {
                const empty = document.createElement("div");
                empty.className = "empty";
                empty.innerText = "No windows found.";
                grid.appendChild(empty);
                return;
            }

            filtered.forEach((source) => {
                const card = document.createElement("div");
                card.className = "card";

                if (source.id === selectedId) {
                    card.classList.add("selected");
                }

                card.onclick = () => {
                    selectedId = source.id;
                    startBtn.disabled = false;
                    render();
                };

                card.ondblclick = () => {
                    selectedId = source.id;
                    ipcRenderer.send(selectChannel, selectedId);
                };

                const thumbWrap = document.createElement("div");
                thumbWrap.className = "thumb-wrap";

                if (source.thumbnail) {
                    const img = document.createElement("img");
                    img.className = "thumb";
                    img.src = source.thumbnail;
                    thumbWrap.appendChild(img);
                } else {
                    const icon = document.createElement("div");
                    icon.className = "thumb-empty";
                    icon.innerText = source.type === "Window" ? "▣" : "🖥️";
                    thumbWrap.appendChild(icon);
                }

                const info = document.createElement("div");
                info.className = "card-info";

                const type = document.createElement("div");
                type.className = "type";
                type.innerText = source.type;

                const name = document.createElement("div");
                name.className = "name";
                name.innerText = source.name;

                info.appendChild(type);
                info.appendChild(name);

                card.appendChild(thumbWrap);
                card.appendChild(info);

                grid.appendChild(card);
            });
        }

        document.querySelectorAll(".tab-btn").forEach((btn) => {
            btn.onclick = () => {
                document.querySelectorAll(".tab-btn").forEach((other) => {
                    other.classList.remove("active");
                });

                btn.classList.add("active");
                currentFilter = btn.dataset.filter;
                render();
            };
        });

        searchInput.oninput = render;

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

/* ================= SCREEN SHARE HANDLER ================= */

function setupScreenShareHandler() {
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ["window", "screen"],
                thumbnailSize: {
                    width: 420,
                    height: 260
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

            console.log("Selected stream source:", selectedSource.name, selectedSource.id);

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
