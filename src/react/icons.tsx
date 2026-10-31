/**
 * Timeline control icons (Snap is attributed separately below).
 *
 * Sourced from Google Material Symbols (Outlined) via the material-design-icons
 * repository (https://github.com/google/material-design-icons), licensed under
 * the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0).
 * Paths are embedded verbatim as inline React components; `fill="currentColor"`
 * so each icon follows the surrounding button's text color.
 */
import type { ReactElement, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function icon(path: string) {
  return function Icon(props: IconProps): ReactElement {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        height="16"
        width="16"
        viewBox="0 -960 960 960"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d={path} />
      </svg>
    );
  };
}

export const PlayIcon = icon("M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z");
export const PauseIcon = icon("M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Zm400-80h80v-400h-80v400Zm-320 0h80v-400h-80v400Zm0-400v400-400Zm320 0v400-400Z");
export const SkipPreviousIcon = icon("M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Zm-80-240Zm0 90v-180l-136 90 136 90Z");
export const SkipNextIcon = icon("M660-240v-480h80v480h-80Zm-440 0v-480l360 240-360 240Zm80-240Zm0 90 136-90-136-90v180Z");
export const NavigateBeforeIcon = icon("M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z");
export const NavigateNextIcon = icon("M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z");
export const RepeatIcon = icon("M280-80 120-240l160-160 56 58-62 62h406v-160h80v240H274l62 62-56 58Zm-80-440v-240h486l-62-62 56-58 160 160-160 160-56-58 62-62H280v160h-80Z");

export const SettingsIcon = icon("m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z");

// Magnet: Lucide (ISC); copyright and permission notice are included in LICENSE.
// https://github.com/lucide-icons/lucide/blob/main/icons/magnet.svg
export function SnapIcon(props: IconProps): ReactElement {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    <path d="m12 15 4 4" />
    <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z" />
    <path d="m5 8 4 4" />
  </svg>;
}
