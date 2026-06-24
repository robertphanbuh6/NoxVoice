console.log("NOXVOICE APP LOADED - KEEP VOICE WHEN SWITCHING SERVERS FINAL");

const socket = io();

/* ================= UI ELEMENTS ================= */
const username = document.getElementById("username");
const accountName = document.getElementById("accountName");

const homeServerBtn = document.querySelector(".server-icon.home");
const serverList = document.getElementById("serverList");
const createServerBtn = document.getElementById("createServerBtn");
const joinServerBtn = document.getElementById("joinServerBtn");

const activeServerName = document.getElementById("activeServerName");
const inviteCodeText = document.getElementById("inviteCodeText");

const textChannelList = document.getElementById("textChannelList");
const voiceChannelList = document.getElementById("voiceChannelList");
const createVoiceChannelBtn = document.getElementById("createVoiceChannelBtn");

const mainTitle = document.getElementById("mainTitle");
const mainSubtitle = document.getElementById("mainSubtitle");

const userList = document.getElementById("userList");

const serverInfoTitle = document.getElementById("serverInfoTitle");
const serverInfoText = document.getElementById("serverInfoText");

const voiceStatusTitle = document.getElementById("voiceStatusTitle");
const voiceStatusText = document.getElementById("voiceStatusText");

const joinBtn = document.getElementById("joinBtn");
const voiceBtn = document.getElementById("voiceBtn");
const muteBtn = document.getElementById("muteBtn");
const streamBtn = document.getElementById("streamBtn");
const leaveVoiceBtn = document.getElementById("leaveVoiceBtn");
const logoutBtn = document.getElementById("logoutBtn");
const status = document.getElementById("status");

/* ================= STATE ================= */
let loggedInUsername = null;

let servers = [];
let activeServer = null;
let activeVoiceChannel = null;
let currentVoiceUsers = [];

let localStream = null;
let screenStream = null;
let screenTrack = null;

let micReady = false;
let muted = false;
let isStreaming = false;
let hasJoinedVoice = false;

/* Keep voice connection separate from the server you are browsing */
let connectedVoiceServer = null;
let connectedVoiceChannel = null;

const peers = {};
const userVolumes = {};
const userMuted = {};
const streamingUsers = {};
const mutedUsers = {};
const speakingUsers = {};
const userAvatars = {};

const remoteVideoTracks = {};
const remoteStreamAudioTracks = {};
const watchingStreams = {};

let serverChannelUsers = {};
let channelUserRefreshTimer = null;

let allUsersMuted = false;
let myAvatarData = "";
let settingsButton = null;
let settingsModal = null;
let shortcutListenerReady = false;

const defaultShortcuts = {
    muteAll: "Ctrl+D",
    startStream: "Ctrl+Shift+S",
    endStream: "Ctrl+Shift+E",
    muteMic: "Ctrl+M",
    avatarSettings: "Ctrl+Shift+A"
};

let userShortcuts = {
    ...defaultShortcuts
};

/* ================= CUSTOM INPUT MODAL ================= */
function askInput(titleText, placeholderText) {
    return new Promise((resolve) => {
        const oldModal = document.getElementById("nox-input-modal");

        if (oldModal) {
            oldModal.remove();
        }

        const overlay = document.createElement("div");
        overlay.id = "nox-input-modal";
        overlay.className = "nox-modal-overlay";

        const box = document.createElement("div");
        box.className = "nox-modal-box";

        const title = document.createElement("h3");
        title.innerText = titleText;

        const input = document.createElement("input");
        input.className = "nox-modal-input";
        input.placeholder = placeholderText;
        input.autocomplete = "off";

        const buttons = document.createElement("div");
        buttons.className = "nox-modal-buttons";

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "nox-modal-cancel";
        cancelBtn.innerText = "Cancel";

        const okBtn = document.createElement("button");
        okBtn.className = "nox-modal-ok";
        okBtn.innerText = "OK";

        function close(value) {
            overlay.remove();
            resolve(value);
        }

        cancelBtn.onclick = () => {
            close(null);
        };

        okBtn.onclick = () => {
            const value = input.value.trim();

            if (!value) {
                input.focus();
                return;
            }

            close(value);
        };

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                okBtn.click();
            }

            if (event.key === "Escape") {
                cancelBtn.click();
            }
        });

        buttons.appendChild(cancelBtn);
        buttons.appendChild(okBtn);

        box.appendChild(title);
        box.appendChild(input);
        box.appendChild(buttons);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        setTimeout(() => {
            input.focus();
        }, 50);
    });
}

/* ================= SETTINGS / AVATAR / SHORTCUTS ================= */
function loadShortcutSettings() {
    try {
        const saved = localStorage.getItem("noxvoice_shortcuts");

        if (saved) {
            const parsed = JSON.parse(saved);

            userShortcuts = {
                ...defaultShortcuts,
                ...parsed
            };
        }
    } catch (err) {
        console.log("Shortcut load error:", err);
    }
}

function saveShortcutSettings() {
    localStorage.setItem("noxvoice_shortcuts", JSON.stringify(userShortcuts));
}

async function loadUserProfile() {
    try {
        const res = await fetch("/api/profile");
        const data = await res.json();

        if (!data.success) {
            return;
        }

        myAvatarData = data.profile.avatarData || "";

        if (socket.id) {
            userAvatars[socket.id] = myAvatarData;
        }

        updateSettingsButtonAvatar();
        renderChannels();
        renderCurrentUsers();

    } catch (err) {
        console.log("Profile load error:", err);
    }
}

function createSettingsButton() {
    if (settingsButton) {
        return;
    }

    settingsButton = document.createElement("button");
    settingsButton.className = "settings-floating-btn";
    settingsButton.title = "Settings";
    settingsButton.innerHTML = "⚙️";

    settingsButton.onclick = () => {
        openSettingsModal();
    };

    document.body.appendChild(settingsButton);

    updateSettingsButtonAvatar();
}

function updateSettingsButtonAvatar() {
    if (!settingsButton) {
        return;
    }

    if (myAvatarData) {
        settingsButton.innerHTML = `<img src="${myAvatarData}" alt="avatar">`;
    } else {
        settingsButton.innerHTML = "⚙️";
    }
}

function closeSettingsModal() {
    if (settingsModal) {
        settingsModal.remove();
        settingsModal = null;
    }
}

