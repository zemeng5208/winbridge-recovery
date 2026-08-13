const paths = {
  gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.9 1.9-.06-.06A1.7 1.7 0 0 0 16 18.45a1.7 1.7 0 0 0-1 .55 1.7 1.7 0 0 0-.45 1.13V20.2h-2.7v-.08A1.7 1.7 0 0 0 10.6 18.5a1.7 1.7 0 0 0-1.48.28l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 7.55 15a1.7 1.7 0 0 0-.55-1 1.7 1.7 0 0 0-1.13-.45H5.8v-2.7h.08A1.7 1.7 0 0 0 7.5 9.6a1.7 1.7 0 0 0-.28-1.48l-.06-.06 1.9-1.9.06.06A1.7 1.7 0 0 0 11 6.55a1.7 1.7 0 0 0 1-.55 1.7 1.7 0 0 0 .45-1.13V4.8h2.7v.08A1.7 1.7 0 0 0 16.4 6.5a1.7 1.7 0 0 0 1.48-.28l.06-.06 1.9 1.9-.06.06A1.7 1.7 0 0 0 19.45 10c.36.28.72.45 1.13.45h.08v2.7h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
  shield: <><path d="M12 3 5.5 5.5v5.3c0 4 2.6 7.6 6.5 9.2 3.9-1.6 6.5-5.2 6.5-9.2V5.5L12 3Z"/><path d="m9.2 11.8 1.8 1.8 3.9-4.2"/></>,
  terminal: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m7 9 3 3-3 3M12.5 15H17"/></>,
  game: <><path d="M8 8h8a4.5 4.5 0 0 1 4.2 6.2l-1 2.4a2.2 2.2 0 0 1-3.5.8L14 16h-4l-1.7 1.4a2.2 2.2 0 0 1-3.5-.8l-1-2.4A4.5 4.5 0 0 1 8 8Z"/><path d="M8 11v4M6 13h4M16 11.8h.01M18 14.2h.01"/></>,
  palette: <><path d="M12 4a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 1.2-3.1 1.8 1.8 0 0 1 1.2-3.1H18a2 2 0 0 0 2-2A8 8 0 0 0 12 4Z"/><path d="M8 10h.01M11 7h.01M15 8h.01M7 14h.01"/></>,
  eye: <><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2.5"/></>,
  settings: <><path d="M4 6h10M17 6h3M4 12h3M10 12h10M4 18h8M15 18h5"/><circle cx="15.5" cy="6" r="1.5"/><circle cx="8.5" cy="12" r="1.5"/><circle cx="13.5" cy="18" r="1.5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 20h14"/></>,
  back: <><path d="m10 6-6 6 6 6"/><path d="M4 12h16"/></>,
  restart: <><path d="M5.2 8.2A8 8 0 1 1 4 13"/><path d="M5 4v4.6h4.6"/></>,
  play: <path d="m8 5 11 7-11 7V5Z"/>,
  pause: <><path d="M8 5v14M16 5v14"/></>,
  up: <><path d="m7 14 5-5 5 5"/></>,
  down: <><path d="m7 10 5 5 5-5"/></>,
  left: <><path d="m14 7-5 5 5 5"/></>,
  right: <><path d="m10 7 5 5-5 5"/></>,
  spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18.5 14 .7 2.2 2.3.8-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></>,
};

export function Icon({ name, size = 18, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}
