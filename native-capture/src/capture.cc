#include <napi.h>
#include <windows.h>
#include <string>
#include <vector>
#include <sstream>

struct MonitorInfo {
    HMONITOR handle = nullptr;
    RECT rect{};
    RECT workRect{};
    bool primary = false;
    std::wstring name;
};

std::string WideToUtf8(const std::wstring& s) {
    if (s.empty()) return "";

    int n = WideCharToMultiByte(
        CP_UTF8,
        0,
        s.c_str(),
        (int)s.size(),
        nullptr,
        0,
        nullptr,
        nullptr
    );

    std::string r(n, 0);

    WideCharToMultiByte(
        CP_UTF8,
        0,
        s.c_str(),
        (int)s.size(),
        r.data(),
        n,
        nullptr,
        nullptr
    );

    return r;
}

std::string MonitorHandleString(HMONITOR monitor) {
    std::ostringstream ss;
    ss << "0x" << std::hex << reinterpret_cast<uintptr_t>(monitor);
    return ss.str();
}

BOOL CALLBACK EnumMonitorsCallback(HMONITOR monitor, HDC, LPRECT, LPARAM data) {
    std::vector<MonitorInfo>* monitors =
        reinterpret_cast<std::vector<MonitorInfo>*>(data);

    MONITORINFOEXW info{};
    info.cbSize = sizeof(MONITORINFOEXW);

    if (!GetMonitorInfoW(monitor, &info)) {
        return TRUE;
    }

    MonitorInfo item;
    item.handle = monitor;
    item.rect = info.rcMonitor;
    item.workRect = info.rcWork;
    item.primary = (info.dwFlags & MONITORINFOF_PRIMARY) != 0;
    item.name = info.szDevice;

    monitors->push_back(item);

    return TRUE;
}

std::vector<MonitorInfo> GetMonitors() {
    std::vector<MonitorInfo> monitors;
    EnumDisplayMonitors(nullptr, nullptr, EnumMonitorsCallback, reinterpret_cast<LPARAM>(&monitors));
    return monitors;
}

Napi::Object MonitorToObject(Napi::Env env, const MonitorInfo& monitor, int index) {
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("index", index);
    obj.Set("handle", MonitorHandleString(monitor.handle));
    obj.Set("name", WideToUtf8(monitor.name));
    obj.Set("primary", monitor.primary);
    obj.Set("x", monitor.rect.left);
    obj.Set("y", monitor.rect.top);
    obj.Set("width", monitor.rect.right - monitor.rect.left);
    obj.Set("height", monitor.rect.bottom - monitor.rect.top);
    obj.Set("workX", monitor.workRect.left);
    obj.Set("workY", monitor.workRect.top);
    obj.Set("workWidth", monitor.workRect.right - monitor.workRect.left);
    obj.Set("workHeight", monitor.workRect.bottom - monitor.workRect.top);

    return obj;
}

bool CaptureMonitorPixels(const MonitorInfo& monitor, std::vector<unsigned char>& pixels, int& width, int& height, std::string& errorText) {
    width = monitor.rect.right - monitor.rect.left;
    height = monitor.rect.bottom - monitor.rect.top;

    if (width <= 0 || height <= 0) {
        errorText = "Invalid monitor size";
        return false;
    }

    HDC screenDC = GetDC(nullptr);

    if (!screenDC) {
        errorText = "GetDC failed";
        return false;
    }

    HDC memoryDC = CreateCompatibleDC(screenDC);

    if (!memoryDC) {
        ReleaseDC(nullptr, screenDC);
        errorText = "CreateCompatibleDC failed";
        return false;
    }

    HBITMAP bitmap = CreateCompatibleBitmap(screenDC, width, height);

    if (!bitmap) {
        DeleteDC(memoryDC);
        ReleaseDC(nullptr, screenDC);
        errorText = "CreateCompatibleBitmap failed";
        return false;
    }

    HGDIOBJ oldObject = SelectObject(memoryDC, bitmap);

    BOOL bitBltOk = BitBlt(
        memoryDC,
        0,
        0,
        width,
        height,
        screenDC,
        monitor.rect.left,
        monitor.rect.top,
        SRCCOPY | CAPTUREBLT
    );

    SelectObject(memoryDC, oldObject);

    if (!bitBltOk) {
        DeleteObject(bitmap);
        DeleteDC(memoryDC);
        ReleaseDC(nullptr, screenDC);
        errorText = "BitBlt failed";
        return false;
    }

    BITMAPINFO info{};
    info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth = width;
    info.bmiHeader.biHeight = -height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB;

    pixels.resize(width * height * 4);

    int lines = GetDIBits(
        memoryDC,
        bitmap,
        0,
        height,
        pixels.data(),
        &info,
        DIB_RGB_COLORS
    );

    DeleteObject(bitmap);
    DeleteDC(memoryDC);
    ReleaseDC(nullptr, screenDC);

    if (lines == 0) {
        errorText = "GetDIBits failed";
        return false;
    }

    return true;
}

void BgraToRgba(std::vector<unsigned char>& pixels) {
    for (size_t i = 0; i + 3 < pixels.size(); i += 4) {
        unsigned char b = pixels[i + 0];
        unsigned char r = pixels[i + 2];

        pixels[i + 0] = r;
        pixels[i + 2] = b;
        pixels[i + 3] = 255;
    }
}

Napi::String GetStatus(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), "Native monitor capture helper loaded");
}

Napi::Array ListMonitors(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::vector<MonitorInfo> monitors = GetMonitors();
    Napi::Array result = Napi::Array::New(env, monitors.size());

    for (size_t i = 0; i < monitors.size(); i++) {
        result.Set(i, MonitorToObject(env, monitors[i], (int)i));
    }

    return result;
}

Napi::Object CaptureMonitorFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);

    int monitorIndex = 0;

    if (info.Length() >= 1 && info[0].IsNumber()) {
        monitorIndex = info[0].As<Napi::Number>().Int32Value();
    }

    std::vector<MonitorInfo> monitors = GetMonitors();

    if (monitors.empty()) {
        result.Set("success", false);
        result.Set("message", "No monitors found");
        return result;
    }

    if (monitorIndex < 0 || monitorIndex >= (int)monitors.size()) {
        result.Set("success", false);
        result.Set("message", "Invalid monitor index");
        return result;
    }

    std::vector<unsigned char> pixels;
    int width = 0;
    int height = 0;
    std::string errorText;

    if (!CaptureMonitorPixels(monitors[monitorIndex], pixels, width, height, errorText)) {
        result.Set("success", false);
        result.Set("message", errorText);
        result.Set("monitor", MonitorToObject(env, monitors[monitorIndex], monitorIndex));
        return result;
    }

    BgraToRgba(pixels);

    result.Set("success", true);
    result.Set("message", "Monitor frame captured");
    result.Set("monitor", MonitorToObject(env, monitors[monitorIndex], monitorIndex));
    result.Set("width", width);
    result.Set("height", height);
    result.Set("buffer", Napi::Buffer<unsigned char>::Copy(env, pixels.data(), pixels.size()));

    return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getStatus", Napi::Function::New(env, GetStatus));
    exports.Set("listMonitors", Napi::Function::New(env, ListMonitors));
    exports.Set("captureMonitorFrame", Napi::Function::New(env, CaptureMonitorFrame));

    return exports;
}

NODE_API_MODULE(nox_capture, Init)