function openSettingsModal() {
    closeSettingsModal();

    settingsModal = document.createElement("div");
    settingsModal.className = "settings-modal-overlay";

    const box = document.createElement("div");
    box.className = "settings-modal-box";

    const titleRow = document.createElement("div");
    titleRow.className = "settings-title-row";

    const title = document.createElement("div");
    title.className = "settings-modal-title";
    title.innerText = "User Settings";

    const closeBtn = document.createElement("button");
    closeBtn.className = "settings-close-btn";
    closeBtn.innerText = "✕";
    closeBtn.onclick = closeSettingsModal;

    titleRow.appendChild(title);
    titleRow.appendChild(closeBtn);

    const avatarSection = document.createElement("div");
    avatarSection.className = "settings-section";

    const avatarTitle = document.createElement("div");
    avatarTitle.className = "settings-section-title";
    avatarTitle.innerText = "Avatar";

    const avatarPreview = document.createElement("div");
    avatarPreview.className = "settings-avatar-preview";

    if (myAvatarData) {
        avatarPreview.innerHTML = `<img src="${myAvatarData}" alt="avatar">`;
    } else {
        avatarPreview.innerText = getInitials(loggedInUsername || "U");
    }

    const avatarInput = document.createElement("input");
    avatarInput.type = "file";
    avatarInput.accept = "image/*";
    avatarInput.className = "settings-file-input";

    const avatarBtn = document.createElement("button");
    avatarBtn.className = "settings-main-btn";
    avatarBtn.innerText = "Change Avatar";
    avatarBtn.onclick = () => {
        avatarInput.click();
    };

    const removeAvatarBtn = document.createElement("button");
    removeAvatarBtn.className = "settings-secondary-btn";
    removeAvatarBtn.innerText = "Remove Avatar";
    removeAvatarBtn.onclick = async () => {
        await saveAvatar("");
        closeSettingsModal();
        openSettingsModal();
    };

    avatarInput.onchange = async () => {
        const file = avatarInput.files[0];

        if (!file) {
            return;
        }

        try {
            const avatarData = await processAvatarFile(file);
            await saveAvatar(avatarData);

            closeSettingsModal();
            openSettingsModal();

        } catch (err) {
            alert("Could not save avatar");
            console.error(err);
        }
    };

    const avatarButtons = document.createElement("div");
    avatarButtons.className = "settings-button-row";
    avatarButtons.appendChild(avatarBtn);
    avatarButtons.appendChild(removeAvatarBtn);

    avatarSection.appendChild(avatarTitle);
    avatarSection.appendChild(avatarPreview);
    avatarSection.appendChild(avatarInput);
    avatarSection.appendChild(avatarButtons);

    const shortcutsSection = document.createElement("div");
    shortcutsSection.className = "settings-section";

    const shortcutTitle = document.createElement("div");
    shortcutTitle.className = "settings-section-title";
    shortcutTitle.innerText = "Shortcut Keys";

    shortcutsSection.appendChild(shortcutTitle);

    const shortcutFields = [
        {
            key: "muteAll",
            label: "Mute / Unmute All Players"
        },
        {
            key: "startStream",
            label: "Start Stream"
        },
        {
            key: "endStream",
            label: "End Stream"
        },
        {
            key: "muteMic",
            label: "Mute / Unmute Mic"
        },
        {
            key: "avatarSettings",
            label: "Open Settings"
        }
    ];

    shortcutFields.forEach((field) => {
        const row = document.createElement("div");
        row.className = "shortcut-row";

        const label = document.createElement("label");
        label.innerText = field.label;

        const input = document.createElement("input");
        input.className = "shortcut-input";
        input.value = userShortcuts[field.key] || "";
        input.readOnly = true;
        input.placeholder = "Click and press key";

        input.onkeydown = (event) => {
            event.preventDefault();

            const combo = formatShortcutFromEvent(event);

            if (!combo) {
                return;
            }

            userShortcuts[field.key] = combo;
            input.value = combo;
            saveShortcutSettings();
        };

        const clearBtn = document.createElement("button");
        clearBtn.className = "shortcut-clear-btn";
        clearBtn.innerText = "Clear";
        clearBtn.onclick = () => {
            userShortcuts[field.key] = "";
            input.value = "";
            saveShortcutSettings();
        };

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(clearBtn);

        shortcutsSection.appendChild(row);
    });

    const resetBtn = document.createElement("button");
    resetBtn.className = "settings-secondary-btn full-width";
    resetBtn.innerText = "Reset Default Shortcuts";
    resetBtn.onclick = () => {
        userShortcuts = {
            ...defaultShortcuts
        };

        saveShortcutSettings();
        closeSettingsModal();
        openSettingsModal();
    };

    shortcutsSection.appendChild(resetBtn);

    box.appendChild(titleRow);
    box.appendChild(avatarSection);
    box.appendChild(shortcutsSection);

    settingsModal.appendChild(box);
    document.body.appendChild(settingsModal);
}

function getInitials(name) {
    const clean = String(name || "U").trim();

    if (!clean) {
        return "U";
    }

    return clean.charAt(0).toUpperCase();
}

function processAvatarFile(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith("image/")) {
            reject(new Error("Invalid image"));
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement("canvas");
                const size = 128;

                canvas.width = size;
                canvas.height = size;

                const ctx = canvas.getContext("2d");

                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;

                ctx.drawImage(
                    img,
                    sx,
                    sy,
                    minSide,
                    minSide,
                    0,
                    0,
                    size,
                    size
                );

                const dataUrl = canvas.toDataURL("image/jpeg", 0.82);

                resolve(dataUrl);
            };

            img.onerror = reject;
            img.src = reader.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveAvatar(avatarData) {
    const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            avatarData: avatarData
        })
    });

    const data = await res.json();

    if (!data.success) {
        alert(data.message || "Could not save avatar");
        return;
    }

    myAvatarData = data.avatarData || "";

    if (socket.id) {
        userAvatars[socket.id] = myAvatarData;
    }

    socket.emit("avatar-updated", {
        avatarData: myAvatarData
    });

    updateSettingsButtonAvatar();
    renderChannels();
    renderCurrentUsers();
}

function formatShortcutFromEvent(event) {
    const parts = [];

    if (event.ctrlKey) {
        parts.push("Ctrl");
    }

    if (event.shiftKey) {
        parts.push("Shift");
    }

    if (event.altKey) {
        parts.push("Alt");
    }

    const key = event.key;

    if (
        key === "Control" ||
        key === "Shift" ||
        key === "Alt" ||
        key === "Meta"
    ) {
        return "";
    }

    if (key.length === 1) {
        parts.push(key.toUpperCase());
    } else {
        parts.push(key);
    }

    return parts.join("+");
}

