import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icons.jsx";
import MinesweeperGame from "./MinesweeperGame.jsx";
import SnakeGame from "./SnakeGame.jsx";

const GAME_LABELS = Object.freeze({
  snake: "Snake",
  minesweeper: "Minesweeper",
});

function GameSelection({ onSelect }) {
  return (
    <div className="game-grid" aria-label="选择小游戏">
      <button type="button" className="game-option" onClick={() => onSelect("snake")}>
        <span className="snake-preview" aria-hidden="true"><i/><i/><i/><i/><b/></span>
        <strong>Snake</strong>
        <small>方向键 / WASD · 暂停 · 重开</small>
      </button>
      <button type="button" className="game-option" onClick={() => onSelect("minesweeper")}>
        <span className="mine-preview" aria-hidden="true"><i>1</i><i>2</i><i className="preview-flag"/><i>3</i></span>
        <strong>Minesweeper</strong>
        <small>首击安全 · 插旗 · 两种难度</small>
      </button>
    </div>
  );
}

export default function GameCenter({ onClose, onGameActiveChange, appearanceClass = "", appearanceStyle }) {
  const [selectedGame, setSelectedGame] = useState(null);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    onGameActiveChange?.(true);
    return () => onGameActiveChange?.(false);
  }, [onGameActiveChange]);

  const selectGame = (game) => {
    setSelectedGame(game);
    setSessionKey((current) => current + 1);
  };

  const returnToSelection = () => {
    setSelectedGame(null);
    setSessionKey((current) => current + 1);
  };

  return createPortal(
    <div className={`inner-modal-backdrop game-modal-backdrop ${appearanceClass}`} style={appearanceStyle}>
      <section className={`game-chooser ${selectedGame ? "is-playing" : "is-selecting"}`} role="dialog" aria-modal="true" aria-label={selectedGame ? `${GAME_LABELS[selectedGame]} 小游戏` : "小游戏选择"}>
        <header className="game-center-header">
          <div>
            <Icon name="game" size={18} />
            <div><strong>{selectedGame ? GAME_LABELS[selectedGame] : "小游戏"}</strong><span>{selectedGame ? "本地离线运行 · 不连接修复引擎" : "先选择一款游戏"}</span></div>
          </div>
          <nav aria-label="小游戏窗口操作">
            {selectedGame ? <button type="button" aria-label="返回小游戏选择" title="返回选择" onClick={returnToSelection}><Icon name="back" size={16}/></button> : null}
            {selectedGame ? <button type="button" aria-label="重新开始当前游戏" title="重新开始" onClick={() => setSessionKey((current) => current + 1)}><Icon name="restart" size={16}/></button> : null}
            <button type="button" aria-label="关闭小游戏" title="关闭" onClick={onClose}><Icon name="close" size={16}/></button>
          </nav>
        </header>
        {selectedGame === "snake" ? <SnakeGame key={`snake-${sessionKey}`} /> : null}
        {selectedGame === "minesweeper" ? <MinesweeperGame key={`minesweeper-${sessionKey}`} /> : null}
        {!selectedGame ? <GameSelection onSelect={selectGame} /> : null}
        {!selectedGame ? <p>两款游戏均在当前窗口内运行；关闭窗口后会立即停止计时与输入监听。</p> : null}
      </section>
    </div>,
    document.body
  );
}
