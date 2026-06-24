require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const publicPath = path.join(__dirname, "public");

app.use(express.json({
    limit: "2mb"
}));

/* ================= MONGODB ================= */

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
    console.error("MONGO_URI is missing. Check your .env file or Render Environment Variables.");
    process.exit(1);
}

mongoose.connect(mongoUri)
    .then(() => {
        console.log("MONGODB CONNECTED");
    })
    .catch((err) => {
        console.error("MONGODB CONNECTION ERROR:", err);
        process.exit(1);
    });

/* ================= USER MODEL ================= */

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    usernameLower: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    avatarData: {
        type: String,
        default: ""
    }
}, {
    timestamps: true
});

const User = mongoose.model("User", userSchema);

/* ================= SERVER / CHANNEL MODEL ================= */

const channelSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ["text", "voice"],
        default: "voice"
    }
}, {
    _id: false
});

const voiceServerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    ownerUsername: {
        type: String,
        required: true
    },
    members: {
        type: [String],
        default: []
    },
    inviteCode: {
        type: String,
        required: true,
        unique: true
    },
    channels: {
        type: [channelSchema],
        default: []
    }
}, {
    timestamps: true
});

const VoiceServer = mongoose.model("VoiceServer", voiceServerSchema);

/* ================= SESSION ================= */

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "change_this_secret_later",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

/* ================= LIVE VOICE MEMORY ================= */

const voiceRooms = {};

/* ================= HELPERS ================= */

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login.html");
    }

    next();
}

function requireApiLogin(req, res, next) {
    if (!req.session.user) {
        return res.json({
            success: false,
            message: "Not logged in"
        });
    }

    next();
}

function makeInviteCode() {
    return crypto.randomBytes(4).toString("hex");
}

function makeChannelId(name) {
    const clean = String(name || "channel")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return clean + "-" + crypto.randomBytes(3).toString("hex");
}

function makeServerWatchRoom(serverId) {
    return "server-watch:" + serverId;
}

function makeVoiceRoomName(serverId, channelId) {
    return "server:" + serverId + ":voice:" + channelId;
}

async function getUserServer(serverId, username) {
    const foundServer = await VoiceServer.findById(serverId);

    if (!foundServer) {
        return null;
    }

    if (!foundServer.members.includes(username)) {
        return null;
    }

    return foundServer;
}

function getServerChannelUsers(serverId) {
    const result = {};

    Object.keys(voiceRooms).forEach((roomName) => {
        const prefix = "server:" + serverId + ":voice:";

        if (!roomName.startsWith(prefix)) {
            return;
        }

        const channelId = roomName.replace(prefix, "");
        result[channelId] = voiceRooms[roomName] || [];
    });

    return result;
}

function emitServerChannelUsers(serverId) {
    if (!serverId || serverId === "legacy") {
        return;
    }

    io.to(makeServerWatchRoom(serverId)).emit("server-channel-users", {
        serverId: serverId,
        channels: getServerChannelUsers(serverId)
    });
}

/* ================= AUTH ROUTES ================= */

app.post("/api/register", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "").trim();

        if (!username || !password) {
            return res.json({
                success: false,
                message: "Username and password are required"
            });
        }

        if (username.length < 3) {
            return res.json({
                success: false,
                message: "Username must be at least 3 characters"
            });
        }

        if (password.length < 6) {
            return res.json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const usernameLower = username.toLowerCase();

        const existingUser = await User.findOne({
            usernameLower: usernameLower
        });

        if (existingUser) {
            return res.json({
                success: false,
                message: "Username already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            username: username,
            usernameLower: usernameLower,
            password: hashedPassword,
            avatarData: ""
        });

        req.session.user = {
            username: username
        };

        res.json({
            success: true,
            message: "Registered successfully"
        });

    } catch (err) {
        console.error("REGISTER ERROR:", err);

        res.json({
            success: false,
            message: "Registration failed"
        });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "").trim();

        if (!username || !password) {
            return res.json({
                success: false,
                message: "Username and password are required"
            });
        }

        const user = await User.findOne({
            usernameLower: username.toLowerCase()
        });

        if (!user) {
            return res.json({
                success: false,
                message: "Invalid username or password"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.json({
                success: false,
                message: "Invalid username or password"
            });
        }

        req.session.user = {
            username: user.username
        };

        res.json({
            success: true,
            message: "Logged in successfully"
        });

    } catch (err) {
        console.error("LOGIN ERROR:", err);

        res.json({
            success: false,
            message: "Login failed"
        });
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({
            success: true
        });
    });
});

app.get("/api/me", (req, res) => {
    if (!req.session.user) {
        return res.json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        username: req.session.user.username
    });
});

/* ================= PROFILE ROUTES ================= */

