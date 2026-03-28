/** Core task data model */
export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

/** Available filter modes */
export type FilterMode = "all" | "active" | "completed";
