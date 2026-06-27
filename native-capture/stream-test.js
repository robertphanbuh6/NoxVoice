const { app, BrowserWindow } = require("electron");
const path = require("path");

const processName = process.argv[2] || "cs2.exe";
const targetFps = Number(process.argv[3] || 60);

function createWindow() {
    const win = new BrowserWindow({
        width: 1320,
        height: 820,
        title: "NoxVoice Native Stream Bridge Test",
        backgroundColor: "#11131a",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const addonPath = path.join(__dirname, "build", "Release", "nox_capture.node");

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>NoxVoice Native Stream Bridge Test</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            background: #11131a;
            color: white;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        .top {
            height: 64px;
            padding: 10px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #1b2030;
            border-bottom: 1px solid #30384d;
        }
        .title { font-weight: 900; font-size: 17px; }
        .status { color: #b8c2dc; font-size: 13px; margin-top: 4px; }
        .grid {
            height: calc(100vh - 64px);
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            padding: 14px;
        }
        .panel {
            min-width: 0;
            background: #171b26;
            border: 1px solid #30384d;
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .panel-title {
            padding: 10px 12px;
            background: #202638;
            border-bottom: 1px solid #30384d;
            font-weight: 800;
        }
        .preview {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px;
        }
        canvas, video {
            max-width: 100%;
            max-height: 100%;
            background: #05060a;
            border-radius: 10px;
        }
        code { color: #80ffb0; }
    </style>
</head>
<body>
    <div class="top">
        <div>
            <div class="title">NoxVoice Native Stream Bridge Test</div>
            <div class="status" id="status">Starting...</div>
        </div>
        <div class="status" id="fps">Draw FPS: 0 | Stream tracks: 0</div>
    </div>

    <div class="grid">
        <div class="panel">
            <div class="panel-title">Native capture canvas</div>
            <div class="preview">
                <canvas id="canvas"></canvas>
            </div>
        </div>
        <div class="panel">
            <div class="panel-title">canvas.captureStream(${targetFps}) video preview</div>
            <div class="preview">
                <video id="video" autoplay muted playsinline></video>
            </div>
        </div>
    </div>

    <script>
        const nativeCapture = require(${JSON.stringify(addonPath)});
        const processName = ${JSON.stringify(processName)};
        const targetFps = ${JSON.stringify(targetFps)};

        const canvas = document.getElementById("canvas");
        const ctx = canvas.getContext("2d", { alpha: false });
        const video = document.getElementById("video");
        const statusEl = document.getElementById("status");
        const fpsEl = document.getElementById("fps");

        let stream = null;
        let frames = 0;
        let lastFpsTime = performance.now();
        let running = true;

        function ensureStream() {
            if (stream) return;

            stream = canvas.captureStream(targetFps);
            video.srcObject = stream;

            const tracks = stream.getVideoTracks();
            statusEl.innerText = "MediaStream created from native canvas. Track: " + (tracks[0] ? tracks[0].label : "none");
        }

        function drawFrame() {
            if (!running) return;

            const started = performance.now();

            try {
                const frame = nativeCapture.captureOneFrameByProcessName(processName);

                if (!frame.success) {
                    statusEl.innerText = frame.message || "Capture failed";
                } else {
                    if (canvas.width !== frame.width || canvas.height !== frame.height) {
                        canvas.width = frame.width;
                        canvas.height = frame.height;
                        ensureStream();
                    }

                    const image = new ImageData(
                        new Uint8ClampedArray(frame.buffer),
                        frame.width,
                        frame.height
                    );

                    ctx.putImageData(image, 0, 0);

                    statusEl.innerHTML = "<code>" + processName + "</code> | " + frame.width + "x" + frame.height + " | This MediaStream is what NoxVoice WebRTC will send.";
                    frames++;
                }
            } catch (err) {
                statusEl.innerText = "Error: " + err.message;
            }

            const now = performance.now();

            if (now - lastFpsTime >= 1000) {
                const tracks = stream ? stream.getVideoTracks().length : 0;
                fpsEl.innerText = "Draw FPS: " + frames + " | Stream tracks: " + tracks;
                frames = 0;
                lastFpsTime = now;
            }

            const frameTime = 1000 / targetFps;
            const spent = performance.now() - started;
            const delay = Math.max(0, frameTime - spent);

            setTimeout(drawFrame, delay);
        }

        ensureStream();
        drawFrame();

        window.addEventListener("beforeunload", () => {
            running = false;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        });
    </script>
</body>
</html>`;

    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    app.quit();
});
