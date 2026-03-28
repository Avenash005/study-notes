import { memo, useCallback } from "react";
import { Trash2, Check } from "lucide-react";
import type { Task } from "@/types/task";

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Single task row with checkbox and delete action */
const TaskItem = memo(({ task, onToggle, onDelete }: TaskItemProps) => {
  const handleToggle = useCallback(() => onToggle(task.id), [task.id, onToggle]);
  const handleDelete = useCallback(() => onDelete(task.id), [task.id, onDelete]);

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-all hover:shadow-sm">
      {/* Custom checkbox */}
      <button
        onClick={handleToggle}
        aria-label={task.completed ? "Mark as incomplete" : "Mark as complete"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
          task.completed
            ? "border-complete bg-complete"
            : "border-muted-foreground/30 hover:border-muted-foreground/60"
        }`}
      >
        {task.completed && <Check size={12} strokeWidth={3} className="text-accent-foreground" />}
      </button>

      {/* Task text */}
      <span
        className={`flex-1 text-sm leading-relaxed transition-all ${
          task.completed
            ? "text-muted-foreground line-through decoration-muted-foreground/40"
            : "text-foreground"
        }`}
      >
        {task.text}
      </span>

      {/* Delete button — visible on hover/focus */}
      <button
        onClick={handleDelete}
        aria-label="Delete task"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
});

TaskItem.displayName = "TaskItem";

export default TaskItem;
