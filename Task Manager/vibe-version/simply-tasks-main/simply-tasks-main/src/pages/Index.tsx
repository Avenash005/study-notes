import { useTasks } from "@/hooks/useTasks";
import TaskInput from "@/components/tasks/TaskInput";
import TaskList from "@/components/tasks/TaskList";
import TaskFilter from "@/components/tasks/TaskFilter";
import { CheckSquare } from "lucide-react";

/**
 * Main page — a single-view task manager.
 * All state lives in the useTasks hook for clean separation.
 */
const Index = () => {
  const { tasks, filter, counts, setFilter, addTask, toggleTask, deleteTask } =
    useTasks();

  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <CheckSquare size={20} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
              Tasks
            </h1>
            <p className="text-sm text-muted-foreground">
              {counts.active === 0
                ? "All clear."
                : `${counts.active} task${counts.active !== 1 ? "s" : ""} remaining`}
            </p>
          </div>
        </div>

        {/* Add task input */}
        <div className="mb-6">
          <TaskInput onAdd={addTask} />
        </div>

        {/* Filters — only show when tasks exist */}
        {counts.all > 0 && (
          <div className="mb-4">
            <TaskFilter current={filter} counts={counts} onChange={setFilter} />
          </div>
        )}

        {/* Task list */}
        <TaskList tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} />
      </div>
    </div>
  );
};

export default Index;
