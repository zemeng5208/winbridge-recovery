import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icons.jsx";
import MinesweeperGame from "./MinesweeperGame.jsx";
import SnakeGame from "./SnakeGame.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

const GAME_LABELS = Object.freeze({
  snake: "Snake",
  minesweeper: "Minesweeper",
});

function GameSelection({ onSelect }) {
  const t = useI18n();
  return (
    <div className="game-grid" aria-label={t("games.selectAria")}>
      <button type="button" className="game-option" onClick={() => onSelect("snake")}>
        <span className="snake-preview" aria-hidden="true"><i/><i/><i/><i/><b/></span>
        <strong>Snake</strong>
        <small>{t("games.snakeHint")}</small>
      </button>
      <button type="button" className="game-option" onClick={() => onSelect("minesweeper")}>
        <span className="mine-preview" aria-hidden="true"><i>1</i><i>2</i><i className="preview-flag"/><i>3</i></span>
        <strong>Minesweeper</strong>
        <small>{t("games.minesweeperHint")}</small>
      </button>
    </div>
  );
}

export default function GameCenter({ onClose, onGameActiveChange, appearanceClass = "", appearanceStyle }) {
  const t = useI18n();
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
      <section className={`game-chooser ${selectedGame ? "is-playing" : "is-selecting"}`} role="dialog" aria-modal="true" aria-label={selectedGame ? t("games.dialogAriaSelected", { game: GAME_LABELS[selectedGame] }) : t("games.dialogAriaSelect")}>
        <header className="game-center-header">
          <div>
            <Icon name="game" size={18} />
            <div><strong>{selectedGame ? GAME_LABELS[selectedGame] : t("games.title")}</strong><span>{selectedGame ? t("games.subtitlePlaying") : t("games.subtitleSelect")}</span></div>
          </div>
          <nav aria-label={t("games.navAria")}>
            {selectedGame ? <button type="button" aria-label={t("games.backAria")} title={t("games.backTitle")} onClick={returnToSelection}><Icon name="back" size={16}/></button> : null}
            {selectedGame ? <button type="button" aria-label={t("games.restartAria")} title={t("games.restart")} onClick={() => setSessionKey((current) => current + 1)}><Icon name="restart" size={16}/></button> : null}
            <button type="button" aria-label={t("games.closeAria")} title={t("games.close")} onClick={onClose}><Icon name="close" size={16}/></button>
          </nav>
        </header>
        {selectedGame === "snake" ? <SnakeGame key={`snake-${sessionKey}`} /> : null}
        {selectedGame === "minesweeper" ? <MinesweeperGame key={`minesweeper-${sessionKey}`} /> : null}
        {!selectedGame ? <GameSelection onSelect={selectGame} /> : null}
        {!selectedGame ? <p>{t("games.footer")}</p> : null}
      </section>
    </div>,
    document.body
  );
}
