import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Task } from "./types.ts";

const DATA_FILE = fileURLToPath(new URL("../tasks.json", import.meta.url));

export function loadTasks(): Task[] {
  if (!existsSync(DATA_FILE)) return [];
  return JSON.parse(readFileSync(DATA_FILE, "utf8")) as Task[];
}

export function saveTasks(tasks: Task[]): void {
  writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2) + "\n");
}
