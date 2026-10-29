import { addAbortListener } from "node:events";

import type { Routine, RoutineCheckResult, RoutineChecks } from "./routines.ts";
import type { CheckHold } from "./routine-check-pacing.ts";

const CHECK_TIMEOUT_MS = 2 * 60_000;

export interface RoutineCheckLifecycle {
  timeoutMs?: number;
  drain?(): Promise<void>;
}

export async function runRoutineCheck(
  hook: RoutineChecks, routine: Routine, context: { manual: boolean; hold?: CheckHold },
  controller: AbortController, release: (key: string) => void,
): Promise<RoutineCheckResult> {
  let abandoned = false;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<RoutineCheckResult>((resolve) => {
    timer = setTimeout(() => {
      abandoned = true;
      controller.abort();
      resolve({ trouble: "The checks timed out. Their result was discarded; try checking again." });
    }, hook.timeoutMs ?? CHECK_TIMEOUT_MS);
    timer.unref?.();
  });
  try {
    const work = hook.check(routine, { ...context, signal: controller.signal }).then((result) => {
      if (abandoned && result.run) release(result.run.key);
      return result;
    });
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer!);
    await hook.drain?.();
  }
}

export async function awaitRoutineCheck<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  signal.throwIfAborted();
  let listener: ReturnType<typeof addAbortListener>;
  const cancelled = new Promise<never>((_resolve, reject) => {
    listener = addAbortListener(signal, () => reject(signal.reason));
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    listener![Symbol.dispose]();
  }
}
