export interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const BASE = "/api/todos";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  list(filter: "all" | "active" | "completed"): Promise<Todo[]> {
    const query = filter === "all" ? "" : `?completed=${filter === "completed"}`;
    return request<Todo[]>(`${BASE}${query}`);
  },
  create(title: string): Promise<Todo> {
    return request<Todo>(BASE, { method: "POST", body: JSON.stringify({ title }) });
  },
  update(id: number, data: Partial<Pick<Todo, "title" | "completed">>): Promise<Todo> {
    return request<Todo>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  remove(id: number): Promise<void> {
    return request<void>(`${BASE}/${id}`, { method: "DELETE" });
  },
};
