console.log("NOXVOICE APP LOADED - VOICE + 1080P60 STREAM");

const socket = io();

/* ================= UI ELEMENTS ================= */
const username = document.getElementById("username");
const roomCode = document.getElementById("roomCode");
const joinBtn = document.getElementById("joinBtn");
const voiceBtn = document.getElementById("voiceBtn");
const muteBtn = document.getElementById("muteBtn");
const streamBtn = document.getElementById("streamBtn");
const stopStreamBtn = document.getElementById("stopStreamBtn");
const logoutBtn = document.getElementById("logoutBtn");
const status = document.getElementById("status");
const userList = document.getElementById("userList");
const accountName = document.getElementById("accountName");

const localStreamBox = document.getElementById("localStreamBox");
const localPreview = document.getElementById("localPreview");
const remoteStreams = document.getElementById("remoteStreams");

/* ================= STATE ================= */
let localStream = null;
let screenStream = null;

let micReady = false;
let muted = false;
let loggedInUsername = null;

const peers = {};
const userVolumes = {};
const userMuted = {};
const screenSenders = {};

/* ================= ICE SERVERS ================= */
const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};

/* ================= CHECK LOGIN ================= */
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
        username.readOnly = true;

        accountName.innerText = "Signed in as: " + data.username;

        console.log("LOGGED IN AS:", data.username);

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

/* ================= JOIN ERROR ================= */
socket.on("join-error", (data) => {
    alert(data.message);
    status.innerText = data.message;
});

/* ================= ENABLE MIC ================= */
voiceBtn.onclick = async () => {

    try {

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        micReady = true;

        console.log("MIC READY");

        status.innerText = "Mic ON 🎤";

    } catch (err) {

        console.error("MIC ERROR:", err);

        alert("Microphone permission denied");
    }
};

/* ================= SELF MUTE BUTTON ================= */
muteBtn.onclick = () => {

    if (!localStream) {
        alert("Enable mic first");
        return;
    }

    muted = !muted;

    localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
    });

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

/* ================= JOIN ROOM ================= */
joinBtn.onclick = () => {

    const room = roomCode.value.trim();

    if (!room) {
        alert("Enter room code");
        return;
    }

    if (!micReady) {
        alert("Enable mic first");
        return;
    }

    socket.emit("join-room", {
        room: room
    });

    status.innerText = "Joining room: " + room;
};

/* ================= CREATE PEER ================= */
function createPeer(id) {

    if (peers[id]) {
        return peers[id];
    }

    const peer = new RTCPeerConnection(config);

    peers[id] = peer;

    console.log("CREATING PEER:", id);

    peer.onicecandidate = (event) => {

        if (event.candidate) {

            socket.emit("ice", {
                target: id,
                candidate: event.candidate
            });
        }
    };

    peer.oniceconnectionstatechange = () => {
        console.log(
            "ICE STATE [" + id + "]:",
            peer.iceConnectionState
        );
    };

    peer.ontrack = (event) => {

        console.log("TRACK RECEIVED FROM:", id, event.track.kind);

        if (event.track.kind === "video") {
            createRemoteVideo(id, event.streams[0]);
            return;
        }

        if (event.track.kind === "audio") {
            createRemoteAudio(id, event.streams[0]);
        }
    };

    if (localStream) {

        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });
    }

    if (screenStream) {
        addScreenTracksToPeer(id, peer);
    }

    return peer;
}

/* ================= REMOTE AUDIO ================= */
function createRemoteAudio(id, stream) {

    let audio = document.getElementById("audio-" + id);

    if (!audio) {

        audio = document.createElement("audio");

        audio.id = "audio-" + id;
        audio.autoplay = true;
        audio.controls = true;
        audio.playsInline = true;
        audio.volume = userVolumes[id] ?? 1;
        audio.muted = userMuted[id] ?? false;

        document.body.appendChild(audio);
    }

    audio.srcObject = stream;

    audio.volume = userVolumes[id] ?? 1;
    audio.muted = userMuted[id] ?? false;

    audio.play().catch(() => {

        console.log("Audio autoplay blocked. Click the page once.");

        document.body.addEventListener(
            "click",
            () => {
                audio.play();
            },
            { once: true }
        );
    });
}