function normalizeShortcutText(text) {
    return String(text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
}

function shortcutMatches(event, shortcutText) {
    if (!shortcutText) {
        return false;
    }

    return normalizeShortcutText(formatShortcutFromEvent(event)) ===
        normalizeShortcutText(shortcutText);
}

function isTypingInInput(event) {
    const target = event.target;
    const tag = target.tagName.toLowerCase();

    return (
        tag === "input" ||
        tag === "textarea" ||
        target.isContentEditable
    );
}

function setupShortcutListener() {
    if (shortcutListenerReady) {
        return;
    }

    shortcutListenerReady = true;

    document.addEventListener("keydown", async (event) => {
        if (isTypingInInput(event)) {
            return;
        }

        if (shortcutMatches(event, userShortcuts.muteAll)) {
            event.preventDefault();
            toggleMuteAllUsers();
            return;
        }

        if (shortcutMatches(event, userShortcuts.startStream)) {
            event.preventDefault();

            if (!isStreaming) {
                await startScreenStream();
            }

            return;
        }

        if (shortcutMatches(event, userShortcuts.endStream)) {
            event.preventDefault();

            if (isStreaming) {
                await stopScreenStream();
            }

            return;
        }

        if (shortcutMatches(event, userShortcuts.muteMic)) {
            event.preventDefault();
            toggleSelfMute();
            return;
        }

        if (shortcutMatches(event, userShortcuts.avatarSettings)) {
            event.preventDefault();
            openSettingsModal();
            return;
        }
    });
}

function createAvatarElement(user) {
    const avatar = document.createElement("span");
    avatar.className = "user-avatar";

    const avatarData = user.avatarData || userAvatars[user.id] || "";

    if (avatarData) {
        const img = document.createElement("img");
        img.src = avatarData;
        img.alt = user.username || "User";

        avatar.appendChild(img);
    } else {
        avatar.innerText = getInitials(user.username);
    }

    return avatar;
}

/* ================= MUTE ALL PLAYERS ================= */

function applyMuteAllStateToKnownUsers() {
    currentVoiceUsers.forEach((user) => {
        if (user.id !== socket.id) {
            userMuted[user.id] = allUsersMuted;
            applyUserAudioSettings(user.id);
        }
    });

    Object.values(serverChannelUsers).forEach((users) => {
        users.forEach((user) => {
            if (user.id !== socket.id) {
                userMuted[user.id] = allUsersMuted;
                applyUserAudioSettings(user.id);
            }
        });
    });

    renderChannels();
    renderCurrentUsers();
}

function toggleMuteAllUsers() {
    allUsersMuted = !allUsersMuted;

    applyMuteAllStateToKnownUsers();

    if (allUsersMuted) {
        status.innerText = "All other players muted 🔇";
    } else {
        status.innerText = "All other players unmuted 🔊";
    }
}

/* ================= CHANNEL USER REFRESH ================= */

function stopChannelUserRefresh() {
    if (channelUserRefreshTimer) {
        clearInterval(channelUserRefreshTimer);
        channelUserRefreshTimer = null;
    }
}

function startChannelUserRefresh() {
    stopChannelUserRefresh();

    refreshServerChannelUsers();

    channelUserRefreshTimer = setInterval(() => {
        refreshServerChannelUsers();
    }, 2000);
}

async function refreshServerChannelUsers() {
    if (!activeServer) {
        return;
    }

    try {
        const serverId = activeServer._id;

        const res = await fetch(`/api/servers/${serverId}/channel-users?time=${Date.now()}`, {
            cache: "no-store"
        });

        const data = await res.json();

        if (!data.success) {
            return;
        }

        if (!activeServer || activeServer._id !== serverId) {
            return;
        }

        serverChannelUsers = data.channels || {};

        Object.values(serverChannelUsers).forEach((users) => {
            users.forEach((user) => {
                streamingUsers[user.id] = !!user.isStreaming;
                mutedUsers[user.id] = !!user.isMuted;
                speakingUsers[user.id] = !!user.isSpeaking;
                userAvatars[user.id] = user.avatarData || "";

                if (allUsersMuted && user.id !== socket.id) {
                    userMuted[user.id] = true;
                    applyUserAudioSettings(user.id);
                }
            });
        });

        if (activeVoiceChannel) {
            currentVoiceUsers = serverChannelUsers[activeVoiceChannel.id] || [];

            if (hasJoinedVoice && socket.id) {
                const selfExists = currentVoiceUsers.some((user) => {
                    return user.id === socket.id;
                });

                if (!selfExists) {
                    showSelfInActiveChannel();
                    return;
                }
            }
        }

        renderChannels();
        renderCurrentUsers();

    } catch (err) {
        console.log("Channel users refresh error:", err);
    }
}

/* ================= JOIN / LEAVE SOUND EFFECTS ================= */
let audioContext = null;

function unlockSound() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }
    } catch (err) {
        console.log("Audio unlock error:", err);
    }
}

document.addEventListener("click", unlockSound);
document.addEventListener("keydown", unlockSound);

function playTone(frequency, duration, type, volume) {
    try {
        unlockSound();

        if (!audioContext) {
            return;
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

        gain.gain.setValueAtTime(volume, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);

    } catch (err) {
        console.log("Sound error:", err);
    }
}

function playUserJoinSound() {
    playTone(660, 0.15, "sine", 0.18);

    setTimeout(() => {
        playTone(880, 0.15, "sine", 0.18);
    }, 120);
}

function playUserLeaveSound() {
    playTone(520, 0.15, "sine", 0.18);

    setTimeout(() => {
        playTone(330, 0.15, "sine", 0.18);
    }, 120);
}

/* ================= SPEAKING DETECTION ================= */

let speakingAudioContext = null;
let speakingAnalyser = null;
let speakingDataArray = null;
let speakingAnimationFrame = null;
let lastSpeakingState = false;
let lastLoudTime = 0;

function startSpeakingDetection() {
    stopSpeakingDetection();

    if (!localStream) {
        return;
    }

    try {
        speakingAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = speakingAudioContext.createMediaStreamSource(localStream);

        speakingAnalyser = speakingAudioContext.createAnalyser();
        speakingAnalyser.fftSize = 512;
        speakingAnalyser.smoothingTimeConstant = 0.35;

        source.connect(speakingAnalyser);

        speakingDataArray = new Uint8Array(speakingAnalyser.fftSize);

        detectSpeakingLoop();

    } catch (err) {
        console.error("Speaking detection error:", err);
    }
}

function stopSpeakingDetection() {
    if (speakingAnimationFrame) {
        cancelAnimationFrame(speakingAnimationFrame);
        speakingAnimationFrame = null;
    }

    if (speakingAudioContext) {
        speakingAudioContext.close().catch(() => {});
        speakingAudioContext = null;
    }

    speakingAnalyser = null;
    speakingDataArray = null;

    setSpeakingState(false);
}

function setSpeakingState(isSpeakingNow) {
    if (lastSpeakingState === isSpeakingNow) {
        return;
    }

    lastSpeakingState = isSpeakingNow;
    speakingUsers[socket.id] = isSpeakingNow;

    socket.emit("speaking-status", {
        isSpeaking: isSpeakingNow
    });

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === socket.id) {
            return {
                ...user,
                isSpeaking: isSpeakingNow
            };
        }

        return user;
    });

    if (activeVoiceChannel && serverChannelUsers[activeVoiceChannel.id]) {
        serverChannelUsers[activeVoiceChannel.id] =
            serverChannelUsers[activeVoiceChannel.id].map(user => {
                if (user.id === socket.id) {
                    return {
                        ...user,
                        isSpeaking: isSpeakingNow
                    };
                }

                return user;
            });
    }

    renderChannels();
    renderCurrentUsers();
}

function detectSpeakingLoop() {
    if (!speakingAnalyser || !speakingDataArray) {
        return;
    }

    speakingAnalyser.getByteTimeDomainData(speakingDataArray);

    let sum = 0;

    for (let i = 0; i < speakingDataArray.length; i++) {
        const value = speakingDataArray[i] - 128;
        sum += value * value;
    }

    const rms = Math.sqrt(sum / speakingDataArray.length);

    const speakingThreshold = 10;
    const stopDelayMs = 550;
    const now = Date.now();

    if (!muted && hasJoinedVoice && rms > speakingThreshold) {
        lastLoudTime = now;
        setSpeakingState(true);
    } else {
        if (now - lastLoudTime > stopDelayMs) {
            setSpeakingState(false);
        }
    }

    speakingAnimationFrame = requestAnimationFrame(detectSpeakingLoop);
}

/* ================= USER MENU ================= */
let userVolumeMenu = null;

function closeUserVolumeMenu() {
    if (userVolumeMenu) {
        userVolumeMenu.remove();
        userVolumeMenu = null;
    }
}

document.addEventListener("click", closeUserVolumeMenu);

