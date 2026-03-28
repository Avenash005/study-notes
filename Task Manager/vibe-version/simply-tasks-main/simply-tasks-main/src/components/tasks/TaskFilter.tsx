import type { FilterMode } from "@/types/task";

interface TaskFilterProps {
  current: FilterMode;
  counts: Record<FilterMode, number>;
  onChange: (filter: FilterMode) => void;
}

const filters: { value: FilterMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

/** Filter toggle buttons with task counts */
const TaskFilter = ({ current, counts, onChange }: TaskFilterProps) => {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-1">
      {filters.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            current === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-xs ${
              current === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {counts[value]}
          </span>
        </button>
      ))}
    </div>
  );
};

export default TaskFilter;