/* ================= REMOTE VIDEO ================= */
function createRemoteVideo(id, stream) {

    let box = document.getElementById("remote-stream-" + id);

    if (!box) {

        box = document.createElement("div");
        box.id = "remote-stream-" + id;
        box.className = "stream-card";

        const title = document.createElement("h3");
        title.innerText = "User Stream";

        const video = document.createElement("video");
        video.id = "video-" + id;
        video.autoplay = true;
        video.controls = true;
        video.playsInline = true;

        box.appendChild(title);
        box.appendChild(video);

        remoteStreams.appendChild(box);
    }

    const video = document.getElementById("video-" + id);

    video.srcObject = stream;

    video.play().catch(() => {

        console.log("Video autoplay blocked. Click the page once.");

        document.body.addEventListener(
            "click",
            () => {
                video.play();
            },
            { once: true }
        );
    });
}

/* ================= HIGH QUALITY VIDEO SETTINGS ================= */
function applyHighQualitySettings(sender) {

    if (!sender || !sender.track) {
        return;
    }

    if (sender.track.kind !== "video") {
        return;
    }

    const params = sender.getParameters();

    if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = 8000000;
    params.encodings[0].maxFramerate = 60;

    sender.setParameters(params).catch(err => {
        console.log("Could not set video quality:", err);
    });
}

/* ================= ADD SCREEN TRACKS ================= */
function addScreenTracksToPeer(id, peer) {

    if (!screenStream) {
        return;
    }

    if (!screenSenders[id]) {
        screenSenders[id] = [];
    }

    if (screenSenders[id].length > 0) {
        return;
    }

    screenStream.getTracks().forEach(track => {

        const sender = peer.addTrack(track, screenStream);

        screenSenders[id].push(sender);

        applyHighQualitySettings(sender);
    });
}

/* ================= RENEGOTIATE ================= */
async function renegotiatePeer(id) {

    const peer = peers[id];

    if (!peer) {
        return;
    }

    if (peer.signalingState !== "stable") {
        console.log("Peer not stable, skip renegotiate:", id);
        return;
    }

    try {

        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("offer", {
            target: id,
            offer: offer
        });

    } catch (err) {

        console.error("RENEGOTIATE ERROR:", err);
    }
}

async function renegotiateAllPeers() {

    const ids = Object.keys(peers);

    for (const id of ids) {
        await renegotiatePeer(id);
    }
}

/* ================= START STREAM 1080P 60FPS ================= */
streamBtn.onclick = async () => {

    if (screenStream) {
        alert("Stream already running");
        return;
    }

    try {

        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: {
                    ideal: 1920,
                    max: 1920
                },
                height: {
                    ideal: 1080,
                    max: 1080
                },
                frameRate: {
                    ideal: 60,
                    max: 60
                }
            },
            audio: true
        });

        screenStream.getVideoTracks().forEach(track => {
            track.contentHint = "motion";

            track.onended = () => {
                stopScreenStream();
            };
        });

        localPreview.srcObject = screenStream;
        localStreamBox.classList.remove("hidden");

        Object.keys(peers).forEach(id => {
            addScreenTracksToPeer(id, peers[id]);
        });

        await renegotiateAllPeers();

        streamBtn.innerText = "🖥️ Streaming";
        status.innerText = "Streaming 1080p 60fps target";

        console.log("SCREEN STREAM STARTED");

    } catch (err) {

        console.error("SCREEN STREAM ERROR:", err);

        alert("Screen/game stream permission denied");
    }
};

/* ================= STOP STREAM ================= */
async function stopScreenStream() {

    if (!screenStream) {
        return;
    }

    const oldStream = screenStream;

    screenStream = null;

    oldStream.getTracks().forEach(track => {
        track.onended = null;
        track.stop();
    });

    localPreview.srcObject = null;
    localStreamBox.classList.add("hidden");

    Object.keys(screenSenders).forEach(id => {

        const peer = peers[id];

        if (peer) {
            screenSenders[id].forEach(sender => {
                try {
                    peer.removeTrack(sender);
                } catch (err) {
                    console.log("Remove track error:", err);
                }
            });
        }

        screenSenders[id] = [];
    });

    await renegotiateAllPeers();

    socket.emit("stream-stopped");

    streamBtn.innerText = "🖥️ Start Stream";
    status.innerText = "Stream stopped";

    console.log("SCREEN STREAM STOPPED");
}

