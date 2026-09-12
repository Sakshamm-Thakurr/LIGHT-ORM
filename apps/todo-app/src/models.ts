// This file only imports from the published package entry point -
// never from `@sakshamthakur/light-orm/dist/...` or any internal path.
import { boolean, defineModel, number, string } from "@sakshamthakur/light-orm";

export const Todo = defineModel("todo", {
  id: number().primaryKey().autoIncrement(),
  title: string().notNull(),
  completed: boolean().notNull().default(false),
});
