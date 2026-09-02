import { saveTasks } from "./src/store.ts";
import type { Priority, Status, Task } from "./src/types.ts";

const assignees = ["Asha", "Ravi", "Meera"];
const priorities: Priority[] = ["low", "medium", "high"];
const statuses: Status[] = ["todo", "in-progress", "done"];
const titles = [
  "Set up CI pipeline",
  "Fix login bug",
  "Write API docs",
  "Refactor auth module",
  "Add unit tests",
  "Migrate database schema",
  "Improve error logging",
  "Update dependencies",
  "Design onboarding flow",
  "Optimize query performance",
  "Review pull requests",
  "Patch security vulnerability",
  "Implement rate limiting",
  "Add dark mode",
  "Clean up legacy code",
  "Write release notes",
  "Configure monitoring",
  "Fix flaky test",
];

const tasks: Task[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  title: `${titles[i % titles.length]} #${i + 1}`,
  status: statuses[i % statuses.length],
  priority: priorities[(i * 7) % priorities.length],
  assignee: assignees[i % assignees.length],
  createdAt: new Date(Date.UTC(2026, 8, 1, 9, 0, 0) + i * 3_600_000).toISOString(),
}));

saveTasks(tasks);
console.log(JSON.stringify(tasks, null, 1));
