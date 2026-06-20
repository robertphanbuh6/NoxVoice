const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

/* ================= PATHS ================= */
const publicPath = path.join(__dirname, "public");
const usersFile = path.join(__dirname, "users.json");

/* ================= MIDDLEWARE ================= */
app.use(express.json());

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "noxvoice_secret_key_change_later",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

/* ================= USERS FILE ================= */
if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
}

function readUsers() {
    try {
        return JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch (err) {
        console.error("READ USERS ERROR:", err);
        return [];
    }
}

function writeUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

/* ================= LOGIN PROTECTION ================= */
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login.html");
    }

    next();
}

/* ================= AUTH ROUTES ================= */

/* REGISTER */
app.post("/api/register", async (req, res) => {

    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    if (!username || !password) {
        return res.json({
            success: false,
            message: "Username and password required"
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

    const users = readUsers();

    /* CHECK DUPLICATE USERNAME */
    const usernameExists = users.find(
        user => user.username.toLowerCase() === username.toLowerCase()
    );

    if (usernameExists) {
        return res.json({
            success: false,
            message: "Username already exists. Please choose another username."
        });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    users.push({
        username: username,
        password: hashedPassword
    });

    writeUsers(users);

    req.session.user = {
        username: username
    };

    res.json({
        success: true,
        message: "Account created successfully"
    });
});

/* LOGIN */
app.post("/api/login", async (req, res) => {

    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();

    if (!username || !password) {
        return res.json({
            success: false,
            message: "Username and password required"
        });
    }

    const users = readUsers();

    const user = users.find(
        u => u.username.toLowerCase() === username.toLowerCase()
    );

    if (!user) {
        return res.json({
            success: false,
            message: "Invalid username or password"
        });
    }

    const passwordOk = await bcrypt.compare(password, user.password);

    if (!passwordOk) {
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
});

/* LOGOUT */
app.post("/api/logout", (req, res) => {

    req.session.destroy(() => {
        res.json({
            success: true
        });
    });
});

/* CHECK CURRENT USER */
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

/* ================= PAGES ================= */

app.get("/", requireLogin, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/index.html", requireLogin, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/login.html", (req, res) => {
    res.sendFile(path.join(publicPath, "login.html"));
});

app.use(express.static(publicPath, {
    index: false
}));

/* ================= VOICE ROOMS ================= */

const rooms = {};

function removeSocketFromRoom(socket) {

    const room = socket.room;

    if (room && rooms[room]) {

        rooms[room] = rooms[room].filter(
            user => user.id !== socket.id
        );

        io.to(room).emit("user-list", rooms[room]);

        if (rooms[room].length === 0) {
            delete rooms[room];
        }
    }
}

/* ================= SOCKET.IO ================= */

io.on("connection", (socket) => {

    const sessionUser = socket.request.session.user;

    if (!sessionUser) {
        console.log("SOCKET REJECTED: NOT LOGGED IN");
        socket.disconnect();
        return;
    }

    console.log("CONNECTED:", socket.id, sessionUser.username);

    /* JOIN ROOM */
    socket.on("join-room", ({ room }) => {

        const username = sessionUser.username;

        if (!room || !username) {
            return;
        }

        if (!rooms[room]) {
            rooms[room] = [];
        }

        /* BLOCK SAME USERNAME IN SAME ROOM */
        const sameUsernameUser = rooms[room].find(
            user => user.username.toLowerCase() === username.toLowerCase()
        );

        if (sameUsernameUser && sameUsernameUser.id !== socket.id) {
            socket.emit("join-error", {
                message: "This username is already in this room"
            });

            return;
        }

        /* REMOVE FROM OLD ROOM FIRST */
        removeSocketFromRoom(socket);

        socket.join(room);
        socket.room = room;
        socket.username = username;

        rooms[room].push({
            id: socket.id,
            username: username
        });

        io.to(room).emit("user-list", rooms[room]);

        socket.to(room).emit("user-joined", {
            id: socket.id,
            username: username
        });

        console.log(username + " joined room " + room);
    });

    /* WEBRTC OFFER */
    socket.on("offer", (data) => {
        io.to(data.target).emit("offer", {
            sender: socket.id,
            offer: data.offer
        });
    });

    /* WEBRTC ANSWER */
    socket.on("answer", (data) => {
        io.to(data.target).emit("answer", {
            sender: socket.id,
            answer: data.answer
        });
    });

    /* WEBRTC ICE */
    socket.on("ice", (data) => {
        io.to(data.target).emit("ice", {
            sender: socket.id,
            candidate: data.candidate
        });
    });
	
	/* Stream */
	socket.on("stream-stopped", () => {
    if (socket.room) {
        socket.to(socket.room).emit("stream-stopped", {
            sender: socket.id
        });
    }
});


    /* DISCONNECT */
    socket.on("disconnect", () => {

        removeSocketFromRoom(socket);

        console.log("DISCONNECTED:", socket.id);
    });
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON", PORT);
});