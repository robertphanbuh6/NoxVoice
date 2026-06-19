const { app, BrowserWindow } = require("electron");

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false
        }
    });

    // 🔥 IMPORTANT: your Render live link here
    win.loadURL("https://noxvoice.onrender.com/");
}

app.whenReady().then(createWindow);