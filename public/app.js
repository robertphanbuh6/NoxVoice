console.log("NOXVOICE APP LOADED - LOGIN + ROOM SYSTEM");

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

/* ================= STATE ================= */
let localStream = null;
let micReady = false;
let muted = false;
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

        console.log("AUDIO RECEIVED FROM:", id);

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

        audio.srcObject = event.streams[0];

        audio.volume = userVolumes[id] ?? 1;
        audio.muted = userMuted[id] ?? false;

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

    delete userVolumes[id];
    delete userMuted[id];
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