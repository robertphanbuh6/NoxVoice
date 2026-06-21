require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const publicPath = path.join(__dirname, "public");

app.use(express.json());

/* ================= MONGODB ================= */

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
    console.error("MONGO_URI is missing. Check your .env file.");
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
    }
}, {
    timestamps: true
});

const User = mongoose.model("User", userSchema);

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

/* ================= AUTH CHECK ================= */

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login.html");
    }

    next();
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
            password: hashedPassword
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

/* ================= PAGES ================= */

app.get("/", requireLogin, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/index.html", requireLogin, (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

app.use(express.static(publicPath));

/* ================= SOCKET / VOICE ================= */

const rooms = {};

io.on("connection", (socket) => {

    const sessionUser = socket.request.session.user;

    if (!sessionUser) {
        socket.disconnect();
        return;
    }

    console.log("CONNECTED:", socket.id, sessionUser.username);

    socket.on("join-room", ({ room }) => {

        const username = sessionUser.username;

        if (!room || !username) {
            return;
        }

        socket.join(room);
        socket.room = room;
        socket.username = username;

        if (!rooms[room]) {
            rooms[room] = [];
        }

        rooms[room] = rooms[room].filter(
            user => user.username !== username
        );

        rooms[room].push({
            id: socket.id,
            username: username
        });

        io.to(room).emit("user-list", rooms[room]);

        socket.to(room).emit("user-joined", {
            id: socket.id,
            username: username
        });

        console.log(username + " joined " + room);
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

        console.log("DISCONNECTED:", socket.id);
    });
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON", PORT);
});