stopStreamBtn.onclick = () => {
    stopScreenStream();
};

/* ================= STREAM STOPPED FROM REMOTE USER ================= */
socket.on("stream-stopped", ({ sender }) => {
    removeRemoteVideo(sender);
});

/* ================= USER JOINED ================= */
socket.on("user-joined", async (user) => {

    if (!micReady) {
        return;
    }

    if (user.id === socket.id) {
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

/* ================= OFFER RECEIVED ================= */
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

/* ================= ANSWER RECEIVED ================= */
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

/* ================= ICE RECEIVED ================= */
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

/* ================= CLEANUP REMOTE USER ================= */
function removeRemoteUser(id) {

    if (peers[id]) {
        peers[id].close();
        delete peers[id];
    }

    const audio = document.getElementById("audio-" + id);

    if (audio) {
        audio.remove();
    }

    removeRemoteVideo(id);

    delete userVolumes[id];
    delete userMuted[id];
    delete screenSenders[id];
}

function removeRemoteVideo(id) {

    const videoBox = document.getElementById("remote-stream-" + id);

    if (videoBox) {
        videoBox.remove();
    }
}

/* ================= USER LIST WITH MUTE + VOLUME ================= */
socket.on("user-list", (users) => {

    userList.innerHTML = "";

    const activeIds = users.map(user => user.id);

    Object.keys(peers).forEach(id => {
        if (!activeIds.includes(id)) {
            removeRemoteUser(id);
        }
    });

    users.forEach((u) => {

        const li = document.createElement("li");
        li.className = "user-item";

        const name = document.createElement("span");
        name.className = "user-name";

        if (u.id === socket.id) {
            name.textContent = u.username + " (You)";
        } else {
            name.textContent = u.username;
        }

        const controls = document.createElement("div");
        controls.className = "user-controls";

        const userMuteBtn = document.createElement("button");
        userMuteBtn.className = "user-mute-btn";
        userMuteBtn.textContent = "🔇";
        userMuteBtn.title = "Mute this user";

        const volumeSlider = document.createElement("input");
        volumeSlider.className = "user-volume-slider";
        volumeSlider.type = "range";
        volumeSlider.min = "0";
        volumeSlider.max = "1";
        volumeSlider.step = "0.01";
        volumeSlider.value = userVolumes[u.id] ?? 1;
        volumeSlider.title = "User volume";

        if (u.id === socket.id) {

            userMuteBtn.disabled = true;
            volumeSlider.disabled = true;

        } else {

            if (userMuted[u.id]) {
                userMuteBtn.textContent = "🔊";
                userMuteBtn.classList.add("user-muted");
            }

            userMuteBtn.onclick = () => {

                const audio = document.getElementById("audio-" + u.id);

                userMuted[u.id] = !userMuted[u.id];

                if (audio) {
                    audio.muted = userMuted[u.id];
                }

                if (userMuted[u.id]) {
                    userMuteBtn.textContent = "🔊";
                    userMuteBtn.title = "Unmute this user";
                    userMuteBtn.classList.add("user-muted");
                } else {
                    userMuteBtn.textContent = "🔇";
                    userMuteBtn.title = "Mute this user";
                    userMuteBtn.classList.remove("user-muted");
                }
            };

            volumeSlider.oninput = () => {

                const audio = document.getElementById("audio-" + u.id);

                userVolumes[u.id] = Number(volumeSlider.value);

                if (audio) {
                    audio.volume = userVolumes[u.id];
                }
            };
        }

        controls.appendChild(userMuteBtn);
        controls.appendChild(volumeSlider);

        li.appendChild(name);
        li.appendChild(controls);

        userList.appendChild(li);
    });
});