function showUserVolumeMenu(event, user) {
    event.preventDefault();
    event.stopPropagation();

    if (!user || user.id === socket.id) {
        return;
    }

    closeUserVolumeMenu();

    userVolumeMenu = document.createElement("div");
    userVolumeMenu.className = "user-volume-menu";

    userVolumeMenu.onclick = (e) => {
        e.stopPropagation();
    };

    userVolumeMenu.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const title = document.createElement("div");
    title.className = "user-volume-menu-title";
    title.innerText = user.username;

    userVolumeMenu.appendChild(title);

    const sameActiveChannel =
        activeVoiceChannel &&
        user.channelId === activeVoiceChannel.id;

    if ((streamingUsers[user.id] || user.isStreaming) && sameActiveChannel) {
        const watchBtn = document.createElement("button");
        watchBtn.className = "right-click-watch-btn";

        if (watchingStreams[user.id]) {
            watchBtn.innerText = "Stop Watching";
        } else {
            watchBtn.innerText = "▶ Watch Stream";
        }

        watchBtn.onclick = () => {
            if (watchingStreams[user.id]) {
                closeWatchedStream(user.id);
            } else {
                watchUserStream(user);
            }

            closeUserVolumeMenu();
        };

        userVolumeMenu.appendChild(watchBtn);
    }

    if ((streamingUsers[user.id] || user.isStreaming) && !sameActiveChannel) {
        const note = document.createElement("div");
        note.className = "user-volume-menu-label";
        note.innerText = "Join this voice channel to watch stream.";
        userVolumeMenu.appendChild(note);
    }

    const label = document.createElement("div");
    label.className = "user-volume-menu-label";
    label.innerText = "User Voice Volume";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.01";
    slider.value = userVolumes[user.id] ?? 1;
    slider.className = "right-click-volume-slider";

    const percent = document.createElement("div");
    percent.className = "user-volume-percent";
    percent.innerText = Math.round(Number(slider.value) * 100) + "%";

    slider.oninput = () => {
        userVolumes[user.id] = Number(slider.value);
        percent.innerText = Math.round(userVolumes[user.id] * 100) + "%";
        applyUserAudioSettings(user.id);
    };

    const muteBtn = document.createElement("button");
    muteBtn.className = "right-click-mute-btn";

    if (userMuted[user.id]) {
        muteBtn.innerText = "🔊 Unmute User";
    } else {
        muteBtn.innerText = "🔇 Mute User";
    }

    muteBtn.onclick = () => {
        userMuted[user.id] = !userMuted[user.id];

        applyUserAudioSettings(user.id);

        if (userMuted[user.id]) {
            muteBtn.innerText = "🔊 Unmute User";
        } else {
            muteBtn.innerText = "🔇 Mute User";
        }

        renderCurrentUsers();
        renderChannels();
    };

    userVolumeMenu.appendChild(label);
    userVolumeMenu.appendChild(slider);
    userVolumeMenu.appendChild(percent);
    userVolumeMenu.appendChild(muteBtn);

    document.body.appendChild(userVolumeMenu);

    const menuWidth = 230;
    const menuHeight = 250;

    let x = event.clientX;
    let y = event.clientY;

    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 12;
    }

    if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 12;
    }

    userVolumeMenu.style.left = x + "px";
    userVolumeMenu.style.top = y + "px";
}

/* ================= WATCH STREAM FUNCTIONS ================= */
function watchUserStream(user) {
    watchingStreams[user.id] = true;

    if (!remoteVideoTracks[user.id]) {
        alert("Stream is starting. Please click Watch Stream again in a moment.");
        return;
    }

    showRemoteStream(user.id, user.username);
}

function closeWatchedStream(id) {
    watchingStreams[id] = false;

    const card = document.getElementById("stream-card-" + id);

    if (card) {
        card.remove();
    }
}

function showRemoteStream(id, usernameText) {
    const videoTrack = remoteVideoTracks[id];

    if (!videoTrack) {
        return;
    }

    const grid = getStreamsGrid();

    let card = document.getElementById("stream-card-" + id);

    if (!card) {
        card = document.createElement("div");
        card.id = "stream-card-" + id;
        card.className = "stream-card";

        const titleRow = document.createElement("div");
        titleRow.className = "stream-card-title-row";

        const title = document.createElement("div");
        title.className = "stream-card-title";
        title.innerText = usernameText + "'s stream";

        const closeBtn = document.createElement("button");
        closeBtn.className = "stream-close-btn";
        closeBtn.innerText = "✕";

        closeBtn.onclick = () => {
            closeWatchedStream(id);
        };

        const video = document.createElement("video");
        video.id = "video-" + id;
        video.autoplay = true;
        video.controls = true;
        video.playsInline = true;
        video.muted = false;

        titleRow.appendChild(title);
        titleRow.appendChild(closeBtn);

        card.appendChild(titleRow);
        card.appendChild(video);

        grid.appendChild(card);
    }

    const video = document.getElementById("video-" + id);

    const tracks = [videoTrack];

    if (remoteStreamAudioTracks[id]) {
        tracks.push(remoteStreamAudioTracks[id]);
    }

    video.srcObject = new MediaStream(tracks);

    video.play().catch(() => {
        console.log("Remote stream autoplay blocked. Click play on video.");
    });
}

/* ================= ICE SERVERS ================= */
const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        },
        {
            urls: "turn:relay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:relay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ]
};

/* ================= LOGIN CHECK ================= */
async function checkLogin() {
    try {
        const res = await fetch("/api/me");
        const data = await res.json();

        if (!data.loggedIn) {
            window.location.href = "/login.html";
            return;
        }

        loggedInUsername = data.username;

        username.value = data.username;
        accountName.innerText = "Signed in as: " + data.username;

        loadShortcutSettings();
        createSettingsButton();
        setupShortcutListener();

        await loadUserProfile();
        await loadServers();

    } catch (err) {
        console.error("LOGIN CHECK ERROR:", err);
        window.location.href = "/login.html";
    }
}

checkLogin();

/* ================= SOCKET CONNECT ================= */
socket.on("connect", () => {
    console.log("CONNECTED:", socket.id);

    if (myAvatarData) {
        userAvatars[socket.id] = myAvatarData;

        socket.emit("avatar-updated", {
            avatarData: myAvatarData
        });
    }

    if (activeServer) {
        socket.emit("watch-server", {
            serverId: activeServer._id
        });

        startChannelUserRefresh();

        if (hasJoinedVoice) {
            showSelfInActiveChannel();
        }
    }
});

/* ================= SERVER API ================= */
async function loadServers() {
    const res = await fetch("/api/servers");
    const data = await res.json();

    if (!data.success) {
        alert(data.message || "Could not load servers");
        return;
    }

    servers = data.servers || [];

    renderServerList();

    showHomeView(false);
}

async function createServer() {
    const name = await askInput("Create Server", "Enter server name");

    if (!name) {
        return;
    }

    const res = await fetch("/api/servers", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: name
        })
    });

    const data = await res.json();

    if (!data.success) {
        alert(data.message || "Could not create server");
        return;
    }

    await loadServers();

    status.innerText = "Server created. Click it from the left side to open.";
}

async function joinServer() {
    const inviteCode = await askInput("Join Server", "Enter invite code");

    if (!inviteCode) {
        return;
    }

    const res = await fetch("/api/servers/join", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            inviteCode: inviteCode
        })
    });

    const data = await res.json();

    if (!data.success) {
        alert(data.message || "Could not join server");
        return;
    }

    await loadServers();

    status.innerText = "Server joined. Click it from the left side to open.";
}

async function createVoiceChannel() {
    if (!activeServer) {
        alert("Select a server first");
        return;
    }

    const name = await askInput("Create Voice Channel", "Enter voice channel name");

    if (!name) {
        return;
    }

    const res = await fetch(`/api/servers/${activeServer._id}/channels`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: name,
            type: "voice"
        })
    });

    const data = await res.json();

    if (!data.success) {
        alert(data.message || "Could not create voice channel");
        return;
    }

    activeServer = data.server;

    servers = servers.map(server => {
        if (server._id === activeServer._id) {
            return activeServer;
        }

        return server;
    });

    renderChannels();

    socket.emit("watch-server", {
        serverId: activeServer._id
    });

    refreshServerChannelUsers();
}

