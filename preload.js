const { contextBridge } = require("electron");
const path = require("path");

function tryRequireNativeCapture() {
    const candidates = [
        path.join(__dirname, "native-capture", "build", "Release", "nox_capture.node"),
        path.join(process.resourcesPath || "", "native-capture", "build", "Release", "nox_capture.node"),
        path.join(process.resourcesPath || "", "app.asar.unpacked", "native-capture", "build", "Release", "nox_capture.node"),
        path.join(process.resourcesPath || "", "app", "native-capture", "build", "Release", "nox_capture.node")
    ];

    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch (err) {
            // Try next path.
        }
    }

    return null;
}

const nativeCapture = tryRequireNativeCapture();

contextBridge.exposeInMainWorld("noxNativeCapture", {
    isAvailable: () => {
        return Boolean(nativeCapture);
    },

    getStatus: () => {
        if (!nativeCapture) {
            return "Native capture helper not loaded";
        }

        return nativeCapture.getStatus();
    },

    listMonitors: () => {
        if (!nativeCapture) {
            return [];
        }

        return nativeCapture.listMonitors();
    },

    captureMonitorFrame: (monitorIndex) => {
        if (!nativeCapture) {
            return {
                success: false,
                message: "Native capture helper not loaded"
            };
        }

        return nativeCapture.captureMonitorFrame(Number(monitorIndex || 0));
    }
});
