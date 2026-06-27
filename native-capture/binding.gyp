{
  "targets": [
    {
      "target_name": "nox_capture",
      "sources": ["src/capture.cc"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "libraries": ["user32.lib", "gdi32.lib"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS", "UNICODE", "_UNICODE"]
    }
  ]
}
