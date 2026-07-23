import { useCallback, useEffect, useState } from 'react';

export const MESSAGE_INBOX_SEARCH_DEBOUNCE_MS = 240;

/** Owns immediate input, debounced repository query, and synchronous clear. */
export function useMessageInboxSearchQuery() {
  const [input, setInputState] = useState('');
  const [query, setQuery] = useState('');
  const canonicalInput = input.trim();

  useEffect(() => {
    if (!canonicalInput || canonicalInput === query) return undefined;
    const timer = setTimeout(
      () => setQuery(canonicalInput),
      MESSAGE_INBOX_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [canonicalInput, query]);

  const setInput = useCallback((value: string) => {
    setInputState(value);
    if (!value.trim()) setQuery('');
  }, []);
  const clear = useCallback(() => {
    setInputState('');
    setQuery('');
  }, []);

  return {
    clear,
    input,
    pending: canonicalInput !== query,
    query,
    setInput,
  } as const;
}
