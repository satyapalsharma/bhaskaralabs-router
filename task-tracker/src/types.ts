export type Status = "todo" | "in-progress" | "done";
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: number;
  title: string;
  status: Status;
  priority: Priority;
  assignee: string;
  createdAt: string;
}
