console.log("NOXVOICE APP LOADED - MANUAL SERVER SELECT + LIVE WATCH + MUTED ICON");

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

const peers = {};
const userVolumes = {};
const userMuted = {};
const streamingUsers = {};
const mutedUsers = {};

const remoteVideoTracks = {};
const remoteStreamAudioTracks = {};
const watchingStreams = {};

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

    if (streamingUsers[user.id] || user.isStreaming) {
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
    const menuHeight = 230;

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

    // IMPORTANT:
    // No automatic server selection after login.
    // User must click the server manually.
    showHomeView(false);
}

async function createServer() {
    const name = prompt("Enter server name:");

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

    // After creating, user can still choose freely.
    // We do not auto-open the server.
    status.innerText = "Server created. Click it from the left side to open.";
}

async function joinServer() {
    const inviteCode = prompt("Enter invite code:");

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

    // After joining by invite, user can still choose freely.
    // We do not auto-open the server.
    status.innerText = "Server joined. Click it from the left side to open.";
}

async function createVoiceChannel() {
    if (!activeServer) {
        alert("Select a server first");
        return;
    }

    const name = prompt("Enter voice channel name:");

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
}

/* ================= HOME VIEW / SERVER UI ================= */
function showHomeView(leaveVoice) {
    if (leaveVoice) {
        leaveCurrentVoice(false);
    }

    activeServer = null;
    activeVoiceChannel = null;
    currentVoiceUsers = [];

    activeServerName.innerText = "Choose Server";
    inviteCodeText.innerText = "---";

    textChannelList.innerHTML = "";
    voiceChannelList.innerHTML = "";
    userList.innerHTML = "";

    mainTitle.innerText = "NoxVoice";
    mainSubtitle.innerText = "Choose a server from the left side, create a server, or join using invite code.";

    serverInfoTitle.innerText = "No server selected";
    serverInfoText.innerText = "Click a server icon from the left side to open it.";

    voiceStatusTitle.innerText = "Voice Disconnected";
    voiceStatusText.innerText = "Not connected to any channel";

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

    leaveCurrentVoice(false);

    activeServer = found;
    activeVoiceChannel = null;
    currentVoiceUsers = [];

    activeServerName.innerText = activeServer.name;
    inviteCodeText.innerText = activeServer.inviteCode;

    mainTitle.innerText = activeServer.name;
    mainSubtitle.innerText = "Click a voice channel to join automatically.";

    serverInfoTitle.innerText = activeServer.name;
    serverInfoText.innerText = "Invite code: " + activeServer.inviteCode;

    renderServerList();
    renderChannels();
    renderCurrentUsers();

    voiceStatusTitle.innerText = "Voice Disconnected";
    voiceStatusText.innerText = "Not connected to any channel";

    status.innerText = "Server opened: " + activeServer.name;
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

        div.innerHTML = `
            <span>🔊 ${channel.name}</span>
        `;

        div.onclick = async () => {
            await selectVoiceChannel(channel);
        };

        wrapper.appendChild(div);

        if (activeVoiceChannel && activeVoiceChannel.id === channel.id) {
            const usersBox = document.createElement("div");
            usersBox.className = "voice-users";

            currentVoiceUsers.forEach((user) => {
                const userDiv = document.createElement("div");
                userDiv.className = "voice-user-row";

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
                    userDiv.title = "Click LIVE user to watch stream, or right click for volume";

                    userDiv.onclick = (event) => {
                        if (streamingUsers[user.id] || user.isStreaming) {
                            showUserVolumeMenu(event, user);
                        }
                    };

                    userDiv.oncontextmenu = (event) => {
                        showUserVolumeMenu(event, user);
                    };
                }

                usersBox.appendChild(userDiv);
            });

            wrapper.appendChild(usersBox);
        }

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

    currentVoiceUsers = [];
    renderCurrentUsers();

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

    playUserJoinSound();

    hasJoinedVoice = true;

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
    socket.emit("leave-voice-channel");

    resetRemoteMediaAndPeers();

    currentVoiceUsers = [];
    hasJoinedVoice = false;

    if (updateUi) {
        status.innerText = "Left voice channel";

        voiceStatusTitle.innerText = "Voice Disconnected";
        voiceStatusText.innerText = "Not connected to any channel";

        renderChannels();
        renderCurrentUsers();
    }
}

/* ================= SELF MUTE ================= */
muteBtn.onclick = () => {
    if (!localStream) {
        alert("Enable mic first");
        return;
    }

    muted = !muted;

    localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
    });

    mutedUsers[socket.id] = muted;

    socket.emit("mute-status", {
        isMuted: muted
    });

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === socket.id) {
            return {
                ...user,
                isMuted: muted
            };
        }

        return user;
    });

    renderChannels();
    renderCurrentUsers();

    if (muted) {
        status.innerText = "You are muted 🔇";
        muteBtn.innerText = "🔊 Unmute";
    } else {
        status.innerText = "Mic ON 🎤";
        muteBtn.innerText = "🔇 Mute";
    }
};

/* ================= LOGOUT ================= */
logoutBtn.onclick = async () => {
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

        renderChannels();
        renderCurrentUsers();

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

    renderChannels();
    renderCurrentUsers();

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

    removePeerAndMedia(id);
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

    currentVoiceUsers = currentVoiceUsers.map(user => {
        if (user.id === id) {
            return {
                ...user,
                isMuted: !!isMuted
            };
        }

        return user;
    });

    renderChannels();
    renderCurrentUsers();
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
    });

    renderChannels();
    renderCurrentUsers();
});

socket.on("user-list", (users) => {
    currentVoiceUsers = users || [];

    currentVoiceUsers.forEach(user => {
        streamingUsers[user.id] = !!user.isStreaming;
        mutedUsers[user.id] = !!user.isMuted;
    });

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
        showHomeView(true);
    };
}