app.get("/api/profile", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;

        const user = await User.findOne({
            usernameLower: username.toLowerCase()
        });

        if (!user) {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            profile: {
                username: user.username,
                avatarData: user.avatarData || ""
            }
        });

    } catch (err) {
        console.error("GET PROFILE ERROR:", err);

        res.json({
            success: false,
            message: "Could not load profile"
        });
    }
});

app.post("/api/profile/avatar", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const avatarData = String(req.body.avatarData || "");

        if (avatarData.length > 500000) {
            return res.json({
                success: false,
                message: "Avatar image is too large"
            });
        }

        const user = await User.findOne({
            usernameLower: username.toLowerCase()
        });

        if (!user) {
            return res.json({
                success: false,
                message: "User not found"
            });
        }

        user.avatarData = avatarData;
        await user.save();

        res.json({
            success: true,
            avatarData: user.avatarData || ""
        });

    } catch (err) {
        console.error("SAVE AVATAR ERROR:", err);

        res.json({
            success: false,
            message: "Could not save avatar"
        });
    }
});

/* ================= SERVER / CHANNEL ROUTES ================= */

app.get("/api/servers", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;

        const servers = await VoiceServer.find({
            members: username
        }).sort({
            createdAt: -1
        });

        res.json({
            success: true,
            servers: servers
        });

    } catch (err) {
        console.error("GET SERVERS ERROR:", err);

        res.json({
            success: false,
            message: "Could not load servers"
        });
    }
});

app.post("/api/servers", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const name = String(req.body.name || "").trim();

        if (!name) {
            return res.json({
                success: false,
                message: "Server name is required"
            });
        }

        const newServer = await VoiceServer.create({
            name: name,
            ownerUsername: username,
            members: [username],
            inviteCode: makeInviteCode(),
            channels: [
                {
                    id: "general-chat",
                    name: "general-chat",
                    type: "text"
                },
                {
                    id: "general",
                    name: "General",
                    type: "voice"
                },
                {
                    id: "gaming",
                    name: "Gaming",
                    type: "voice"
                },
                {
                    id: "music",
                    name: "Music",
                    type: "voice"
                }
            ]
        });

        res.json({
            success: true,
            server: newServer
        });

    } catch (err) {
        console.error("CREATE SERVER ERROR:", err);

        res.json({
            success: false,
            message: "Could not create server"
        });
    }
});

app.post("/api/servers/join", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const code = String(req.body.inviteCode || "").trim();

        if (!code) {
            return res.json({
                success: false,
                message: "Invite code is required"
            });
        }

        const foundServer = await VoiceServer.findOne({
            $or: [
                { inviteCode: code },
                { _id: mongoose.Types.ObjectId.isValid(code) ? code : null }
            ]
        });

        if (!foundServer) {
            return res.json({
                success: false,
                message: "Server not found"
            });
        }

        if (!foundServer.members.includes(username)) {
            foundServer.members.push(username);
            await foundServer.save();
        }

        res.json({
            success: true,
            server: foundServer
        });

    } catch (err) {
        console.error("JOIN SERVER ERROR:", err);

        res.json({
            success: false,
            message: "Could not join server"
        });
    }
});

app.get("/api/servers/:serverId", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const foundServer = await getUserServer(req.params.serverId, username);

        if (!foundServer) {
            return res.json({
                success: false,
                message: "Server not found"
            });
        }

        res.json({
            success: true,
            server: foundServer
        });

    } catch (err) {
        console.error("GET SERVER ERROR:", err);

        res.json({
            success: false,
            message: "Could not load server"
        });
    }
});

app.get("/api/servers/:serverId/channel-users", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const serverId = String(req.params.serverId);

        const foundServer = await getUserServer(serverId, username);

        if (!foundServer) {
            return res.json({
                success: false,
                message: "Server not found"
            });
        }

        res.json({
            success: true,
            channels: getServerChannelUsers(serverId)
        });

    } catch (err) {
        console.error("CHANNEL USERS API ERROR:", err);

        res.json({
            success: false,
            message: "Could not load channel users"
        });
    }
});

app.post("/api/servers/:serverId/channels", requireApiLogin, async (req, res) => {
    try {
        const username = req.session.user.username;
        const foundServer = await getUserServer(req.params.serverId, username);

        if (!foundServer) {
            return res.json({
                success: false,
                message: "Server not found"
            });
        }

        if (foundServer.ownerUsername !== username) {
            return res.json({
                success: false,
                message: "Only the server owner can create channels"
            });
        }

        const name = String(req.body.name || "").trim();
        const type = String(req.body.type || "voice").trim();

        if (!name) {
            return res.json({
                success: false,
                message: "Channel name is required"
            });
        }

        if (!["text", "voice"].includes(type)) {
            return res.json({
                success: false,
                message: "Invalid channel type"
            });
        }

        const channel = {
            id: makeChannelId(name),
            name: name,
            type: type
        };

        foundServer.channels.push(channel);
        await foundServer.save();

        res.json({
            success: true,
            server: foundServer
        });

    } catch (err) {
        console.error("CREATE CHANNEL ERROR:", err);

        res.json({
            success: false,
            message: "Could not create channel"
        });
    }
});