/* ================= HOME VIEW / SERVER UI ================= */
function showHomeView(leaveVoice) {
    if (leaveVoice) {
        leaveCurrentVoice(false);
    }

    socket.emit("unwatch-server");

    stopChannelUserRefresh();

    activeServer = null;
    activeVoiceChannel = null;
    currentVoiceUsers = [];
    serverChannelUsers = {};

    activeServerName.innerText = "Choose Server";
    inviteCodeText.innerText = "---";

    textChannelList.innerHTML = "";
    voiceChannelList.innerHTML = "";
    userList.innerHTML = "";

    mainTitle.innerText = "NoxVoice";
    mainSubtitle.innerText = "Choose a server from the left side, create a server, or join using invite code.";

    serverInfoTitle.innerText = "No server selected";
    serverInfoText.innerText = "Click a server icon from the left side to open it.";

    if (hasJoinedVoice && connectedVoiceServer && connectedVoiceChannel) {
        voiceStatusTitle.innerText = "Voice Connected";
        voiceStatusText.innerText = connectedVoiceChannel.name + " / " + connectedVoiceServer.name;
    } else {
        voiceStatusTitle.innerText = "Voice Disconnected";
        voiceStatusText.innerText = "Not connected to any channel";
    }

    status.innerText = "Choose a server";

    renderServerList();
}

function renderServerList() {
    serverList.innerHTML = "";

    if (homeServerBtn) {
        homeServerBtn.classList.toggle("active", !activeServer);
    }

    servers.forEach((server) => {
        const div = document.createElement("div");

        div.className = "server-icon";

        if (activeServer && activeServer._id === server._id) {
            div.classList.add("active");
        }

        div.title = server.name;
        div.textContent = server.name.charAt(0).toUpperCase();

        div.onclick = () => {
            selectServer(server._id);
        };

        serverList.appendChild(div);
    });
}

function selectServer(serverId) {
    const found = servers.find(s => s._id === serverId);

    if (!found) {
        return;
    }

    // IMPORTANT:
    // Do NOT call leaveCurrentVoice() here.
    // Clicking another server should only change the view, not disconnect voice.

    activeServer = found;
    activeVoiceChannel = null;
    currentVoiceUsers = [];
    serverChannelUsers = {};

    activeServerName.innerText = activeServer.name;
    inviteCodeText.innerText = activeServer.inviteCode;

    mainTitle.innerText = activeServer.name;
    mainSubtitle.innerText = "See who is inside each channel, then click a voice channel to join.";

    serverInfoTitle.innerText = activeServer.name;
    serverInfoText.innerText = "Invite code: " + activeServer.inviteCode;

    renderServerList();
    renderChannels();
    renderCurrentUsers();

    if (hasJoinedVoice && connectedVoiceServer && connectedVoiceChannel) {
        voiceStatusTitle.innerText = "Voice Connected";
        voiceStatusText.innerText = connectedVoiceChannel.name + " / " + connectedVoiceServer.name;
    } else {
        voiceStatusTitle.innerText = "Voice Disconnected";
        voiceStatusText.innerText = "Not connected to any channel";
    }

    status.innerText = "Server opened: " + activeServer.name;

    socket.emit("watch-server", {
        serverId: activeServer._id
    });

    startChannelUserRefresh();
}

function renderLiveBadge(user) {
    if (!(streamingUsers[user.id] || user.isStreaming)) {
        return null;
    }

    const liveBadge = document.createElement("span");
    liveBadge.className = "live-badge";
    liveBadge.innerText = "LIVE";

    return liveBadge;
}

function renderMutedIcon(user) {
    if (!(mutedUsers[user.id] || user.isMuted)) {
        return null;
    }

    const icon = document.createElement("span");
    icon.className = "muted-mic-icon";
    icon.title = "Muted";

    return icon;
}

function getUsersForChannel(channelId) {
    if (serverChannelUsers[channelId]) {
        return serverChannelUsers[channelId];
    }

    return [];
}

function makeSelfVoiceUser() {
    return {
        id: socket.id,
        username: loggedInUsername || username.value || "You",
        serverId: activeServer ? activeServer._id : "",
        channelId: activeVoiceChannel ? activeVoiceChannel.id : "",
        avatarData: myAvatarData || "",
        isStreaming: isStreaming,
        isMuted: muted,
        isSpeaking: speakingUsers[socket.id] || false
    };
}

function showSelfInActiveChannel() {
    if (!activeServer || !activeVoiceChannel || !socket.id) {
        return;
    }

    const selfUser = makeSelfVoiceUser();

    if (!serverChannelUsers[activeVoiceChannel.id]) {
        serverChannelUsers[activeVoiceChannel.id] = [];
    }

    serverChannelUsers[activeVoiceChannel.id] =
        serverChannelUsers[activeVoiceChannel.id].filter((user) => {
            return user.id !== socket.id && user.username !== selfUser.username;
        });

    serverChannelUsers[activeVoiceChannel.id].unshift(selfUser);

    currentVoiceUsers = serverChannelUsers[activeVoiceChannel.id];

    streamingUsers[socket.id] = isStreaming;
    mutedUsers[socket.id] = muted;
    speakingUsers[socket.id] = speakingUsers[socket.id] || false;
    userAvatars[socket.id] = myAvatarData || "";

    renderChannels();
    renderCurrentUsers();
}

function renderUserRowForChannel(user, channelId) {
    const userDiv = document.createElement("div");
    userDiv.className = "voice-user-row";

    if (speakingUsers[user.id] || user.isSpeaking) {
        userDiv.classList.add("speaking-user");
    }

    const avatar = createAvatarElement(user);
    userDiv.appendChild(avatar);

    const nameSpan = document.createElement("span");
    nameSpan.textContent =
        user.username + (user.id === socket.id ? " (You)" : "");

    userDiv.appendChild(nameSpan);

    const liveBadge = renderLiveBadge(user);

    if (liveBadge) {
        userDiv.appendChild(liveBadge);
    }

    const muteIcon = renderMutedIcon(user);

    if (muteIcon) {
        userDiv.appendChild(muteIcon);
    }

    if (user.id !== socket.id) {
        userDiv.title = "Right click for volume. Join same channel to watch stream.";

        userDiv.onclick = (event) => {
            if (streamingUsers[user.id] || user.isStreaming) {
                showUserVolumeMenu(event, user);
            }
        };

        userDiv.oncontextmenu = (event) => {
            showUserVolumeMenu(event, user);
        };
    }

    return userDiv;
}

function renderChannels() {
    textChannelList.innerHTML = "";
    voiceChannelList.innerHTML = "";

    if (!activeServer) {
        return;
    }

    const textChannels = activeServer.channels.filter(ch => ch.type === "text");
    const voiceChannels = activeServer.channels.filter(ch => ch.type === "voice");

    textChannels.forEach((channel) => {
        const div = document.createElement("div");

        div.className = "text-channel";
        div.textContent = "# " + channel.name;

        textChannelList.appendChild(div);
    });

    voiceChannels.forEach((channel) => {
        const wrapper = document.createElement("div");

        const div = document.createElement("div");
        div.className = "voice-channel";

        if (activeVoiceChannel && activeVoiceChannel.id === channel.id) {
            div.classList.add("active-voice");
        }

        const channelUsers = getUsersForChannel(channel.id);
        const countText = channelUsers.length > 0 ? channelUsers.length : "";

        div.innerHTML = `
            <span>🔊 ${channel.name}</span>
            <span class="channel-user-count">${countText}</span>
        `;

        div.onclick = async () => {
            await selectVoiceChannel(channel);
        };

        wrapper.appendChild(div);

        const usersBox = document.createElement("div");
        usersBox.className = "voice-users";

        if (channelUsers.length > 0) {
            channelUsers.forEach((user) => {
                usersBox.appendChild(renderUserRowForChannel(user, channel.id));
            });
        } else {
            const emptyDiv = document.createElement("div");
            emptyDiv.className = "voice-user-row empty-channel-row";
            emptyDiv.textContent = "No users";
            usersBox.appendChild(emptyDiv);
        }

        wrapper.appendChild(usersBox);

        voiceChannelList.appendChild(wrapper);
    });
}

