/**
 * Transport control icons.
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
