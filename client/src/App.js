/* client/src/App.js */
import './App.css';
import io from 'socket.io-client';
import { useEffect, useState, useRef } from 'react';

// CHANGE TO YOUR RENDER URL FOR PRODUCTION
// const socket = io.connect("https://your-render-app.onrender.com");
const socket = io.connect("http://localhost:3001"); 

function App() {
  const [room, setRoom] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Game States
  const [timer, setTimer] = useState(null);       // 10s Countdown
  const [gameTimer, setGameTimer] = useState(120); // 120s Race Timer
  const [gameStart, setGameStart] = useState(false);
  const [bothConnected, setBothConnected] = useState(false);
  const [isMyReady, setIsMyReady] = useState(false);
  
  // Data
  const [paragraph, setParagraph] = useState("");
  const [userInput, setUserInput] = useState(""); 
  const [winner, setWinner] = useState(null); 
  
  // Stats (Me)
  const [myProgress, setMyProgress] = useState(0);
  const [myWpm, setMyWpm] = useState(0);
  const [myAccuracy, setMyAccuracy] = useState(100);
  
  // Stats (Opponent)
  const [oppProgress, setOppProgress] = useState(0);
  const [oppWpm, setOppWpm] = useState(0);
  const [oppAccuracy, setOppAccuracy] = useState(100);

  const startTimeRef = useRef(null); 
  const inputRef = useRef(null); 

  useEffect(() => {
    socket.on("room_joined", () => {
        setIsJoined(true);
        setErrorMsg("");
    });
    
    socket.on("error_message", (msg) => setErrorMsg(msg)); 

    socket.on("update_text", (text) => setParagraph(text));

    socket.on("players_connected_wait_ready", () => setBothConnected(true));

    socket.on("timer_update", (time) => setTimer(time));

    socket.on("start_race", () => {
      setGameStart(true);
      setTimer(null);
      startTimeRef.current = Date.now();
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    socket.on("game_timer_update", (time) => setGameTimer(time));

    socket.on("receive_progress", (data) => {
      setOppProgress(data.progressPercent);
      setOppWpm(data.wpm);
      setOppAccuracy(data.accuracy);
    });

    socket.on("game_over", (data) => {
      // 1. UPDATE STATS WITH SERVER RECALCULATION
      if (data.players && data.players[socket.id]) {
          setMyWpm(data.players[socket.id].wpm);
          setMyAccuracy(data.players[socket.id].accuracy);
      }

      // 2. SET WINNER
      if (data.winnerId) {
          setWinner(data.winnerId === socket.id ? "Me" : "Opponent");
      } else {
          setWinner("Draw");
      }
      setTimer("Finished");
    });

    return () => socket.off(); 
  }, []);

  const joinRoom = () => {
    if (room.trim() !== "") socket.emit("join_room", room);
  };

  const handleReady = () => {
    setIsMyReady(true);
    socket.emit("player_ready", room);
  };

  const calculateStats = (inputVal) => {
    if (!startTimeRef.current) return;

    let correctChars = 0;
    for (let i = 0; i < inputVal.length; i++) {
        if (inputVal[i] === paragraph[i]) correctChars++;
    }
    const accuracy = Math.round((correctChars / inputVal.length) * 100) || 100;
    const timeElapsedMin = (Date.now() - startTimeRef.current) / 60000;
    const wpm = Math.round((inputVal.length / 5) / timeElapsedMin) || 0;

    return { wpm, accuracy, correctChars };
  };

  const handleTyping = (e) => {
    if (winner || !gameStart) return;

    const value = e.target.value;
    setUserInput(value);

    const stats = calculateStats(value);
    setMyWpm(stats?.wpm || 0);
    setMyAccuracy(stats?.accuracy || 100);

    const percentage = Math.floor((value.length / paragraph.length) * 100);
    setMyProgress(percentage);

    socket.emit("send_progress", { 
        roomCode: room, 
        progressPercent: percentage,
        wpm: stats?.wpm,
        accuracy: stats?.accuracy,
        charCount: value.length,
        correctChars: stats?.correctChars 
    });

    if (value === paragraph) {
      socket.emit("player_finished", { roomCode: room });
    }
  };

  const renderParagraph = () => {
    return paragraph.split("").map((char, index) => {
      let className = "char";
      const typedChar = userInput[index];

      if (typedChar === undefined) {
        if (index === userInput.length) className += " active"; 
      } else if (typedChar === char) {
        className += " correct";
      } else {
        className += " incorrect";
      }

      return (
        <span key={index} className={className}>
          {char}
        </span>
      );
    });
  };

  return (
    <div className="App">
      <h1>🏁 Type Racer Pro</h1>

      {!isJoined ? (
        <div className="lobby-container">
          <h3>Enter Race Arena</h3>
          <div className="input-group">
            <input 
                className="room-input"
                type="text" 
                placeholder="Room Code (e.g. 505)" 
                onChange={(e) => setRoom(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
            />
            <button className="join-btn" onClick={joinRoom}>JOIN</button>
          </div>
          {errorMsg && <p className="error-msg">{errorMsg}</p>}
        </div>
      ) : (
        <div className="game-area">
          <div className="stats-board">
            <div className="room-id">ROOM: {room}</div>
            {gameStart && !winner && <div className="game-timer">{gameTimer}s</div>}
          </div>

          {/* --- WINNER BANNER (SHOWS FINAL WPM, NO CHAR COUNT) --- */}
          {winner && (
            <div className={`result-banner ${winner === "Me" ? "win" : winner === "Opponent" ? "lose" : "draw"}`}>
                <h1>{winner === "Me" ? "🏆 VICTORY!" : winner === "Opponent" ? "💀 DEFEAT" : "🤝 DRAW"}</h1>
                <p>
                  Final WPM: {myWpm} | Accuracy: {myAccuracy}%
                </p>
            </div>
          )}

          {!gameStart && !winner && (
              <div className="ready-section">
                  {!bothConnected ? (
                      <p>Waiting for opponent to join...</p>
                  ) : timer ? (
                      <div className="countdown-overlay">{timer}</div>
                  ) : (
                      <>
                        <p>Opponent is here! Ready to race?</p>
                        <button 
                            className={`ready-btn ${isMyReady ? "waiting" : ""}`} 
                            onClick={handleReady} 
                            disabled={isMyReady}
                        >
                            {isMyReady ? "WAITING FOR OPPONENT..." : "I'M READY!"}
                        </button>
                      </>
                  )}
              </div>
          )}

          {gameStart && !winner && (
             <div className="typing-area" onClick={() => inputRef.current.focus()}>
                {renderParagraph()}
                <textarea 
                    ref={inputRef}
                    className="hidden-input"
                    value={userInput}
                    onChange={handleTyping}
                    autoFocus
                    spellCheck="false"
                ></textarea>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;