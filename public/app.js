<<<<<<< HEAD
console.log("VOICE SYSTEM WITH USER MUTE LOADED");

const socket = io();

/* ================= UI ELEMENTS ================= */
const username = document.getElementById("username");
const roomCode = document.getElementById("roomCode");
const joinBtn = document.getElementById("joinBtn");
const voiceBtn = document.getElementById("voiceBtn");
const muteBtn = document.getElementById("muteBtn");
const status = document.getElementById("status");
const userList = document.getElementById("userList");

/* ================= STATE ================= */
let localStream = null;
let micReady = false;
let muted = false;

const peers = {};

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

/* ================= SOCKET CONNECT ================= */
socket.on("connect", () => {
    console.log("CONNECTED:", socket.id);
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

/* ================= JOIN ROOM ================= */
joinBtn.onclick = () => {

    const user = username.value.trim();
    const room = roomCode.value.trim();

    if (!user || !room) {
        alert("Enter username and room code");
        return;
    }

    if (!micReady) {
        alert("Enable mic first");
        return;
    }

    socket.emit("join-room", {
        room: room,
        username: user
    });

    status.innerText = "Joined room: " + room;
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

        console.log("AUDIO RECEIVED FROM:", id);

        let audio = document.getElementById("audio-" + id);

        if (!audio) {

            audio = document.createElement("audio");

            audio.id = "audio-" + id;
            audio.autoplay = true;
            audio.controls = true;
            audio.playsInline = true;
            audio.volume = 1;

            document.body.appendChild(audio);
        }

        audio.srcObject = event.streams[0];

        audio.play().catch(() => {

            console.log("Autoplay blocked. Click the page once.");

            document.body.addEventListener(
                "click",
                () => {
                    audio.play();
                },
                { once: true }
            );
        });
    };

    if (localStream) {

        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });
    }

    return peer;
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

/* ================= USER LIST WITH PER-USER MUTE ================= */
socket.on("user-list", (users) => {

    userList.innerHTML = "";

    users.forEach((u) => {

        const li = document.createElement("li");

        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.gap = "10px";

        const name = document.createElement("span");

        if (u.id === socket.id) {
            name.textContent = u.username + " (You)";
        } else {
            name.textContent = u.username;
        }

        const userMuteBtn = document.createElement("button");

        userMuteBtn.textContent = "🔇";
        userMuteBtn.title = "Mute this user";

        userMuteBtn.style.width = "45px";
        userMuteBtn.style.padding = "6px";
        userMuteBtn.style.border = "none";
        userMuteBtn.style.borderRadius = "6px";
        userMuteBtn.style.cursor = "pointer";
        userMuteBtn.style.background = "#5865f2";
        userMuteBtn.style.color = "white";

        if (u.id === socket.id) {

            userMuteBtn.disabled = true;
            userMuteBtn.style.opacity = "0.4";
            userMuteBtn.style.cursor = "not-allowed";

        } else {

            userMuteBtn.onclick = () => {

                const audio = document.getElementById("audio-" + u.id);

                if (!audio) {
                    alert("Audio not connected yet");
                    return;
                }

                audio.muted = !audio.muted;

                if (audio.muted) {
                    userMuteBtn.textContent = "🔊";
                    userMuteBtn.title = "Unmute this user";
                    userMuteBtn.style.background = "#da373c";
                } else {
                    userMuteBtn.textContent = "🔇";
                    userMuteBtn.title = "Mute this user";
                    userMuteBtn.style.background = "#5865f2";
                }
            };
        }

        li.appendChild(name);
        li.appendChild(userMuteBtn);

        userList.appendChild(li);
    });
=======
console.log("VOICE SYSTEM STARTED");

const socket = io();

/* ================= UI ================= */
const username = document.getElementById("username");
const roomCode = document.getElementById("roomCode");
const joinBtn = document.getElementById("joinBtn");
const voiceBtn = document.getElementById("voiceBtn");
const muteBtn = document.getElementById("muteBtn");
const status = document.getElementById("status");
const userList = document.getElementById("userList");

/* ================= STATE ================= */
let localStream = null;
let micReady = false;
let muted = false;

const peers = {};

/* ================= ICE SERVERS (STABLE) ================= */
const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

/* ================= CONNECT ================= */
socket.on("connect", () => {
    console.log("CONNECTED:", socket.id);
});

/* ================= ENABLE MIC ================= */
voiceBtn.onclick = async () => {

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        micReady = true;
        status.innerText = "Mic ON 🎤";

        console.log("MIC READY");

    } catch (err) {
        console.error("MIC ERROR:", err);
    }
};

/* ================= MUTE ================= */
muteBtn.onclick = () => {

    if (!localStream) return;

    muted = !muted;

    localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
    });

    status.innerText = muted ? "Muted 🔇" : "Mic ON 🎤";
};

/* ================= JOIN ROOM ================= */
joinBtn.onclick = () => {

    const user = username.value.trim();
    const room = roomCode.value.trim();

    if (!user || !room) {
        alert("Enter username and room");
        return;
    }

    if (!micReady) {
        alert("Enable mic first");
        return;
    }

    socket.emit("join-room", {
        room,
        username: user
    });

    status.innerText = "Joined room: " + room;
};

/* ================= CREATE PEER ================= */
function createPeer(id) {

    const peer = new RTCPeerConnection(config);
    peers[id] = peer;

    /* ICE SEND */
    peer.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit("ice", {
                target: id,
                candidate: e.candidate
            });
        }
    };

    /* ICE DEBUG */
    peer.oniceconnectionstatechange = () => {
        console.log("ICE STATE [" + id + "] :", peer.iceConnectionState);
    };

    /* AUDIO RECEIVE FIXED */
    peer.ontrack = (event) => {

        console.log("AUDIO RECEIVED FROM:", id);

        let audio = document.getElementById("audio-" + id);

        if (!audio) {
            audio = document.createElement("audio");
            audio.id = "audio-" + id;
            audio.autoplay = true;
            audio.controls = true;
            audio.playsInline = true; // 🔥 mobile fix
            document.body.appendChild(audio);
        }

        audio.srcObject = event.streams[0];

        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise.catch(() => {
                console.log("Autoplay blocked → waiting for click");
                document.body.addEventListener("click", () => {
                    audio.play();
                }, { once: true });
            });
        }
    };

    /* ADD LOCAL STREAM */
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });
    }

    return peer;
}

/* ================= USER JOINED ================= */
socket.on("user-joined", async (user) => {

    if (!micReady) return;

    const peer = createPeer(user.id);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("offer", {
        target: user.id,
        offer
    });
});

/* ================= OFFER ================= */
socket.on("offer", async ({ sender, offer }) => {

    const peer = createPeer(sender);

    await peer.setRemoteDescription(offer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socket.emit("answer", {
        target: sender,
        answer
    });
});

/* ================= ANSWER ================= */
socket.on("answer", async ({ sender, answer }) => {

    const peer = peers[sender];
    if (!peer) return;

    await peer.setRemoteDescription(answer);
});

/* ================= ICE ================= */
socket.on("ice", async ({ sender, candidate }) => {

    const peer = peers[sender];
    if (!peer) return;

    try {
        await peer.addIceCandidate(candidate);
    } catch (e) {
        console.error("ICE ERROR:", e);
    }
});

/* ================= USER LIST ================= */
socket.on("user-list", (users) => {

    userList.innerHTML = "";

    users.forEach(u => {

        const li = document.createElement("li");
        li.textContent = u.username;

        userList.appendChild(li);
    });
>>>>>>> b85b587b2eed11a3a5fcd7b0049ad68fba49fb7d
});