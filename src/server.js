import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use(
    "/public",
    express.static(path.join(__dirname, "public"), {
        extensions: ["js", "html", "htm", "css"],
    })
);
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"));

const httpServer = http.createServer(app);
const wsServer = new Server(httpServer, {
    cors: {
        origin: ["https://admin.socket.io"],
        credentials: true,
    },
});

instrument(wsServer, {
    auth: false,
    mode: "development",
});

function publicRooms() {
    const {
        sockets: {
            adapter: { sids, rooms },
        },
    } = wsServer;
    const publicRooms = [];
    rooms.forEach((_, key) => {
        if (sids.get(key) === undefined) {
            publicRooms.push(key);
        }
    });
    return publicRooms;
}

function countRoom(roomName) {
    return wsServer.sockets.adapter.rooms.get(roomName)?.size;
}

wsServer.on("connection", (socket) => {
    socket["nickname"] = "Anony";
    socket.onAny((event) => {
        console.log(`Socket Event: ${event}`);
    });
    socket.on("enter_room", (roomName, done) => {
        socket.join(roomName);
        done();
        socket
            .to(roomName)
            .emit("welcome", socket.nickname, countRoom(roomName));
        wsServer.sockets.emit("room_change", publicRooms());
    });
    socket.on("disconnecting", () => {
        socket.rooms.forEach((room) =>
            socket.to(room).emit("bye", socket.nickname, countRoom(room) - 1)
        );
        wsServer.sockets.emit("room_change", publicRooms());
    });
    socket.on("disconnect", () => {
        wsServer.sockets.emit("room_change", publicRooms());
    });
    socket.on("new_message", (msg, room, done) => {
        socket.to(room).emit("new_message", `${socket.nickname}: ${msg}`);
        done();
    });
    socket.on("nickname", (nickname) => (socket["nickname"] = nickname));
});

httpServer.listen(3000);
