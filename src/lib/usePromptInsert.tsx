"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type Inserter = (text: string) => void;

const PromptInsertContext = createContext<Inserter>(() => {});

export function PromptInsertProvider({
  insert,
  children,
}: {
  insert: Inserter;
  children: ReactNode;
}) {
  const value = useMemo(() => insert, [insert]);
  return (
    <PromptInsertContext.Provider value={value}>
      {children}
    </PromptInsertContext.Provider>
  );
}

/**
 * Call to insert text into the prompt textarea at the current cursor
 * position (or append if the textarea is not mounted / out of context).
 */
export function usePromptInsert(): Inserter {
  return useContext(PromptInsertContext);
}