/* ================= PAGES ================= */

app.get("/", requireLogin, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/index.html", requireLogin, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

app.use(express.static(publicPath));

/* ================= SOCKET / VOICE ================= */

function updateVoiceRoomList(roomName) {
    const users = voiceRooms[roomName] || [];

    io.to(roomName).emit("voice-user-list", users);
    io.to(roomName).emit("user-list", users);

    if (roomName.startsWith("server:")) {
        const parts = roomName.split(":");
        const serverId = parts[1];

        emitServerChannelUsers(serverId);
    }
}

function removeSocketFromVoiceRoom(socket) {
    const oldRoom = socket.voiceRoom;

    if (!oldRoom || !voiceRooms[oldRoom]) {
        return;
    }

    const oldServerId = socket.currentServerId;

    voiceRooms[oldRoom] = voiceRooms[oldRoom].filter(
        user => user.id !== socket.id
    );

    socket.to(oldRoom).emit("user-left", {
        id: socket.id,
        username: socket.username
    });

    updateVoiceRoomList(oldRoom);

    if (voiceRooms[oldRoom].length === 0) {
        delete voiceRooms[oldRoom];
    }

    if (oldServerId && oldServerId !== "legacy") {
        emitServerChannelUsers(oldServerId);
    }

    socket.leave(oldRoom);

    socket.voiceRoom = null;
    socket.currentServerId = null;
    socket.currentChannelId = null;
}

function joinSocketToVoiceRoom(socket, roomName, serverId, channelId) {
    const username = socket.request.session.user.username;

    removeSocketFromVoiceRoom(socket);

    socket.join(roomName);

    socket.voiceRoom = roomName;
    socket.currentServerId = serverId;
    socket.currentChannelId = channelId;
    socket.username = username;

    if (!voiceRooms[roomName]) {
        voiceRooms[roomName] = [];
    }

    voiceRooms[roomName] = voiceRooms[roomName].filter(
        user => user.username !== username
    );

    voiceRooms[roomName].push({
        id: socket.id,
        username: username,
        serverId: serverId,
        channelId: channelId,
        avatarData: socket.avatarData || "",
        isStreaming: false,
        isMuted: false,
        isSpeaking: false
    });

    updateVoiceRoomList(roomName);

    socket.emit("voice-joined-confirmed", {
        serverId: serverId,
        channelId: channelId,
        users: voiceRooms[roomName] || []
    });

    socket.to(roomName).emit("user-joined", {
        id: socket.id,
        username: username
    });

    if (serverId && serverId !== "legacy") {
        socket.join(makeServerWatchRoom(serverId));
        socket.watchingServerId = serverId;
        emitServerChannelUsers(serverId);
    }

    console.log(username + " joined voice room " + roomName);
}

io.on("connection", async (socket) => {
    const sessionUser = socket.request.session.user;

    if (!sessionUser) {
        socket.disconnect();
        return;
    }

    socket.username = sessionUser.username;
    socket.avatarData = "";

    try {
        const user = await User.findOne({
            usernameLower: sessionUser.username.toLowerCase()
        });

        if (user) {
            socket.avatarData = user.avatarData || "";
        }

    } catch (err) {
        console.error("SOCKET AVATAR LOAD ERROR:", err);
    }

    console.log("CONNECTED:", socket.id, sessionUser.username);

    socket.on("watch-server", async ({ serverId }) => {
        try {
            const username = sessionUser.username;

            const foundServer = await getUserServer(serverId, username);

            if (!foundServer) {
                socket.emit("watch-server-error", {
                    message: "Server not found"
                });
                return;
            }

            if (socket.watchingServerId) {
                socket.leave(makeServerWatchRoom(socket.watchingServerId));
            }

            socket.join(makeServerWatchRoom(serverId));
            socket.watchingServerId = serverId;

            socket.emit("server-channel-users", {
                serverId: serverId,
                channels: getServerChannelUsers(serverId)
            });

        } catch (err) {
            console.error("WATCH SERVER ERROR:", err);

            socket.emit("watch-server-error", {
                message: "Could not watch server"
            });
        }
    });

    socket.on("unwatch-server", () => {
        if (socket.watchingServerId) {
            socket.leave(makeServerWatchRoom(socket.watchingServerId));
            socket.watchingServerId = null;
        }
    });

    socket.on("join-voice-channel", async ({ serverId, channelId }) => {
        try {
            const username = sessionUser.username;

            const foundServer = await getUserServer(serverId, username);

            if (!foundServer) {
                socket.emit("join-error", {
                    message: "Server not found"
                });
                return;
            }

            const channel = foundServer.channels.find(
                ch => ch.id === channelId && ch.type === "voice"
            );

            if (!channel) {
                socket.emit("join-error", {
                    message: "Voice channel not found"
                });
                return;
            }

            const roomName = makeVoiceRoomName(serverId, channelId);

            joinSocketToVoiceRoom(socket, roomName, serverId, channelId);

        } catch (err) {
            console.error("JOIN VOICE CHANNEL ERROR:", err);

            socket.emit("join-error", {
                message: "Could not join voice channel"
            });
        }
    });

    socket.on("join-room", ({ room }) => {
        if (!room) {
            return;
        }

        const roomName = "legacy:" + room;

        joinSocketToVoiceRoom(socket, roomName, "legacy", room);
    });

    socket.on("leave-voice-channel", () => {
        const oldServerId = socket.currentServerId;

        removeSocketFromVoiceRoom(socket);

        if (oldServerId && oldServerId !== "legacy") {
            emitServerChannelUsers(oldServerId);
        }
    });

    socket.on("stream-status", ({ isStreaming }) => {
        const room = socket.voiceRoom;

        if (!room || !voiceRooms[room]) {
            return;
        }

        const user = voiceRooms[room].find(
            u => u.id === socket.id
        );

        if (user) {
            user.isStreaming = !!isStreaming;
        }

        io.to(room).emit("user-stream-status", {
            id: socket.id,
            username: socket.username,
            isStreaming: !!isStreaming
        });

        updateVoiceRoomList(room);
    });

    socket.on("mute-status", ({ isMuted }) => {
        const room = socket.voiceRoom;

        if (!room || !voiceRooms[room]) {
            return;
        }

        const user = voiceRooms[room].find(
            u => u.id === socket.id
        );

        if (user) {
            user.isMuted = !!isMuted;

            if (user.isMuted) {
                user.isSpeaking = false;
            }
        }

        io.to(room).emit("user-mute-status", {
            id: socket.id,
            username: socket.username,
            isMuted: !!isMuted
        });

        if (isMuted) {
            io.to(room).emit("user-speaking-status", {
                id: socket.id,
                username: socket.username,
                isSpeaking: false
            });
        }

        updateVoiceRoomList(room);
    });

    socket.on("speaking-status", ({ isSpeaking }) => {
        const room = socket.voiceRoom;

        if (!room || !voiceRooms[room]) {
            return;
        }

        const user = voiceRooms[room].find(
            u => u.id === socket.id
        );

        if (!user) {
            return;
        }

        const finalSpeaking = !!isSpeaking && !user.isMuted;

        if (user.isSpeaking === finalSpeaking) {
            return;
        }

        user.isSpeaking = finalSpeaking;

        io.to(room).emit("user-speaking-status", {
            id: socket.id,
            username: socket.username,
            isSpeaking: finalSpeaking
        });

        if (user.serverId && user.serverId !== "legacy") {
            emitServerChannelUsers(user.serverId);
        }
    });

    socket.on("avatar-updated", ({ avatarData }) => {
        socket.avatarData = String(avatarData || "");

        const room = socket.voiceRoom;

        if (room && voiceRooms[room]) {
            const user = voiceRooms[room].find(
                u => u.id === socket.id
            );

            if (user) {
                user.avatarData = socket.avatarData;
            }

            io.to(room).emit("user-profile-updated", {
                id: socket.id,
                username: socket.username,
                avatarData: socket.avatarData
            });

            updateVoiceRoomList(room);

            if (socket.currentServerId && socket.currentServerId !== "legacy") {
                emitServerChannelUsers(socket.currentServerId);
            }
        }
    });

    socket.on("request-offer", ({ target }) => {
        if (!target) {
            return;
        }

        io.to(target).emit("request-offer", {
            sender: socket.id,
            username: socket.username
        });
    });

    socket.on("offer", (data) => {
        io.to(data.target).emit("offer", {
            sender: socket.id,
            offer: data.offer
        });
    });

    socket.on("answer", (data) => {
        io.to(data.target).emit("answer", {
            sender: socket.id,
            answer: data.answer
        });
    });

    socket.on("ice", (data) => {
        io.to(data.target).emit("ice", {
            sender: socket.id,
            candidate: data.candidate
        });
    });

    socket.on("disconnect", () => {
        const oldServerId = socket.currentServerId || socket.watchingServerId;

        removeSocketFromVoiceRoom(socket);

        if (oldServerId && oldServerId !== "legacy") {
            emitServerChannelUsers(oldServerId);
        }

        console.log("DISCONNECTED:", socket.id);
    });
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON", PORT);
});
