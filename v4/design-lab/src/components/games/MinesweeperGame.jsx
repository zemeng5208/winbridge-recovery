import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icons.jsx";

const DIFFICULTIES = Object.freeze({
  beginner: { id: "beginner", label: "初级", rows: 9, cols: 9, mines: 10, cellSize: 28 },
  intermediate: { id: "intermediate", label: "中级", rows: 16, cols: 16, mines: 40, cellSize: 22 },
});

function createGame(difficultyId) {
  return {
    difficultyId,
    mines: null,
    revealed: new Set(),
    flagged: new Set(),
    status: "ready",
    elapsed: 0,
  };
}

function neighborsOf(index, rows, cols) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const neighbors = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) neighbors.push(nextRow * cols + nextCol);
    }
  }
  return neighbors;
}

function placeMines(config, firstIndex) {
  const excluded = new Set([firstIndex, ...neighborsOf(firstIndex, config.rows, config.cols)]);
  const candidates = [];
  const total = config.rows * config.cols;
  for (let index = 0; index < total; index += 1) {
    if (!excluded.has(index)) candidates.push(index);
  }
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
  }
  return new Set(candidates.slice(0, config.mines));
}

function adjacentMineCount(index, mines, config) {
  let count = 0;
  for (const neighbor of neighborsOf(index, config.rows, config.cols)) {
    if (mines.has(neighbor)) count += 1;
  }
  return count;
}

function revealArea(startIndex, mines, config, existingRevealed, flagged) {
  const revealed = new Set(existingRevealed);
  const queue = [startIndex];
  const queued = new Set(queue);
  while (queue.length) {
    const index = queue.shift();
    if (revealed.has(index) || mines.has(index) || flagged.has(index)) continue;
    revealed.add(index);
    if (adjacentMineCount(index, mines, config) !== 0) continue;
    for (const neighbor of neighborsOf(index, config.rows, config.cols)) {
      if (!revealed.has(neighbor) && !mines.has(neighbor) && !flagged.has(neighbor) && !queued.has(neighbor)) {
        queued.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return revealed;
}

const STATUS_LABELS = Object.freeze({
  ready: "等待首击",
  running: "排雷中",
  won: "已完成",
  lost: "触雷结束",
});

export default function MinesweeperGame() {
  const [game, setGame] = useState(() => createGame("beginner"));
  const config = DIFFICULTIES[game.difficultyId];

  const restart = (difficultyId = game.difficultyId) => setGame(createGame(difficultyId));

  useEffect(() => {
    if (game.status !== "running") return undefined;
    const timer = window.setInterval(() => {
      setGame((current) => current.status === "running" ? { ...current, elapsed: Math.min(current.elapsed + 1, 999) } : current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const revealCell = (index) => {
    setGame((current) => {
      if (current.status === "won" || current.status === "lost" || current.flagged.has(index) || current.revealed.has(index)) return current;
      const activeConfig = DIFFICULTIES[current.difficultyId];
      const mines = current.mines ?? placeMines(activeConfig, index);
      if (mines.has(index)) return { ...current, mines, status: "lost" };
      const revealed = revealArea(index, mines, activeConfig, current.revealed, current.flagged);
      const safeCellCount = activeConfig.rows * activeConfig.cols - activeConfig.mines;
      return { ...current, mines, revealed, status: revealed.size === safeCellCount ? "won" : "running" };
    });
  };

  const toggleFlag = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    setGame((current) => {
      if (current.status === "won" || current.status === "lost" || current.revealed.has(index)) return current;
      const flagged = new Set(current.flagged);
      if (flagged.has(index)) flagged.delete(index);
      else if (flagged.size < DIFFICULTIES[current.difficultyId].mines) flagged.add(index);
      return { ...current, flagged };
    });
  };

  const cells = useMemo(() => Array.from({ length: config.rows * config.cols }, (_, index) => index), [config.cols, config.rows]);
  const remainingMines = config.mines - game.flagged.size;

  return (
    <div className="local-game minesweeper-game">
      <div className="game-toolbar minesweeper-toolbar">
        <div className="difficulty-switch" role="group" aria-label="扫雷难度">
          {Object.values(DIFFICULTIES).map((difficulty) => <button type="button" key={difficulty.id} className={difficulty.id === game.difficultyId ? "is-selected" : ""} onClick={() => restart(difficulty.id)}>{difficulty.label}</button>)}
        </div>
        <div className="game-metric"><span>剩余雷数</span><strong>{remainingMines}</strong></div>
        <div className="game-metric"><span>时间</span><strong>{String(game.elapsed).padStart(3, "0")}</strong></div>
        <div className={`game-status status-${game.status}`}><i/>{STATUS_LABELS[game.status]}</div>
        <button type="button" className="game-restart-button" onClick={() => restart()}><Icon name="restart" size={15}/>重新开始</button>
      </div>
      <div className="mine-board-viewport">
        <div className="mine-board" role="grid" aria-label={`${config.label}扫雷棋盘`} style={{ "--mine-columns": config.cols, "--mine-cell-size": `${config.cellSize}px` }} onContextMenu={(event) => event.preventDefault()}>
          {cells.map((index) => {
            const revealed = game.revealed.has(index);
            const flagged = game.flagged.has(index);
            const mine = Boolean(game.mines?.has(index));
            const showMine = mine && (game.status === "lost" || game.status === "won");
            const count = revealed && game.mines ? adjacentMineCount(index, game.mines, config) : 0;
            const label = flagged ? `第 ${index + 1} 格，已插旗` : revealed ? `第 ${index + 1} 格，${count ? `相邻 ${count} 个雷` : "空白"}` : `第 ${index + 1} 格，未揭示`;
            return (
              <button
                type="button"
                role="gridcell"
                key={index}
                className={`mine-cell ${revealed ? "is-revealed" : ""} ${flagged ? "is-flagged" : ""} ${showMine ? "has-mine" : ""} ${showMine && game.status === "lost" && !revealed ? "is-exposed-mine" : ""}`}
                aria-label={label}
                disabled={game.status === "won" || game.status === "lost"}
                onClick={() => revealCell(index)}
                onContextMenu={(event) => toggleFlag(event, index)}
              >
                {flagged && !showMine ? <span className="mine-flag-shape" aria-hidden="true"/> : null}
                {showMine ? <span className="mine-dot" aria-hidden="true"/> : null}
                {revealed && !mine && count > 0 ? <b data-count={count}>{count}</b> : null}
              </button>
            );
          })}
          {game.status === "won" || game.status === "lost" ? <div className="mine-result-message"><strong>{game.status === "won" ? "排雷完成" : "本局结束"}</strong><span>{game.status === "won" ? `用时 ${game.elapsed} 秒` : "触雷后可重新开始"}</span><button type="button" onClick={() => restart()}>重新开始</button></div> : null}
        </div>
      </div>
      <p className="game-help">左键揭示，右键插旗。首次揭示格及其周围区域不会布雷。</p>
    </div>
  );
}
