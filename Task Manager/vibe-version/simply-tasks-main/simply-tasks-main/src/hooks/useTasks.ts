import { useState, useCallback, useMemo } from "react";
import type { Task, FilterMode } from "@/types/task";

/** Generates a simple unique ID */
const generateId = () => crypto.randomUUID();

/**
 * Custom hook encapsulating all task state and operations.
 * Keeps component logic clean and testable.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");

  const addTask = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setTasks((prev) => [
      {
        id: generateId(),
        text: trimmed,
        completed: false,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case "active":
        return tasks.filter((t) => !t.completed);
      case "completed":
        return tasks.filter((t) => t.completed);
      default:
        return tasks;
    }
  }, [tasks, filter]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => !t.completed).length,
      completed: tasks.filter((t) => t.completed).length,
    }),
    [tasks]
  );

  return {
    tasks: filteredTasks,
    filter,
    counts,
    setFilter,
    addTask,
    toggleTask,
    deleteTask,
  };
}