/* ================= AUTO JOIN VOICE CHANNEL ================= */
async function selectVoiceChannel(channel) {
    unlockSound();

    activeVoiceChannel = channel;

    renderChannels();

    mainSubtitle.innerText = "Joining voice channel: " + channel.name;
    status.innerText = "Joining: " + channel.name;

    const micOk = await enableMicIfNeeded();

    if (!micOk) {
        status.innerText = "Mic permission is needed to join voice";
        return;
    }

    joinSelectedVoiceChannel();
}

/* ================= MIC ================= */
async function enableMicIfNeeded() {
    if (micReady && localStream) {
        return true;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });

        micReady = true;

        status.innerText = "Mic ON 🎤";

        Object.values(peers).forEach((peer) => {
            addMicTracksToPeer(peer);
        });

        startSpeakingDetection();

        return true;

    } catch (err) {
        console.error("MIC ERROR:", err);
        alert("Microphone permission denied");
        return false;
    }
}

voiceBtn.onclick = async () => {
    await enableMicIfNeeded();
};

/* ================= JOIN VOICE CHANNEL ================= */
joinBtn.onclick = () => {
    joinSelectedVoiceChannel();
};

function joinSelectedVoiceChannel() {
    if (!activeServer) {
        alert("Select a server first");
        return;
    }

    if (!activeVoiceChannel) {
        alert("Select a voice channel first");
        return;
    }

    if (!micReady) {
        alert("Enable mic first");
        return;
    }

    resetRemoteMediaAndPeers();

    hasJoinedVoice = true;
    connectedVoiceServer = activeServer;
    connectedVoiceChannel = activeVoiceChannel;

    showSelfInActiveChannel();

    socket.emit("join-voice-channel", {
        serverId: activeServer._id,
        channelId: activeVoiceChannel.id
    });

    if (isStreaming) {
        setTimeout(() => {
            socket.emit("stream-status", {
                isStreaming: true
            });
        }, 300);
    }

    setTimeout(() => {
        socket.emit("mute-status", {
            isMuted: muted
        });
    }, 300);

    setTimeout(() => {
        refreshServerChannelUsers();
    }, 500);

    startSpeakingDetection();

    playUserJoinSound();

    status.innerText = "Joined voice: " + activeVoiceChannel.name;

    voiceStatusTitle.innerText = "Voice Connected";
    voiceStatusText.innerText = activeVoiceChannel.name + " / " + activeServer.name;
}

/* ================= LEAVE VOICE ================= */
leaveVoiceBtn.onclick = () => {
    playUserLeaveSound();
    leaveCurrentVoice(true);
};

function leaveCurrentVoice(updateUi) {
    socket.emit("speaking-status", {
        isSpeaking: false
    });

    setSpeakingState(false);

    socket.emit("leave-voice-channel");

    setTimeout(() => {
        refreshServerChannelUsers();
    }, 500);

    resetRemoteMediaAndPeers();

    currentVoiceUsers = [];
    hasJoinedVoice = false;
    connectedVoiceServer = null;
    connectedVoiceChannel = null;
    connectedVoiceServer = null;
    connectedVoiceChannel = null;

    if (updateUi) {
        status.innerText = "Left voice channel";

        voiceStatusTitle.innerText = "Voice Disconnected";
        voiceStatusText.innerText = "Not connected to any channel";

        renderChannels();
        renderCurrentUsers();
    }
}

/* ================= SELF MUTE ================= */
function toggleSelfMute() {
    if (!localStream) {
        alert("Enable mic first");
        return;
    }

    muted = !muted;

    localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
    });

    mutedUsers[socket.id] = muted;

    if (muted) {
        setSpeakingState(false);
    }

    socket.emit("mute-status", {
        isMuted: muted
    });

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === socket.id) {
            return {
                ...user,
                isMuted: muted,
                isSpeaking: muted ? false : user.isSpeaking
            };
        }

        return user;
    });

    showSelfInActiveChannel();

    if (muted) {
        status.innerText = "You are muted 🔇";
        muteBtn.innerText = "🔊 Unmute";
    } else {
        status.innerText = "Mic ON 🎤";
        muteBtn.innerText = "🔇 Mute";
    }
}

muteBtn.onclick = () => {
    toggleSelfMute();
};

/* ================= LOGOUT ================= */
logoutBtn.onclick = async () => {
    stopChannelUserRefresh();
    stopSpeakingDetection();

    await fetch("/api/logout", {
        method: "POST"
    });

    window.location.href = "/login.html";
};

/* ================= TRACK HELPERS ================= */
function addMicTracksToPeer(peer) {
    if (!localStream) {
        return;
    }

    localStream.getAudioTracks().forEach((track) => {
        const alreadyAdded = peer.getSenders().some(
            sender => sender.track === track
        );

        if (!alreadyAdded) {
            peer.addTrack(track, localStream);
        }
    });
}

function addScreenTracksToPeer(peer) {
    if (!screenStream) {
        return;
    }

    screenStream.getTracks().forEach((track) => {
        const alreadyAdded = peer.getSenders().some(
            sender => sender.track === track
        );

        if (!alreadyAdded) {
            peer.addTrack(track, screenStream);
        }
    });
}

function removeScreenTracksFromPeer(peer) {
    const senders = peer.getSenders();

    senders.forEach((sender) => {
        if (sender.track && sender.track.kind === "video") {
            peer.removeTrack(sender);
        }

        if (sender.track && sender.track.kind === "audio" && screenStream) {
            const isScreenAudio = screenStream.getAudioTracks().includes(sender.track);

            if (isScreenAudio) {
                peer.removeTrack(sender);
            }
        }
    });
}

async function renegotiatePeer(targetId) {
    const peer = peers[targetId];

    if (!peer) {
        return;
    }

    try {
        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("offer", {
            target: targetId,
            offer: offer
        });

    } catch (err) {
        console.error("RENEGOTIATION ERROR:", err);
    }
}

/* ================= STREAM GRID ================= */
function getStreamsGrid() {
    let grid = document.getElementById("streamsGrid");

    if (!grid) {
        grid = document.createElement("div");
        grid.id = "streamsGrid";

        const content = document.querySelector(".content-area") || document.body;
        content.appendChild(grid);
    }

    return grid;
}

function showLocalScreenPreview(stream) {
    const grid = getStreamsGrid();

    let card = document.getElementById("stream-card-local");

    if (!card) {
        card = document.createElement("div");
        card.id = "stream-card-local";
        card.className = "stream-card";

        const title = document.createElement("div");
        title.className = "stream-card-title";
        title.innerText = "Your screen stream";

        const video = document.createElement("video");
        video.id = "video-local";
        video.autoplay = true;
        video.muted = true;
        video.controls = true;
        video.playsInline = true;

        card.appendChild(title);
        card.appendChild(video);
        grid.appendChild(card);
    }

    const video = document.getElementById("video-local");

    video.srcObject = stream;

    video.play().catch(() => {
        console.log("Local preview play blocked");
    });
}

function removeLocalScreenPreview() {
    const card = document.getElementById("stream-card-local");

    if (card) {
        card.remove();
    }
}

/* ================= SCREEN STREAM ================= */
streamBtn.onclick = async () => {
    if (!isStreaming) {
        await startScreenStream();
    } else {
        await stopScreenStream();
    }
};

async function startScreenStream() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        screenTrack = screenStream.getVideoTracks()[0];

        if (!screenTrack) {
            alert("No screen video track found");
            return;
        }

        isStreaming = true;

        streamingUsers[socket.id] = true;

        socket.emit("stream-status", {
            isStreaming: true
        });

        streamBtn.innerText = "🛑 Stop Stream";

        status.innerText = "Screen streaming with audio 🖥️🔊";

        showLocalScreenPreview(screenStream);

        showSelfInActiveChannel();

        Object.keys(peers).forEach(async (id) => {
            const peer = peers[id];

            addScreenTracksToPeer(peer);

            await renegotiatePeer(id);
        });

        screenTrack.onended = async () => {
            await stopScreenStream();
        };

    } catch (err) {
        console.error("SCREEN STREAM ERROR:", err);
        alert("Screen stream cancelled or blocked");
    }
}

