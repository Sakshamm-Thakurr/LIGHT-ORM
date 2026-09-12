import { useEffect, useMemo, useState } from "react";
import { api, type Todo } from "./api.js";

type Filter = "all" | "active" | "completed";

export function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  async function load(nextFilter: Filter) {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.list(nextFilter);
      setTodos(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load todos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const remainingCount = useMemo(() => todos.filter((t) => !t.completed).length, [todos]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.create(trimmed);
      setTitle("");
      if (filter !== "completed") {
        setTodos((prev) => [...prev, created]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create todo");
    } finally {
      setSubmitting(false);
    }
  }

  function withPending<T>(id: number, fn: () => Promise<T>): Promise<T> {
    setPendingIds((prev) => new Set(prev).add(id));
    return fn().finally(() => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  async function toggleComplete(todo: Todo) {
    const nextCompleted = !todo.completed;
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed: nextCompleted } : t)));
    try {
      await withPending(todo.id, () => api.update(todo.id, { completed: nextCompleted }));
      if (filter !== "all") await load(filter);
    } catch (err) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed: todo.completed } : t)));
      setError(err instanceof Error ? err.message : "Failed to update todo");
    }
  }

  async function remove(todo: Todo) {
    const previous = todos;
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    try {
      await withPending(todo.id, () => api.remove(todo.id));
    } catch (err) {
      setTodos(previous);
      setError(err instanceof Error ? err.message : "Failed to delete todo");
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>Todo</h1>
        <p className="subtitle">
          A demo app for <code>@sakshamthakur/light-orm</code> — every action below runs through the ORM's
          typed <code>create</code>, <code>findMany</code>, <code>update</code> and <code>delete</code>.
        </p>
      </header>

      <form className="composer" onSubmit={handleCreate}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          disabled={submitting}
          aria-label="New todo title"
        />
        <button type="submit" disabled={submitting || title.trim().length === 0}>
          {submitting ? "Adding…" : "Add"}
        </button>
      </form>

      <nav className="filters" aria-label="Filter todos">
        {(["all", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            className={f === filter ? "filter active" : "filter"}
            onClick={() => setFilter(f)}
            type="button"
          >
            {f === "all" ? "All" : f === "active" ? "Active" : "Completed"}
          </button>
        ))}
        <span className="count">{remainingCount} left</span>
      </nav>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : todos.length === 0 ? (
        <p className="empty">
          {filter === "all"
            ? "Nothing here yet — add your first todo above."
            : filter === "active"
              ? "No active todos. Everything's done."
              : "No completed todos yet."}
        </p>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => {
            const isPending = pendingIds.has(todo.id);
            return (
              <li key={todo.id} className={isPending ? "todo-item pending" : "todo-item"}>
                <label>
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleComplete(todo)}
                    disabled={isPending}
                  />
                  <span className={todo.completed ? "title done" : "title"}>{todo.title}</span>
                </label>
                <button
                  type="button"
                  className="delete"
                  onClick={() => remove(todo)}
                  disabled={isPending}
                  aria-label={`Delete "${todo.title}"`}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
