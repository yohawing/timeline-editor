/** Google Material Symbols Outlined, Apache-2.0.
 * https://github.com/google/material-design-icons/tree/master/symbols/web
 */
const paths = {
  undo: "M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z",
  redo: "M396-200q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80H396Z",
};

export function HistoryIcon({ action }: { action: keyof typeof paths }) {
  return <svg width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
    <path d={paths[action]} />
  </svg>;
}
