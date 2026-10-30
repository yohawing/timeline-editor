const paths = {
  group: "M1 3h5l1 2h6v7H1z",
  audio: "M2 5h2l3-3v10l-3-3H2z M9 5c1 1 1 3 0 4 M11 3c2 2 2 6 0 8",
  animation: "M2 2h10v10H2z M5 4.5l4 2.5-4 2.5z",
  event: "M8 1L3 8h4l-1 5 5-7H7z",
};

export function TrackIcon({ type }: { type: keyof typeof paths }) {
  return <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true" data-track-type={type}>
    <path d={paths[type]} />
  </svg>;
}
