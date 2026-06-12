# ⌨️ Typing Racer

> A real-time **multiplayer typing race** game — two players join a shared room and race to type a paragraph as fast and accurately as possible.

🔗 **Live Demo:** [typing-racer-one.vercel.app](https://typing-racer-one.vercel.app)

---

## 🎮 How It Works

1. **Enter your name** and a **room code**
2. **Share the room code** with a friend — they join the same room
3. Both players click **Ready** → a 10-second countdown begins
4. **Type the paragraph** as fast as you can — characters light up green (correct) or red (incorrect)
5. First to finish the full paragraph wins, or the player with the higher WPM × accuracy score when the 120-second timer runs out

---

## ✨ Features

| Feature | Description |
|---|---|
| ⚡ **Real-time multiplayer** | Live progress, WPM, and accuracy synced between both players via WebSockets |
| 🔢 **Room code system** | Create or join a private race using any room code |
| 📊 **Live stats** | WPM and accuracy tracked character-by-character as you type |
| 📈 **Progress bars** | Visual race track showing both players' completion percentage |
| ⏱️ **Dual timers** | 10-second pre-race countdown + 120-second race timer |
| 🎨 **Character highlighting** | Green for correct, red for incorrect, cursor on the active character |
| 🎲 **20 random paragraphs** | A new random passage is picked every race |
| 🏆 **Server-side winner logic** | Winner determined on the server; tie-breaking by correct characters |
| 🔌 **Disconnect handling** | If a player disconnects mid-race, their opponent is declared the winner |
| 🗄️ **Persistent history** | All race results (player, WPM, accuracy, win/loss) saved to PostgreSQL |
| 🔐 **Admin dashboard** | Password-protected game history table showing the last 50 races |

---

## 🏗️ Tech Stack

### Frontend — `client/`
| Tech | Purpose |
|---|---|
| **React 19** | UI framework (Create React App) |
| **Socket.io-client 4** | Real-time WebSocket communication |
| **CSS3 + Google Fonts** | Styling (Poppins + Roboto Mono) |
| **Vercel** | Deployment |

### Backend — `server/`
| Tech | Purpose |
|---|---|
| **Node.js + Express 5** | HTTP server and REST API |
| **Socket.io 4** | WebSocket server for real-time events |
| **PostgreSQL (via `pg`)** | Persistent game result storage |
| **Render** | Deployment (server + database) |

---

## 📂 Project Structure

```
typing-racer/
├── client/                   # React frontend
│   ├── src/
│   │   ├── App.js            # All game logic and UI components
│   │   └── App.css           # Styling
│   └── package.json
│
├── server/
│   ├── index.js              # Express + Socket.io server, game engine, DB
│   └── package.json
│
└── .gitignore
```

---

## 🔌 Socket.io Event Reference

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join_room` | `{ roomCode, playerName }` | Join or create a room |
| `player_ready` | `roomCode` | Signal that this player is ready to race |
| `send_progress` | `{ roomCode, progressPercent, wpm, accuracy, charCount, correctChars }` | Broadcast typing progress every keystroke |
| `player_finished` | `{ roomCode }` | Notify server the player completed the paragraph |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `room_joined` | — | Confirm the player joined the room |
| `error_message` | `string` | Room full or validation error |
| `update_text` | `string` | The paragraph to type (sent when 2nd player joins) |
| `players_connected_wait_ready` | `boolean` | Both players are in — show Ready button |
| `timer_update` | `number` | Pre-race countdown (10 → 0) |
| `start_race` | `true` | Countdown done — race begins |
| `game_timer_update` | `number` | In-race timer (120 → 0) |
| `receive_progress` | progress object | Opponent's live WPM, accuracy, progress |
| `game_over` | `{ winnerId, players }` | Race ended — final stats and winner |

---

## 🗄️ Database Schema

```sql
CREATE TABLE game_results (
    id          SERIAL PRIMARY KEY,
    player_name TEXT,
    room_code   TEXT,
    wpm         INTEGER,
    accuracy    INTEGER,
    result      TEXT,           -- 'Won' | 'Lost'
    start_time  TIMESTAMP,
    date        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

The `/api/history` endpoint returns the 50 most recent race results, used by the admin dashboard.

---

## 🚀 Running Locally

### Prerequisites
- Node.js 18+
- A PostgreSQL database (local or hosted)

### 1. Clone the repository
```bash
git clone https://github.com/KunalSoyane/typing-racer.git
cd typing-racer
```

### 2. Start the backend
```bash
cd server
npm install
```

Open `index.js` and replace `DB_URL` with your own PostgreSQL connection string, then:
```bash
node index.js
# Server running on http://localhost:3001
```

### 3. Start the frontend
```bash
cd ../client
npm install
```

In `src/App.js`, set `BACKEND_URL` to your local server:
```js
const BACKEND_URL = "http://localhost:3001";
```

Then:
```bash
npm start
# App running on http://localhost:3000
```

### 4. Play
Open two browser tabs, use the same room code, and race yourself!

---

## 🌐 Deployment

| Part | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | Auto-deploys from the `client/` directory |
| Backend | **Render** | Web service running `node index.js` |
| Database | **Render PostgreSQL** | Free-tier PostgreSQL instance |

Make sure to update `BACKEND_URL` in `client/src/App.js` to point to your Render backend URL before building for production.

---

## 📄 License

This project is open source and available for personal and educational use.