async function stopScreenStream() {
    if (!isStreaming) {
        return;
    }

    isStreaming = false;

    streamingUsers[socket.id] = false;

    socket.emit("stream-status", {
        isStreaming: false
    });

    showSelfInActiveChannel();

    Object.keys(peers).forEach(async (id) => {
        const peer = peers[id];

        removeScreenTracksFromPeer(peer);

        await renegotiatePeer(id);
    });

    if (screenStream) {
        screenStream.getTracks().forEach(track => {
            track.stop();
        });
    }

    screenStream = null;
    screenTrack = null;

    removeLocalScreenPreview();

    streamBtn.innerText = "🖥️ Start Stream";

    status.innerText = "Screen stream stopped";
}

/* ================= PEER ================= */
function createPeer(id) {
    if (peers[id]) {
        return peers[id];
    }

    const peer = new RTCPeerConnection(config);

    peers[id] = peer;

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice", {
                target: id,
                candidate: event.candidate
            });
        }
    };

    peer.oniceconnectionstatechange = () => {
        console.log("ICE STATE [" + id + "]:", peer.iceConnectionState);
    };

    peer.ontrack = (event) => {
        console.log("TRACK RECEIVED FROM:", id, event.track.kind);

        if (event.track.kind === "audio") {
            handleRemoteAudio(id, event);
        }

        if (event.track.kind === "video") {
            handleRemoteVideo(id, event);
        }
    };

    addMicTracksToPeer(peer);

    if (isStreaming && screenStream) {
        addScreenTracksToPeer(peer);
    }

    return peer;
}

/* ================= REMOTE AUDIO ================= */
function handleRemoteAudio(id, event) {
    const hasVideoInSameStream =
        event.streams &&
        event.streams[0] &&
        event.streams[0].getVideoTracks().length > 0;

    if (hasVideoInSameStream) {
        remoteStreamAudioTracks[id] = event.track;

        const user = currentVoiceUsers.find(u => u.id === id);

        if (watchingStreams[id] && user) {
            showRemoteStream(id, user.username);
        }

        event.track.onended = () => {
            delete remoteStreamAudioTracks[id];
        };

        return;
    }

    const audioId = "audio-" + id + "-" + event.track.id;

    let audio = document.getElementById(audioId);

    if (!audio) {
        audio = document.createElement("audio");

        audio.id = audioId;
        audio.className = "remote-audio remote-audio-" + id;
        audio.autoplay = true;
        audio.controls = true;
        audio.playsInline = true;
        audio.volume = userVolumes[id] ?? 1;
        audio.muted = userMuted[id] ?? false;

        document.body.appendChild(audio);
    }

    const audioOnlyStream = new MediaStream([event.track]);

    audio.srcObject = audioOnlyStream;

    applyUserAudioSettings(id);

    audio.play().catch(() => {
        document.body.addEventListener(
            "click",
            () => {
                audio.play();
            },
            { once: true }
        );
    });

    event.track.onended = () => {
        const oldAudio = document.getElementById(audioId);

        if (oldAudio) {
            oldAudio.remove();
        }
    };
}

function applyUserAudioSettings(id) {
    const audios = document.querySelectorAll(".remote-audio-" + id);

    audios.forEach((audio) => {
        audio.volume = userVolumes[id] ?? 1;
        audio.muted = userMuted[id] ?? false;
    });
}

/* ================= REMOTE VIDEO ================= */
function handleRemoteVideo(id, event) {
    remoteVideoTracks[id] = event.track;

    const user = currentVoiceUsers.find(u => u.id === id);

    if (watchingStreams[id] && user) {
        showRemoteStream(id, user.username);
    }

    event.track.onended = () => {
        delete remoteVideoTracks[id];
        delete remoteStreamAudioTracks[id];

        const card = document.getElementById("stream-card-" + id);

        if (card) {
            card.remove();
        }

        watchingStreams[id] = false;
    };
}

/* ================= SOCKET VOICE EVENTS ================= */
socket.on("user-joined", async (user) => {
    if (user.id === socket.id) {
        return;
    }

    playUserJoinSound();

    if (!micReady) {
        return;
    }

    const peer = createPeer(user.id);

    try {
        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("offer", {
            target: user.id,
            offer: offer
        });

    } catch (err) {
        console.error("OFFER ERROR:", err);
    }
});

socket.on("user-left", ({ id }) => {
    if (id !== socket.id) {
        playUserLeaveSound();
    }

    delete streamingUsers[id];
    delete mutedUsers[id];
    delete speakingUsers[id];
    delete userAvatars[id];

    removePeerAndMedia(id);

    refreshServerChannelUsers();
});

socket.on("voice-joined-confirmed", ({ serverId, channelId, users }) => {
    if (!activeServer || activeServer._id !== serverId) {
        return;
    }

    currentVoiceUsers = users || [];

    serverChannelUsers[channelId] = currentVoiceUsers;

    currentVoiceUsers.forEach(user => {
        streamingUsers[user.id] = !!user.isStreaming;
        mutedUsers[user.id] = !!user.isMuted;
        speakingUsers[user.id] = !!user.isSpeaking;
        userAvatars[user.id] = user.avatarData || "";

        if (allUsersMuted && user.id !== socket.id) {
            userMuted[user.id] = true;
            applyUserAudioSettings(user.id);
        }
    });

    if (hasJoinedVoice && activeVoiceChannel && activeVoiceChannel.id === channelId) {
        const selfExists = currentVoiceUsers.some((user) => {
            return user.id === socket.id;
        });

        if (!selfExists) {
            showSelfInActiveChannel();
            return;
        }
    }

    renderChannels();
    renderCurrentUsers();

    if (activeVoiceChannel) {
        status.innerText = "Joined voice: " + activeVoiceChannel.name;

        voiceStatusTitle.innerText = "Voice Connected";
        voiceStatusText.innerText = activeVoiceChannel.name + " / " + activeServer.name;
    }

    refreshServerChannelUsers();
});

socket.on("server-channel-users", ({ serverId, channels }) => {
    if (!activeServer || activeServer._id !== serverId) {
        return;
    }

    serverChannelUsers = channels || {};

    Object.values(serverChannelUsers).forEach((users) => {
        users.forEach((user) => {
            streamingUsers[user.id] = !!user.isStreaming;
            mutedUsers[user.id] = !!user.isMuted;
            speakingUsers[user.id] = !!user.isSpeaking;
            userAvatars[user.id] = user.avatarData || "";

            if (allUsersMuted && user.id !== socket.id) {
                userMuted[user.id] = true;
                applyUserAudioSettings(user.id);
            }
        });
    });

    if (activeVoiceChannel) {
        currentVoiceUsers = serverChannelUsers[activeVoiceChannel.id] || [];

        if (hasJoinedVoice && socket.id) {
            const selfExists = currentVoiceUsers.some((user) => {
                return user.id === socket.id;
            });

            if (!selfExists) {
                showSelfInActiveChannel();
                return;
            }
        }
    }

    renderChannels();
    renderCurrentUsers();
});

