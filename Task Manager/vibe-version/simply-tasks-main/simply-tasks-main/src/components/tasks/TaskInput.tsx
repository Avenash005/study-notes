import { useState, useCallback, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";

interface TaskInputProps {
  onAdd: (text: string) => void;
}

/** Input field for adding new tasks */
const TaskInput = ({ onAdd }: TaskInputProps) => {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    if (value.trim()) {
      onAdd(value);
      setValue("");
    }
  }, [value, onAdd]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSubmit();
    },
    [handleSubmit]
  );

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What needs to be done?"
        className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:ring-2 focus:ring-ring/20"
        autoFocus
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={18} strokeWidth={2.5} />
        <span className="hidden sm:inline">Add</span>
      </button>
    </div>
  );
};

export default TaskInput;
