"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { filterPages, type SearchablePage } from "@/data/searchable-pages";
import api from "@/lib/api";

const RECENT_SEARCHES_KEY = "daf-recent-searches";
const MAX_RECENT = 5;

export interface SearchItem {
  id: number | string;
  label: string;
  sublabel?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  balance?: number | null;
  photo?: string | null;
  phone?: string | null;
}

interface CategoryResult {
  items: SearchItem[];
  total: number;
}

export interface QuickSearchResult {
  students: CategoryResult;
  users: CategoryResult;
  teachers: CategoryResult;
  groups: CategoryResult;
  courses: CategoryResult;
}

const emptyResult: QuickSearchResult = {
  students: { items: [], total: 0 },
  users: { items: [], total: 0 },
  teachers: { items: [], total: 0 },
  groups: { items: [], total: 0 },
  courses: { items: [], total: 0 },
};

function loadRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  } catch {
    // localStorage unavailable
  }
}

export function useGlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickSearchResult>(emptyResult);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  const addRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, MAX_RECENT);
      saveRecentSearches(updated);
      return updated;
    });
  }, []);

  const removeRecentSearch = useCallback((term: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s !== term);
      saveRecentSearches(updated);
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    saveRecentSearches([]);
  }, []);

  const latestQuery = useRef("");

  const fetchResults = useDebouncedCallback(async (q: string) => {
    const trimmed = q.trim();
    latestQuery.current = trimmed;

    if (trimmed.length < 2) {
      setResults(emptyResult);
      setIsLoading(false);
      return;
    }

    try {
      const { data } = await api.get<QuickSearchResult>("/search/quick", {
        params: { search: trimmed },
      });
      if (latestQuery.current === trimmed) {
        setResults(data);
      }
    } catch {
      // Search failed — silently fall back to empty results
      if (latestQuery.current === trimmed) {
        setResults(emptyResult);
      }
    } finally {
      if (latestQuery.current === trimmed) {
        setIsLoading(false);
      }
    }
  }, 300);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.trim().length >= 2) {
        setIsLoading(true);
        setIsOpen(true);
      } else {
        setIsOpen(value.trim().length > 0);
      }
      fetchResults(value);
    },
    [fetchResults],
  );

  const pageResults: SearchablePage[] =
    query.trim().length >= 1 ? filterPages(query.trim()).slice(0, 5) : [];

  const hasResults =
    pageResults.length > 0 ||
    results.students.total > 0 ||
    results.users.total > 0 ||
    results.teachers.total > 0 ||
    results.groups.total > 0 ||
    results.courses.total > 0;

  // Show dropdown: when typing (has results or loading) OR when focused with empty query (show hints)
  const showEmpty = query.trim().length === 0;

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    query,
    setQuery: handleQueryChange,
    results,
    isLoading,
    isOpen,
    setIsOpen,
    close,
    pageResults,
    hasResults,
    showEmpty,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  };
}
