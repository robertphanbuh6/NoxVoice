NoxVoice Native Monitor Capture Test

This is for real fullscreen games.
It captures a monitor, not a specific game window.

Copy/replace these files inside:
C:\Users\noxy\Desktop\NoxVoice\native-capture

Run:

$py="C:\Users\noxy\AppData\Local\Programs\Python\Python312\python.exe"
$env:PYTHON=$py
$env:npm_config_python=$py

cd C:\Users\noxy\Desktop\NoxVoice\native-capture

npm.cmd install
npm.cmd run build

npm.cmd run test
npm.cmd run monitor-test

Default:
monitor-test captures monitor 0 at 60 FPS.

For monitor 1:
electron monitor-test.js 1 60

Test steps:
1. Start CS2 in real Fullscreen.
2. Start monitor-test.
3. Alt+Tab to CS2.
4. Wait 5 seconds.
5. Alt+Tab back and check whether the preview captured CS2.

If it works, we can wire this monitor stream into NoxVoice.
If it is black/stale in real exclusive fullscreen, the next step is DXGI Desktop Duplication.
