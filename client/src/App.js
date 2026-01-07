import './App.css';
import io from 'socket.io-client';
import { useEffect, useState, useRef } from 'react';

const socket = io.connect("https://typing-racer-exgr.onrender.com/");

function App() {
  const [room, setRoom] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  
  // Game States
  const [timer, setTimer] = useState(null);       // The 10s Countdown
  const [gameTimer, setGameTimer] = useState(120); // The 120s Race Timer
  const [gameStart, setGameStart] = useState(false);
  const [bothConnected, setBothConnected] = useState(false); // Wait for opponent
  const [isMyReady, setIsMyReady] = useState(false); // Did I click ready?
  
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

  // Helper to calculate WPM correctly
  const startTimeRef = useRef(null); 

  useEffect(() => {
    socket.on("room_joined", () => setIsJoined(true));
    
    socket.on("update_text", (text) => setParagraph(text));

    socket.on("players_connected_wait_ready", () => setBothConnected(true));

    socket.on("timer_update", (time) => setTimer(time));

    socket.on("start_race", () => {
      setGameStart(true);
      setTimer("GO!");
      startTimeRef.current = Date.now(); // Start the stopwatch for WPM
    });

    socket.on("game_timer_update", (time) => setGameTimer(time));

    socket.on("receive_progress", (data) => {
      setOppProgress(data.progressPercent);
      setOppWpm(data.wpm);
      setOppAccuracy(data.accuracy);
    });

    socket.on("game_over", (data) => {
      if (data.timeout) {
          setWinner("Draw (Time Out!)");
      } else if (data.winnerId === socket.id) {
          setWinner("Me");
      } else {
          setWinner("Opponent");
      }
      setTimer("Finished");
    });

  }, []);

  const joinRoom = () => {
    if (room !== "") socket.emit("join_room", room);
  };

  const handleReady = () => {
    setIsMyReady(true);
    socket.emit("player_ready", room);
  };

  const calculateStats = (inputVal) => {
    if (!startTimeRef.current) return;

    // 1. Accuracy Logic
    let correctChars = 0;
    for (let i = 0; i < inputVal.length; i++) {
        if (inputVal[i] === paragraph[i]) correctChars++;
    }
    const accuracy = Math.round((correctChars / inputVal.length) * 100) || 100;

    // 2. WPM Logic (Standard: 5 chars = 1 word)
    const timeElapsedMin = (Date.now() - startTimeRef.current) / 60000;
    const wpm = Math.round((inputVal.length / 5) / timeElapsedMin) || 0;

    return { wpm, accuracy };
  };

  const handleTyping = (e) => {
    if (winner) return;

    const value = e.target.value;
    setUserInput(value);

    // Calculate Stats
    const stats = calculateStats(value);
    setMyWpm(stats?.wpm || 0);
    setMyAccuracy(stats?.accuracy || 100);

    // Progress
    const percentage = Math.floor((value.length / paragraph.length) * 100);
    setMyProgress(percentage);

    // Send Everything to Server
    socket.emit("send_progress", { 
        roomCode: room, 
        progressPercent: percentage,
        wpm: stats?.wpm,
        accuracy: stats?.accuracy 
    });

    if (value === paragraph) {
      socket.emit("player_finished", { roomCode: room });
    }
  };

  return (
    <div className="App">
      <h1>Type Racer Pro</h1>

      {!isJoined ? (
        <div className="lobby">
          <input type="text" placeholder="Enter Room (e.g. 123)" onChange={(e) => setRoom(e.target.value)} />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <div className="game-area">
          <div className="stats-board">
            <h2>Room: {room}</h2>
            {/* Show 120s Timer only when race starts */}
            {gameStart && <h3 className="game-timer">Time Left: {gameTimer}s</h3>}
          </div>

          {/* WAITING AREA: Show Ready Button */}
          {!gameStart && bothConnected && !winner && (
              <div className="ready-area">
                  <p>Opponent found!</p>
                  {!isMyReady ? (
                      <button className="ready-btn" onClick={handleReady}>I'M READY</button>
                  ) : (
                      <button className="ready-btn disabled" disabled>WAITING FOR OPPONENT...</button>
                  )}
                  {timer !== null && <h1 className="countdown">{timer}</h1>}
              </div>
          )}

          {/* Waiting for 2nd player */}
          {!bothConnected && <p>Waiting for another player to join...</p>}

          {/* GAME AREA */}
          <div className="progress-container">
            <div className="player-stat-row">
                <span>You (WPM: {myWpm} | Acc: {myAccuracy}%)</span>
            </div>
            <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{width: `${myProgress}%`, background: 'green'}}></div>
            </div>
            
            <div className="player-stat-row">
                <span>Opponent (WPM: {oppWpm} | Acc: {oppAccuracy}%)</span>
            </div>
            <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{width: `${oppProgress}%`, background: 'red'}}></div>
            </div>
          </div>

          {winner && (
            <h2 style={{color: winner === "Me" ? "green" : "red"}}>
                {winner === "Me" ? "🏆 YOU WON!" : winner === "Opponent" ? "💀 YOU LOST!" : "Draw!"}
            </h2>
          )}

          {gameStart && (
             <div className="race-track">
                <p className="paragraph">{paragraph}</p>
                <textarea 
                  value={userInput}
                  onChange={handleTyping}
                  disabled={!!winner} 
                  autoFocus
                  spellCheck="false"
                  // Turn text red if typo
                  style={{ 
                    borderColor: userInput === paragraph.substring(0, userInput.length) ? 'black' : 'red',
                    color: userInput === paragraph.substring(0, userInput.length) ? 'black' : 'red'
                  }} 
                ></textarea>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
