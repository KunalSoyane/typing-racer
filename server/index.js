/* server/index.js */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PARAGRAPHS = [
    "The morning sun peeked over the horizon, casting a golden glow across the sleepy village. Birds began to chirp, welcoming the new day with a symphony of melodies that echoed through the trees.",
    "Technology has revolutionized the way we communicate, breaking down geographical barriers that once isolated communities. With the click of a button, we can instantly share thoughts, images, and videos.",
    "The old library was a sanctuary of silence and knowledge, with shelves that stretched all the way to the high, vaulted ceiling. Dust motes danced in the shafts of light filtering through the stained-glass windows.",
    "Space exploration represents the pinnacle of human curiosity and engineering, pushing the boundaries of what is possible. Astronauts train for years to endure the harsh conditions of zero gravity.",
    "Coding is often compared to solving a complex puzzle, where every piece must fit perfectly for the picture to be complete. A single missing semicolon or a misspelled variable can cause the entire program to crash."
];

// roomState = { roomCode: { readyCount: 0, players: { socketId: { wpm, accuracy, charCount, correctChars } } } }
const roomState = new Map();

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('join_room', (roomCode) => {
        const roomSize = io.sockets.adapter.rooms.get(roomCode)?.size || 0;

        if (roomSize < 2) {
            socket.join(roomCode);
            
            if (!roomState.has(roomCode)) {
                roomState.set(roomCode, { readyCount: 0, players: {} });
            }
            
            // Init stats
            const room = roomState.get(roomCode);
            room.players[socket.id] = { wpm: 0, accuracy: 0, charCount: 0, correctChars: 0 };

            socket.emit('room_joined', { roomCode });

            if (roomSize + 1 === 2) {
                const randomText = PARAGRAPHS[Math.floor(Math.random() * PARAGRAPHS.length)];
                io.to(roomCode).emit('update_text', randomText);
                io.to(roomCode).emit('players_connected_wait_ready', true); 
            }
        } else {
            socket.emit('error_message', "Room is full!");
        }
    });

    socket.on('player_ready', (roomCode) => {
        const state = roomState.get(roomCode);
        if (state) {
            state.readyCount += 1;
            if (state.readyCount >= 2) {
                state.readyCount = 0; 
                startCountdown(roomCode);
            }
        }
    });

    socket.on('send_progress', (data) => {
        const room = roomState.get(data.roomCode);
        if (room && room.players[socket.id]) {
            room.players[socket.id].wpm = data.wpm;
            room.players[socket.id].accuracy = data.accuracy;
            room.players[socket.id].charCount = data.charCount;
            room.players[socket.id].correctChars = data.correctChars;
        }
        socket.to(data.roomCode).emit('receive_progress', data);
    });

    socket.on('player_finished', (data) => {
        io.to(data.roomCode).emit('game_over', { winnerId: socket.id }); 
    });
});

function startCountdown(roomCode) {
    let countdown = 10;
    const interval = setInterval(() => {
        io.to(roomCode).emit('timer_update', countdown);
        countdown--;
        if (countdown < 0) {
            clearInterval(interval);
            io.to(roomCode).emit('start_race', true);
            startGameTimer(roomCode);
        }
    }, 1000);
}

// --- UPDATED TIMER LOGIC ---
function startGameTimer(roomCode) {
    let gameTime = 120; // 120 Seconds
    
    const gameInterval = setInterval(() => {
        io.to(roomCode).emit('game_timer_update', gameTime);
        gameTime--;

        if (gameTime < 0) {
            clearInterval(gameInterval);
            
            const room = roomState.get(roomCode);
            let winnerId = null;
            let maxScore = -1;
            let maxChars = -1;
            let isDraw = false;

            if (room && room.players) {
                Object.keys(room.players).forEach(socketId => {
                    const p = room.players[socketId];
                    
                    // 1. RECALCULATE WPM (Based on full 2 minutes)
                    const finalWpm = Math.round((p.charCount || 0) / 5 / 2);
                    p.wpm = finalWpm; // Update the server state

                    // 2. CALCULATE SCORE
                    const score = (p.wpm || 0) * (p.accuracy || 0);
                    const chars = p.correctChars || 0;
                    
                    if (score > maxScore) {
                        maxScore = score;
                        maxChars = chars;
                        winnerId = socketId;
                        isDraw = false; 
                    } else if (score === maxScore) {
                        // TIE BREAKER: Check Correct Characters
                        if (chars > maxChars) {
                            maxChars = chars;
                            winnerId = socketId;
                            isDraw = false;
                        } else if (chars === maxChars) {
                            isDraw = true; 
                        }
                    }
                });
            }

            if (isDraw) winnerId = null;

            // --- SEND FINAL STATS TO CLIENT ---
            io.to(roomCode).emit('game_over', { 
                winnerId: winnerId, 
                timeout: true,
                players: room ? room.players : {} // Send the recalculated stats
            }); 
        }
    }, 1000);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});