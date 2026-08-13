import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icons.jsx";

const COLS = 24;
const ROWS = 16;
const CELL_COUNT = COLS * ROWS;
const TICK_MS = 115;
const INITIAL_SNAKE = Object.freeze([
  { x: 7, y: 8 },
  { x: 6, y: 8 },
  { x: 5, y: 8 },
]);
const INITIAL_DIRECTION = Object.freeze({ x: 1, y: 0 });
const DIRECTION_KEYS = Object.freeze({
  ArrowUp: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  W: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  S: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  A: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
  D: { x: 1, y: 0 },
});

function pointKey(point) {
  return `${point.x}:${point.y}`;
}

function createFood(snake) {
  const occupied = new Set(snake.map(pointKey));
  const freeCells = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!occupied.has(`${x}:${y}`)) freeCells.push({ x, y });
    }
  }
  return freeCells.length ? freeCells[Math.floor(Math.random() * freeCells.length)] : null;
}

function initialSnakeState() {
  const snake = INITIAL_SNAKE.map((point) => ({ ...point }));
  return { snake, food: createFood(snake), score: 0, status: "idle" };
}

const STATUS_LABELS = Object.freeze({
  idle: "等待开始",
  running: "进行中",
  paused: "已暂停",
  gameover: "游戏结束",
  won: "已完成棋盘",
});

export default function SnakeGame() {
  const [game, setGame] = useState(initialSnakeState);
  const directionRef = useRef({ ...INITIAL_DIRECTION });
  const queuedDirectionRef = useRef({ ...INITIAL_DIRECTION });
  const boardRef = useRef(null);

  const restart = useCallback(() => {
    directionRef.current = { ...INITIAL_DIRECTION };
    queuedDirectionRef.current = { ...INITIAL_DIRECTION };
    setGame(initialSnakeState());
    boardRef.current?.focus();
  }, []);

  const requestDirection = useCallback((nextDirection) => {
    const currentDirection = directionRef.current;
    if (currentDirection.x + nextDirection.x === 0 && currentDirection.y + nextDirection.y === 0) return;
    queuedDirectionRef.current = nextDirection;
    setGame((current) => current.status === "idle" ? { ...current, status: "running" } : current);
  }, []);

  const toggleRunning = useCallback(() => {
    setGame((current) => {
      if (current.status === "gameover" || current.status === "won") return current;
      return { ...current, status: current.status === "running" ? "paused" : "running" };
    });
    boardRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const nextDirection = DIRECTION_KEYS[event.key];
      const isToggle = event.key === " " || event.key === "Spacebar";
      const isRestart = event.key === "r" || event.key === "R";
      if (!nextDirection && !isToggle && !isRestart) return;
      if (event.target instanceof HTMLElement && event.target.closest("button, input, select, textarea")) return;
      event.preventDefault();
      event.stopPropagation();
      if (nextDirection) requestDirection(nextDirection);
      else if (isToggle) toggleRunning();
      else restart();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [requestDirection, restart, toggleRunning]);

  useEffect(() => {
    boardRef.current?.focus();
  }, []);

  useEffect(() => {
    if (game.status !== "running") return undefined;
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "running") return current;
        const direction = queuedDirectionRef.current;
        directionRef.current = direction;
        const head = current.snake[0];
        const nextHead = { x: head.x + direction.x, y: head.y + direction.y };
        const hitWall = nextHead.x < 0 || nextHead.x >= COLS || nextHead.y < 0 || nextHead.y >= ROWS;
        const ateFood = current.food && nextHead.x === current.food.x && nextHead.y === current.food.y;
        const collisionBody = ateFood ? current.snake : current.snake.slice(0, -1);
        const hitSelf = collisionBody.some((point) => point.x === nextHead.x && point.y === nextHead.y);
        if (hitWall || hitSelf) return { ...current, status: "gameover" };

        const snake = [nextHead, ...current.snake];
        if (!ateFood) snake.pop();
        if (!ateFood) return { ...current, snake };

        const food = createFood(snake);
        return { snake, food, score: current.score + 10, status: food ? "running" : "won" };
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const snakeCells = useMemo(() => new Map(game.snake.map((point, index) => [pointKey(point), index])), [game.snake]);
  const cells = useMemo(() => Array.from({ length: CELL_COUNT }, (_, index) => ({ x: index % COLS, y: Math.floor(index / COLS) })), []);
  const ended = game.status === "gameover" || game.status === "won";
  const pointerDirection = (event, direction) => {
    event.preventDefault();
    requestDirection(direction);
    boardRef.current?.focus();
  };

  return (
    <div className="local-game snake-game">
      <div className="game-toolbar">
        <div className="game-metric"><span>分数</span><strong>{game.score}</strong></div>
        <div className={`game-status status-${game.status}`}><i/>{STATUS_LABELS[game.status]}</div>
        <div className="game-toolbar-actions">
          <button type="button" onClick={toggleRunning} disabled={ended}><Icon name={game.status === "running" ? "pause" : "play"} size={15}/>{game.status === "running" ? "暂停" : game.status === "paused" ? "继续" : "开始"}</button>
          <button type="button" onClick={restart}><Icon name="restart" size={15}/>重新开始</button>
        </div>
      </div>
      <div className="snake-board-viewport">
        <div ref={boardRef} className="snake-board" tabIndex={-1} role="application" aria-label="Snake 棋盘，使用方向键或 WASD 控制" onPointerDown={() => boardRef.current?.focus()}>
          {cells.map((cell) => {
            const segmentIndex = snakeCells.get(`${cell.x}:${cell.y}`);
            const hasSnake = segmentIndex !== undefined;
            const hasFood = game.food?.x === cell.x && game.food?.y === cell.y;
            return <span key={`${cell.x}-${cell.y}`} className={`snake-cell ${hasSnake ? (segmentIndex === 0 ? "is-head" : "is-body") : ""} ${hasFood ? "has-food" : ""}`}>{hasFood ? <i aria-hidden="true"/> : null}</span>;
          })}
          {ended ? <div className="game-board-message"><strong>{game.status === "won" ? "棋盘完成" : "本局结束"}</strong><span>得分 {game.score}</span><button type="button" onClick={restart}>重新开始</button></div> : null}
        </div>
      </div>
      <div className="snake-controls" aria-label="Snake 方向控制">
        <button type="button" aria-label="向上" onPointerDown={(event) => pointerDirection(event, DIRECTION_KEYS.ArrowUp)}><Icon name="up" size={15}/></button>
        <button type="button" aria-label="向左" onPointerDown={(event) => pointerDirection(event, DIRECTION_KEYS.ArrowLeft)}><Icon name="left" size={15}/></button>
        <button type="button" aria-label="向下" onPointerDown={(event) => pointerDirection(event, DIRECTION_KEYS.ArrowDown)}><Icon name="down" size={15}/></button>
        <button type="button" aria-label="向右" onPointerDown={(event) => pointerDirection(event, DIRECTION_KEYS.ArrowRight)}><Icon name="right" size={15}/></button>
        <span>方向键 / WASD 控制，空格暂停，R 重开</span>
      </div>
    </div>
  );
}
