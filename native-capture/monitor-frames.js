const path = require("path");
const nativeCapture = require("./build/Release/nox_capture.node");

const monitorIndex = Number(process.argv[2] || 0);
const outputFolder = path.resolve(process.argv[3] || "fullscreen_frames");
const frameCount = Number(process.argv[4] || 120);
const targetFps = Number(process.argv[5] || 60);
const delayMs = Number(process.argv[6] || 5000);

console.log(nativeCapture.getStatus());
console.log("Monitors:");
console.log(nativeCapture.listMonitors());
console.log("");
console.log("Monitor index:", monitorIndex);
console.log("Output folder:", outputFolder);
console.log("Frames:", frameCount);
console.log("Target FPS:", targetFps);
console.log(`Starting in ${delayMs / 1000} seconds...`);
console.log("Switch to CS2 FULLSCREEN now and keep it open.");

setTimeout(() => {
    const result = nativeCapture.captureMonitorFrames(
        monitorIndex,
        outputFolder,
        frameCount,
        targetFps
    );

    console.log("\nCapture result:");
    console.log(result);
    console.log("\nOpen this folder:");
    console.log(outputFolder);
}, delayMs);
