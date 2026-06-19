const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

/* ================= SOCKET ================= */
io.on("connection", (socket) => {

    console.log("CONNECTED:", socket.id);

    /* ================= JOIN ROOM (FIXED DUPLICATE USER) ================= */
    socket.on("join-room", ({ room, username }) => {

        socket.join(room);
        socket.room = room;
        socket.username = username;

        if (!rooms[room]) rooms[room] = [];

        // 🔥 REMOVE DUPLICATE USERNAME IF EXISTS
        rooms[room] = rooms[room].filter(
            (u) => u.username !== username
        );

        rooms[room].push({
            id: socket.id,
            username
        });

        // Send updated list
        io.to(room).emit("user-list", rooms[room]);

        // Notify others
        socket.to(room).emit("user-joined", {
            id: socket.id,
            username
        });
    });

    /* ================= WEBRTC SIGNALING ================= */
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

    /* ================= DISCONNECT ================= */
    socket.on("disconnect", () => {

        const room = socket.room;

        if (room && rooms[room]) {

            rooms[room] = rooms[room].filter(
                (u) => u.id !== socket.id
            );

            io.to(room).emit("user-list", rooms[room]);
        }

        console.log("DISCONNECTED:", socket.id);
    });
});

/* ================= START SERVER ================= */
server.listen(3000, () => {
    console.log("SERVER RUNNING ON 3000");
});