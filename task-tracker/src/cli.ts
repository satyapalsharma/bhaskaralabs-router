import { loadTasks, saveTasks } from "./store.ts";
import type { Priority, Status } from "./types.ts";

const [command, ...args] = process.argv.slice(2);

function nextId(tasks: { id: number }[]): number {
  return tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

switch (command) {
  case "add": {
    const [title, priorityArg, assigneeArg] = args;
    if (!title) {
      console.error("Usage: bun src/cli.ts add <title> [priority] [assignee]");
      process.exit(1);
    }
    const priority: Priority =
      priorityArg === "high" || priorityArg === "low" || priorityArg === "medium"
        ? priorityArg
        : "medium";
    const assignee = assigneeArg ?? "unassigned";
    const tasks = loadTasks();
    const task = {
      id: nextId(tasks),
      title,
      status: "todo" as Status,
      priority,
      assignee,
      createdAt: new Date().toISOString(),
    };
    saveTasks([...tasks, task]);
    console.log("Added:", JSON.stringify(task, null, 2));
    break;
  }
  case "list": {
    for (const t of loadTasks()) {
      console.log(
        `[${t.id}] ${t.title} — ${t.status} / ${t.priority} / ${t.assignee} (${t.createdAt})`
      );
    }
    break;
  }
  case "done": {
    const id = Number(args[0]);
    if (Number.isNaN(id)) {
      console.error("Usage: bun src/cli.ts done <id>");
      process.exit(1);
    }
    const tasks = loadTasks();
    const task = tasks.find((t) => t.id === id);
    if (task === undefined) {
      console.error(`No task with id ${id}`);
      process.exit(1);
    }
    task.status = "done";
    saveTasks(tasks);
    console.log(`Marked task ${id} as done.`);
    break;
  }
  default:
    console.error("Usage: bun src/cli.ts <add|list|done> [args]");
    process.exit(1);
}
