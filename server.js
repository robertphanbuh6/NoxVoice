const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

io.on("connection", (socket) => {

    console.log("CONNECTED:", socket.id);

    socket.on("join-room", ({ room, username }) => {

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

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON", PORT);
});