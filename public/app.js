console.log("NOXVOICE APP LOADED");

const socket = io();

const username = document.getElementById("username");
const roomCode = document.getElementById("roomCode");
const joinBtn = document.getElementById("joinBtn");
const voiceBtn = document.getElementById("voiceBtn");
const muteBtn = document.getElementById("muteBtn");
const status = document.getElementById("status");
const userList = document.getElementById("userList");

let localStream = null;
let micReady = false;
let muted = false;

const peers = {};

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

socket.on("connect", () => {
    console.log("CONNECTED:", socket.id);
});

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

socket.on("user-list", (users) => {

    userList.innerHTML = "";

    users.forEach((u) => {

        const li = document.createElement("li");

        const name = document.createElement("span");

        if (u.id === socket.id) {
            name.textContent = u.username + " (You)";
        } else {
            name.textContent = u.username;
        }

        const userMuteBtn = document.createElement("button");

        userMuteBtn.textContent = "🔇";
        userMuteBtn.title = "Mute this user";

        if (u.id === socket.id) {

            userMuteBtn.disabled = true;

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
                    userMuteBtn.classList.add("user-muted");
                } else {
                    userMuteBtn.textContent = "🔇";
                    userMuteBtn.title = "Mute this user";
                    userMuteBtn.classList.remove("user-muted");
                }
            };
        }

        li.appendChild(name);
        li.appendChild(userMuteBtn);

        userList.appendChild(li);
    });
});