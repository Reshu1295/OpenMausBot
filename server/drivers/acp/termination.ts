import type { AcpSession } from "./turn-state.ts";

import { captureCliTree, killCliTree } from "../../procs.ts";

export async function confirmAcpTermination(session: AcpSession, close: () => Promise<boolean>, failed: () => void): Promise<boolean> {
  const { child, host } = session;
  captureCliTree(child);
  let onExit!: () => void;
  const exited = new Promise<false>((resolve) => {
    onExit = () => resolve(false);
    if (child.exitCode !== null || child.signalCode !== null) onExit();
    else child.once("exit", onExit);
  });
  try {
    if (await Promise.race([close(), exited])) return true;
  } finally {
    child.removeListener("exit", onExit);
  }
  host.draining = true;
  let reported = false;
  while (!await killCliTree(child).catch(() => false)) {
    if (!reported) { reported = true; failed(); }
    // Keep the turn owned until the whole tree stops, including after its root exits.
    await new Promise<void>((resolve) => { setTimeout(resolve, 1_000).unref?.(); });
  }
  return !reported;
}

export async function awaitAcpTeardown(pending: Promise<unknown>[], failed: () => Error): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(pending).then((results) => { if (results.includes(false)) throw failed(); }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(failed()), 10_000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
