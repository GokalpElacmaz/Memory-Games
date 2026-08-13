import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const KEY = 'mg:progress:v1';

export type GameRecord = {
  bestScore: number;
  bestLevel: number;
  plays: number;
  lastPlayedAt: number | null;
};

export type ProgressMap = Record<string, GameRecord>;

export const emptyRecord: GameRecord = {
  bestScore: 0,
  bestLevel: 0,
  plays: 0,
  lastPlayedAt: null,
};

export type RunResult = { score: number; level: number };

type ProgressContextValue = {
  progress: ProgressMap;
  ready: boolean;
  recordOf: (gameId: string) => GameRecord;
  /** Persist the outcome of a finished run; returns which records were beaten. */
  recordRun: (gameId: string, result: RunResult) => { newBestScore: boolean; newBestLevel: boolean };
  resetAll: () => void;
};

const ProgressContext = createContext<ProgressContextValue>({
  progress: {},
  ready: false,
  recordOf: () => emptyRecord,
  recordRun: () => ({ newBestScore: false, newBestLevel: false }),
  resetAll: () => {},
});

function persist(map: ProgressMap) {
  AsyncStorage.setItem(KEY, JSON.stringify(map)).catch(() => {});
}

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [ready, setReady] = useState(false);

  // Mirror of `progress` so recordRun can compare against the freshest map
  // without waiting for a re-render.
  const latest = useRef<ProgressMap>(progress);
  latest.current = progress;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as ProgressMap;
          latest.current = parsed;
          setProgress(parsed);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recordOf = useCallback(
    (gameId: string) => progress[gameId] ?? emptyRecord,
    [progress],
  );

  const recordRun = useCallback((gameId: string, result: RunResult) => {
    const current = latest.current[gameId] ?? emptyRecord;
    const outcome = {
      newBestScore: result.score > current.bestScore,
      newBestLevel: result.level > current.bestLevel,
    };
    const next: ProgressMap = {
      ...latest.current,
      [gameId]: {
        bestScore: Math.max(current.bestScore, result.score),
        bestLevel: Math.max(current.bestLevel, result.level),
        plays: current.plays + 1,
        lastPlayedAt: Date.now(),
      },
    };
    latest.current = next;
    setProgress(next);
    persist(next);
    return outcome;
  }, []);

  const resetAll = useCallback(() => {
    latest.current = {};
    setProgress({});
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ progress, ready, recordOf, recordRun, resetAll }),
    [progress, ready, recordOf, recordRun, resetAll],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  return useContext(ProgressContext);
}