socket.on("user-profile-updated", ({ id, avatarData }) => {
    userAvatars[id] = avatarData || "";

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === id) {
            return {
                ...user,
                avatarData: avatarData || ""
            };
        }

        return user;
    });

    Object.keys(serverChannelUsers).forEach((channelId) => {
        serverChannelUsers[channelId] = serverChannelUsers[channelId].map(user => {
            if (user.id === id) {
                return {
                    ...user,
                    avatarData: avatarData || ""
                };
            }

            return user;
        });
    });

    if (id === socket.id) {
        showSelfInActiveChannel();
        return;
    }

    renderChannels();
    renderCurrentUsers();
});

socket.on("user-speaking-status", ({ id, isSpeaking }) => {
    speakingUsers[id] = !!isSpeaking;

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === id) {
            return {
                ...user,
                isSpeaking: !!isSpeaking
            };
        }

        return user;
    });

    Object.keys(serverChannelUsers).forEach((channelId) => {
        serverChannelUsers[channelId] = serverChannelUsers[channelId].map(user => {
            if (user.id === id) {
                return {
                    ...user,
                    isSpeaking: !!isSpeaking
                };
            }

            return user;
        });
    });

    renderChannels();
    renderCurrentUsers();
});

socket.on("user-stream-status", ({ id, isStreaming }) => {
    streamingUsers[id] = !!isStreaming;

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === id) {
            return {
                ...user,
                isStreaming: !!isStreaming
            };
        }

        return user;
    });

    Object.keys(serverChannelUsers).forEach((channelId) => {
        serverChannelUsers[channelId] = serverChannelUsers[channelId].map(user => {
            if (user.id === id) {
                return {
                    ...user,
                    isStreaming: !!isStreaming
                };
            }

            return user;
        });
    });

    if (!isStreaming) {
        closeWatchedStream(id);
        delete remoteVideoTracks[id];
        delete remoteStreamAudioTracks[id];
    }

    renderChannels();
    renderCurrentUsers();
});

socket.on("user-mute-status", ({ id, isMuted }) => {
    mutedUsers[id] = !!isMuted;

    if (isMuted) {
        speakingUsers[id] = false;
    }

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === id) {
            return {
                ...user,
                isMuted: !!isMuted,
                isSpeaking: isMuted ? false : user.isSpeaking
            };
        }

        return user;
    });

    Object.keys(serverChannelUsers).forEach((channelId) => {
        serverChannelUsers[channelId] = serverChannelUsers[channelId].map(user => {
            if (user.id === id) {
                return {
                    ...user,
                    isMuted: !!isMuted,
                    isSpeaking: isMuted ? false : user.isSpeaking
                };
            }

            return user;
        });
    });

    renderChannels();
    renderCurrentUsers();
});

socket.on("watch-server-error", (data) => {
    console.error("WATCH SERVER ERROR:", data.message);
});

socket.on("offer", async ({ sender, offer }) => {
    const peer = createPeer(sender);

    try {
        await peer.setRemoteDescription(offer);

        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        socket.emit("answer", {
            target: sender,
            answer: answer
        });

    } catch (err) {
        console.error("OFFER HANDLE ERROR:", err);
    }
});

socket.on("answer", async ({ sender, answer }) => {
    const peer = peers[sender];

    if (!peer) {
        return;
    }

    try {
        await peer.setRemoteDescription(answer);

    } catch (err) {
        console.error("ANSWER ERROR:", err);
    }
});

socket.on("ice", async ({ sender, candidate }) => {
    const peer = peers[sender];

    if (!peer) {
        return;
    }

    try {
        await peer.addIceCandidate(candidate);

    } catch (err) {
        console.error("ICE ERROR:", err);
    }
});

socket.on("voice-user-list", (users) => {
    currentVoiceUsers = users || [];

    currentVoiceUsers.forEach(user => {
        streamingUsers[user.id] = !!user.isStreaming;
        mutedUsers[user.id] = !!user.isMuted;
        speakingUsers[user.id] = !!user.isSpeaking;
        userAvatars[user.id] = user.avatarData || "";

        if (allUsersMuted && user.id !== socket.id) {
            userMuted[user.id] = true;
            applyUserAudioSettings(user.id);
        }
    });

    if (activeVoiceChannel) {
        serverChannelUsers[activeVoiceChannel.id] = currentVoiceUsers;

        if (hasJoinedVoice && socket.id) {
            const selfExists = currentVoiceUsers.some((user) => {
                return user.id === socket.id;
            });

            if (!selfExists) {
                showSelfInActiveChannel();
                return;
            }
        }
    }

    renderChannels();
    renderCurrentUsers();
});

socket.on("user-list", (users) => {
    currentVoiceUsers = users || [];

    currentVoiceUsers.forEach(user => {
        streamingUsers[user.id] = !!user.isStreaming;
        mutedUsers[user.id] = !!user.isMuted;
        speakingUsers[user.id] = !!user.isSpeaking;
        userAvatars[user.id] = user.avatarData || "";

        if (allUsersMuted && user.id !== socket.id) {
            userMuted[user.id] = true;
            applyUserAudioSettings(user.id);
        }
    });

    if (activeVoiceChannel) {
        serverChannelUsers[activeVoiceChannel.id] = currentVoiceUsers;

        if (hasJoinedVoice && socket.id) {
            const selfExists = currentVoiceUsers.some((user) => {
                return user.id === socket.id;
            });

            if (!selfExists) {
                showSelfInActiveChannel();
                return;
            }
        }
    }

    renderChannels();
    renderCurrentUsers();
});

socket.on("join-error", (data) => {
    alert(data.message || "Could not join voice channel");
});

/* ================= USER LIST ================= */
function renderCurrentUsers() {
    userList.innerHTML = "";

    currentVoiceUsers.forEach((u) => {
        const li = document.createElement("li");
        li.className = "user-item";

        if (speakingUsers[u.id] || u.isSpeaking) {
            li.classList.add("speaking-user");
        }

        if (u.id !== socket.id) {
            li.title = "Click LIVE user to watch stream, or right click for volume";

            li.onclick = (event) => {
                if (streamingUsers[u.id] || u.isStreaming) {
                    showUserVolumeMenu(event, u);
                }
            };

            li.oncontextmenu = (event) => {
                showUserVolumeMenu(event, u);
            };
        }

        const name = document.createElement("span");
        name.className = "user-name";

        const avatar = createAvatarElement(u);
        name.appendChild(avatar);

        const nameText = document.createElement("span");
        nameText.textContent = u.username + (u.id === socket.id ? " (You)" : "");

        name.appendChild(nameText);

        const liveBadge = renderLiveBadge(u);

        if (liveBadge) {
            name.appendChild(liveBadge);
        }

        const muteIcon = renderMutedIcon(u);

        if (muteIcon) {
            name.appendChild(muteIcon);
        }

        li.appendChild(name);
        userList.appendChild(li);
    });
}

/* ================= CLEANUP ================= */
function removePeerAndMedia(id) {
    if (peers[id]) {
        peers[id].close();
        delete peers[id];
    }

    document.querySelectorAll(".remote-audio-" + id).forEach(el => el.remove());

    const videoCard = document.getElementById("stream-card-" + id);

    if (videoCard) {
        videoCard.remove();
    }

    delete remoteVideoTracks[id];
    delete remoteStreamAudioTracks[id];
    delete watchingStreams[id];
    delete streamingUsers[id];
    delete mutedUsers[id];
    delete speakingUsers[id];
    delete userAvatars[id];
}

function resetRemoteMediaAndPeers() {
    Object.keys(peers).forEach((id) => {
        removePeerAndMedia(id);
    });
}

/* ================= BUTTONS ================= */
createServerBtn.onclick = createServer;
joinServerBtn.onclick = joinServer;
createVoiceChannelBtn.onclick = createVoiceChannel;

if (homeServerBtn) {
    homeServerBtn.onclick = () => {
        // Home only changes the view. It should not disconnect voice.
        showHomeView(false);
    };
}
