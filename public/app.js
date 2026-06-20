console.log("NOXVOICE APP LOADED - MIC + STREAM AUDIO ENABLED");

const socket = io();

/* ================= UI ELEMENTS ================= */
const username = document.getElementById("username");
const roomCode = document.getElementById("roomCode");
const joinBtn = document.getElementById("joinBtn");
const voiceBtn = document.getElementById("voiceBtn");
const muteBtn = document.getElementById("muteBtn");
const logoutBtn = document.getElementById("logoutBtn");
const status = document.getElementById("status");
const userList = document.getElementById("userList");
const accountName = document.getElementById("accountName");

const streamBtn =
    document.getElementById("streamBtn") ||
    document.getElementById("screenBtn") ||
    document.getElementById("shareBtn");

/* ================= STATE ================= */
let localStream = null;       // microphone voice only
let screenStream = null;      // screen video + stream audio
let screenTrack = null;

let micReady = false;
let muted = false;
let isStreaming = false;
let loggedInUsername = null;

const peers = {};
const userVolumes = {};
const userMuted = {};

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

        if (username) {
            username.value = data.username;
            username.readOnly = true;
        }

        if (accountName) {
            accountName.innerText = "Signed in as: " + data.username;
        }

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

/* ================= ENABLE MIC ================= */
voiceBtn.onclick = async () => {
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

        console.log("MIC READY");

        status.innerText = "Mic ON 🎤";

        Object.values(peers).forEach((peer) => {
            addMicTracksToPeer(peer);
        });

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
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await fetch("/api/logout", {
            method: "POST"
        });

        window.location.href = "/login.html";
    };
}

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

    status.innerText = "Joined room: " + room;
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

        const content = document.querySelector(".content") || document.body;
        content.appendChild(grid);
    }

    return grid;
}

/* ================= LOCAL SCREEN PREVIEW ================= */
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
        video.muted = true; // Prevent echo from your own stream audio
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

/* ================= START / STOP SCREEN STREAM ================= */
if (streamBtn) {
    streamBtn.onclick = async () => {
        if (!isStreaming) {
            await startScreenStream();
        } else {
            await stopScreenStream();
        }
    };
}

async function startScreenStream() {
    try {
        /*
            This captures:
            - screen video
            - stream/system audio

            It does NOT replace localStream.
            Your microphone remains separate.
        */
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

        if (streamBtn) {
            streamBtn.innerText = "🛑 Stop Stream";
        }

        status.innerText = "Screen streaming with audio 🖥️🔊";

        showLocalScreenPreview(screenStream);

        Object.keys(peers).forEach(async (id) => {
            const peer = peers[id];

            addScreenTracksToPeer(peer);

            await renegotiatePeer(id);
        });

        screenTrack.onended = async () => {
            await stopScreenStream();
        };

        console.log("SCREEN STREAM WITH AUDIO STARTED");

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

    if (streamBtn) {
        streamBtn.innerText = "🖥️ Start Stream";
    }

    status.innerText = "Screen stream stopped";

    console.log("SCREEN STREAM STOPPED");
}

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
        console.log("Audio autoplay blocked. Click the page once.");

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
    const grid = getStreamsGrid();

    let card = document.getElementById("stream-card-" + id);

    if (!card) {
        card = document.createElement("div");
        card.id = "stream-card-" + id;
        card.className = "stream-card";

        const title = document.createElement("div");
        title.className = "stream-card-title";
        title.innerText = "Screen stream from user";

        const video = document.createElement("video");
        video.id = "video-" + id;
        video.autoplay = true;
        video.controls = true;
        video.playsInline = true;
        video.muted = true; // Audio is handled separately by audio tracks

        card.appendChild(title);
        card.appendChild(video);
        grid.appendChild(card);
    }

    const video = document.getElementById("video-" + id);

    const videoOnlyStream = new MediaStream([event.track]);

    video.srcObject = videoOnlyStream;

    video.play().catch(() => {
        console.log("Remote video autoplay blocked");
    });

    event.track.onended = () => {
        const oldCard = document.getElementById("stream-card-" + id);

        if (oldCard) {
            oldCard.remove();
        }
    };
}

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

/* ================= USER LIST WITH MUTE + VOLUME ================= */
socket.on("user-list", (users) => {
    userList.innerHTML = "";

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
                userMuted[u.id] = !userMuted[u.id];

                applyUserAudioSettings(u.id);

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
                userVolumes[u.id] = Number(volumeSlider.value);

                applyUserAudioSettings(u.id);
            };
        }

        controls.appendChild(userMuteBtn);
        controls.appendChild(volumeSlider);

        li.appendChild(name);
        li.appendChild(controls);

        userList.appendChild(li);
    });
});