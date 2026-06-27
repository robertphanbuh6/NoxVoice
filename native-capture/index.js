const nativeCapture = require("./build/Release/nox_capture.node");

console.log(nativeCapture.getStatus());
console.log("Detected monitors:");
console.log(nativeCapture.listMonitors());
