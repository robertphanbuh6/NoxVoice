const { app, BrowserWindow, session, desktopCapturer } = require("electron");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
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
    });

    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({
            types: ["screen", "window"]
        }).then((sources) => {
            callback({
                video: sources[0],

                // This enables system / stream audio in Electron on Windows
                audio: "loopback"
            });
        });
    });

    session.defaultSession.clearCache().then(() => {
        win.loadURL("https://noxvoice.onrender.com/");
    });

    // For debugging only:
    // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});