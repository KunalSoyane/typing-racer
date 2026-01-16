/* client/src/App.js */
import './App.css';
import io from 'socket.io-client';
import { useEffect, useState, useRef } from 'react';

// -------------------------------------------------------------------------
// 🌍 CONFIGURATION: LOCALHOST MODE
// -------------------------------------------------------------------------
const BACKEND_URL = "https://typing-racer-exgr.onrender.com"; 
const socket = io.connect(BACKEND_URL); 

function App() {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Admin Dashboard State
  const [showAdmin, setShowAdmin] = useState(false);
  const [historyData, setHistoryData] = useState([]);

  // Game States
  const [timer, setTimer] = useState(null);
  const [gameTimer, setGameTimer] = useState(120);
  const [gameStart, setGameStart] = useState(false);
  const [bothConnected, setBothConnected] = useState(false);
  const [isMyReady, setIsMyReady] = useState(false);
  
  // Data
  const [paragraph, setParagraph] = useState("");
  const [userInput, setUserInput] = useState(""); 
  const [winner, setWinner] = useState(null); 
  
  // Stats
  const [myProgress, setMyProgress] = useState(0);
  const [myWpm, setMyWpm] = useState(0);
  const [myAccuracy, setMyAccuracy] = useState(100);
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
      // ✅ UPDATE LOCAL STATS WITH SERVER "OFFICIAL" STATS
      if (data.players && data.players[socket.id]) {
          setMyWpm(data.players[socket.id].wpm);
          setMyAccuracy(data.players[socket.id].accuracy);
      }
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
    if (room.trim() !== "" && name.trim() !== "") {
        socket.emit("join_room", { roomCode: room, playerName: name });
    } else {
        setErrorMsg("Please enter Name and Room Code!");
    }
  };

  const goHome = () => {
    setIsJoined(false);
    setRoom("");
    setGameStart(false);
    setWinner(null);
    setTimer(null);
    setBothConnected(false);
    setIsMyReady(false);
    setUserInput("");
    setMyProgress(0);
    setOppProgress(0);
    setMyWpm(0);
    setOppWpm(0);
    window.location.reload(); 
  };

  const handleReady = () => {
    setIsMyReady(true);
    socket.emit("player_ready", room);
  };

  const handleAdminLogin = () => {
    const password = prompt("Enter Admin Password:");
    if (password === "ITSA2026") {
        fetchHistory();
    } else if (password !== null) {
        alert("❌ Access Denied: Wrong Password");
    }
  };

  const fetchHistory = async () => {
    try {
        const res = await fetch(`${BACKEND_URL}/api/history`);
        const data = await res.json();
        setHistoryData(data);
        setShowAdmin(true);
    } catch (err) {
        console.error("Error fetching history:", err);
        alert("Could not load history. Make sure 'node index.js' is running!");
    }
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
    
    const totalLength = paragraph.length || 1; 
    const percentage = Math.floor((value.length / totalLength) * 100);
    setMyProgress(percentage);
    
    socket.emit("send_progress", { 
        roomCode: room, 
        progressPercent: percentage,
        wpm: stats?.wpm,
        accuracy: stats?.accuracy,
        charCount: value.length,
        correctChars: stats?.correctChars 
    });

    // 🔒 FIX: Only finish if text matches AND is not empty
    if (value.length > 0 && value === paragraph) {
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
      return <span key={index} className={className}>{char}</span>;
    });
  };

  if (showAdmin) {
      return (
          <div className="App">
              <h1>📊 Game History Dashboard</h1>
              <button className="join-btn" onClick={() => setShowAdmin(false)} style={{marginBottom:'20px'}}>Back to Lobby</button>
              
              <table border="1" style={{width:'100%', borderCollapse:'collapse', background:'white'}}>
                  <thead>
                      <tr style={{background:'#2c3e50', color:'white'}}>
                          <th style={{padding:'10px'}}>Match Start Time</th>
                          <th style={{padding:'10px'}}>Player Name</th>
                          <th style={{padding:'10px'}}>Room</th>
                          <th style={{padding:'10px'}}>Result</th>
                          <th style={{padding:'10px'}}>WPM</th>
                          <th style={{padding:'10px'}}>Accuracy</th>
                      </tr>
                  </thead>
                  <tbody>
                      {historyData.map((game, index) => (
                          <tr key={index} style={{textAlign:'center', height:'40px'}}>
                              <td>{new Date(game.startTime).toLocaleString()}</td>
                              <td>{game.playerName}</td>
                              <td>{game.roomCode}</td>
                              <td style={{
                                  color: game.result === "Won" ? "green" : game.result === "Lost" ? "red" : "orange",
                                  fontWeight: "bold"
                              }}>{game.result}</td>
                              <td>{game.wpm}</td>
                              <td>{game.accuracy}%</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      );
  }

  return (
    <div className="App">
      {/* 🔒 ADMIN BUTTON: Only shows if NOT joined (Home Page Only) */}
      {!isJoined && (
          <button 
            onClick={handleAdminLogin}
            style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                padding: '10px 20px',
                background: '#2c3e50',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold',
                zIndex: 1000
            }}
          >
            Admin Login 🔒
          </button>
      )}

      <h1>🏁 Type Racer Pro</h1>

      {!isJoined ? (
        <div className="lobby-container">
          <h3>Enter Race Arena</h3>
          
          <input 
              className="room-input"
              type="text" 
              placeholder="Your Name" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{marginBottom:'10px', display:'block', width:'100%', boxSizing:'border-box'}}
          />

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
            <div className="room-id">
                ROOM: {room} 
                {!timer && !gameStart && (
                    <button 
                        onClick={goHome} 
                        style={{marginLeft:'15px', padding:'5px 10px', fontSize:'12px', background:'#e74c3c', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}
                    >
                        Exit
                    </button>
                )}
            </div>
            {gameStart && !winner && <div className="game-timer">{gameTimer}s</div>}
          </div>

          {winner && (
            <div className={`result-banner ${winner === "Me" ? "win" : winner === "Opponent" ? "lose" : "draw"}`}>
                <h1>{winner === "Me" ? "🏆 VICTORY!" : winner === "Opponent" ? "💀 DEFEAT" : "🤝 DRAW"}</h1>
                
                {/* 🌟 DISPLAY OFFICIAL WPM USED FOR RESULT */}
                <p style={{fontSize:'1.2rem'}}>
                    Final WPM: <strong>{myWpm}</strong> <small>(Official)</small> | Accuracy: <strong>{myAccuracy}%</strong>
                </p>
                
                <button 
                    className="join-btn" 
                    onClick={goHome}
                    style={{
                        marginTop: '20px', 
                        background: 'white', 
                        color: '#333', 
                        fontWeight: 'bold'
                    }}
                >
                    🏠 Back to Home
                </button>
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