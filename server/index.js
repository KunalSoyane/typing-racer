/* server/index.js */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Client } = require('pg'); 

const app = express();
app.use(cors());

// --- CONNECT TO RENDER POSTGRESQL ---
const DB_URL = "postgresql://type_racer_user:TXP3G1D3SiENAxgaE5cc8rQAhod0grJz@dpg-d5itc975r7bs73dlo1ag-a.singapore-postgres.render.com/type_racer";

const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false } 
});

client.connect()
    .then(async () => {
        console.log("✅ Connected to Render PostgreSQL");
        
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS game_results (
                id SERIAL PRIMARY KEY,
                player_name TEXT,
                room_code TEXT,
                wpm INTEGER,
                accuracy INTEGER,
                result TEXT,
                start_time TIMESTAMP,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(createTableQuery);
        // Ensure columns exist for older DBs
        await client.query(`ALTER TABLE game_results ADD COLUMN IF NOT EXISTS accuracy INTEGER;`);
        await client.query(`ALTER TABLE game_results ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;`);
        console.log("✅ Database Synced");
    })
    .catch(err => console.error("❌ DB Error:", err));

app.get("/api/history", async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM game_results ORDER BY start_time DESC LIMIT 50');
        const formattedData = result.rows.map(row => ({
            playerName: row.player_name,
            roomCode: row.room_code,
            wpm: row.wpm,
            accuracy: row.accuracy,
            result: row.result,
            startTime: row.start_time || row.date 
        }));
        res.json(formattedData);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PARAGRAPHS = [
    "The morning sun peeked over the horizon, casting a golden glow across the sleepy village.",
    "Technology has revolutionized the way we communicate, breaking down geographical barriers.",
    "The old library was a sanctuary of silence and knowledge, with shelves that stretched to the ceiling.",
    "Space exploration represents the pinnacle of human curiosity and engineering.",
    "Coding is often compared to solving a complex puzzle, where every piece must fit perfectly."
];

const roomState = new Map();

// --- 🛠️ ROBUST END GAME LOGIC (Prevents Fake Wins) ---
async function endGame(roomCode, triggerPlayerId) {
    const room = roomState.get(roomCode);
    if (!room || room.isGameOver) return; 

    room.isGameOver = true;
    clearInterval(room.timerInterval);

    let winnerId = null;
    let maxScore = -1;

    // 1. Calculate Scores for Everyone
    Object.keys(room.players).forEach(socketId => {
        const p = room.players[socketId];
        
        // If it was a timeout (triggerPlayerId is null), force recalculate WPM based on full time
        if (!triggerPlayerId) {
            p.wpm = Math.round((p.charCount || 0) / 5 / 2); 
        }

        const score = (p.wpm || 0) * (p.accuracy || 0);
        p.finalScore = score; 
    });

    // 2. Determine Valid Winner
    if (triggerPlayerId) {
        // Validation: Did the person who "finished" actually have the best score?
        // This prevents the "8 WPM beats 30 WPM" bug.
        
        let highestScore = -1;
        let bestStatsId = null;
        
        Object.keys(room.players).forEach(sid => {
            if (room.players[sid].finalScore > highestScore) {
                highestScore = room.players[sid].finalScore;
                bestStatsId = sid;
            }
        });

        // If the finisher's score is suspiciously low compared to the leader, ignore their claim
        if (room.players[triggerPlayerId].finalScore < highestScore) {
             console.log(`⚠️ Invalid Win Detected! Finisher: ${triggerPlayerId} (Score: ${room.players[triggerPlayerId].finalScore}), Leader: ${bestStatsId} (Score: ${highestScore})`);
             winnerId = bestStatsId; // Give win to the actual high scorer
        } else {
             winnerId = triggerPlayerId;
        }

    } else {
        // Timeout Case: Find max score
        Object.keys(room.players).forEach(socketId => {
            const p = room.players[socketId];
            if (p.finalScore > maxScore) {
                maxScore = p.finalScore;
                winnerId = socketId;
            } else if (p.finalScore === maxScore) {
                const currentWinner = room.players[winnerId];
                if (p.correctChars > (currentWinner?.correctChars || 0)) {
                    winnerId = socketId;
                }
            }
        });
    }

    // 3. Save to DB
    try {
        const insertQuery = `
            INSERT INTO game_results (player_name, room_code, wpm, accuracy, result, start_time)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;

        for (const socketId of Object.keys(room.players)) {
            const p = room.players[socketId];
            let resultStatus = "Lost";
            if (socketId === winnerId) resultStatus = "Won";

            await client.query(insertQuery, [
                p.name, roomCode, p.wpm, p.accuracy, resultStatus, room.startTime
            ]);
        }
        console.log(`✅ Game Saved. Winner: ${winnerId}`);
    } catch (err) {
        console.error("Error saving stats:", err);
    }

    // 4. Send Results
    io.to(roomCode).emit('game_over', { 
        winnerId: winnerId, 
        players: room.players 
    });
}

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('join_room', ({ roomCode, playerName }) => {
        const roomSize = io.sockets.adapter.rooms.get(roomCode)?.size || 0;

        if (roomSize < 2) {
            socket.join(roomCode);
            if (!roomState.has(roomCode)) {
                roomState.set(roomCode, { 
                    readyCount: 0, 
                    players: {}, 
                    startTime: null, 
                    timerInterval: null, 
                    isGameOver: false 
                });
            }
            const room = roomState.get(roomCode);
            room.players[socket.id] = { 
                name: playerName || `Player-${socket.id.substr(0,4)}`, 
                wpm: 0, accuracy: 0, charCount: 0, correctChars: 0 
            };
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
        if (room && !room.isGameOver && room.players[socket.id]) {
            room.players[socket.id].wpm = data.wpm;
            room.players[socket.id].accuracy = data.accuracy;
            room.players[socket.id].charCount = data.charCount;
            room.players[socket.id].correctChars = data.correctChars;
        }
        socket.to(data.roomCode).emit('receive_progress', data);
    });

    socket.on('player_finished', (data) => {
        endGame(data.roomCode, socket.id);
    });
});

function startCountdown(roomCode) {
    let countdown = 10;
    const interval = setInterval(() => {
        io.to(roomCode).emit('timer_update', countdown);
        countdown--;
        if (countdown < 0) {
            clearInterval(interval);
            const room = roomState.get(roomCode);
            if (room) room.startTime = new Date();
            io.to(roomCode).emit('start_race', true);
            startGameTimer(roomCode);
        }
    }, 1000);
}

function startGameTimer(roomCode) {
    let gameTime = 120; 
    const room = roomState.get(roomCode);
    
    room.timerInterval = setInterval(() => {
        io.to(roomCode).emit('game_timer_update', gameTime);
        gameTime--;

        if (gameTime < 0) {
            endGame(roomCode, null);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});