import { mkdir, writeFile } from "node:fs/promises";

const directory = new URL("../dist/types/styles/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("timeline.css.d.ts", directory), "declare const timelineStyles: string;\nexport default timelineStyles;\n", "utf8");
