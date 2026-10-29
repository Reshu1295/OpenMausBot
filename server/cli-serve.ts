// `openmausbot serve` runs the server as a supervised child. This module owns
// the launch the way the desktop parent owns it for the server it embeds:
// negotiate a free loopback port pair, pin the child to it, prove readiness,
// and relaunch on the next pair when a third party claims a negotiated port
// between probe and bind.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { join } from "node:path";

import { SetupCancelled } from "./cli-prompts.ts";
import { explainTailscaleFailure, tailscaleServe, tailscaleServeOff, type TailscaleStatus } from "./tailscale.ts";

/** Bind-then-release probe for `serve`'s port negotiation: false when another
 * process already holds the loopback port. A probe can never reserve the port —
 * a third party can still take it before the spawned child binds — so a lost
 * race relaunches on the next free pair rather than trusting this answer. */
function loopbackPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createTcpServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

// The standalone server walks up to MAX_PORT_ATTEMPTS + 1 candidates on
// EADDRINUSE (server/index.ts); the CLI probes the same span, then pins its
// child to the pair it picked. A stolen probe port costs one child boot each,
// so relaunches are bounded tighter than the port walk.
const SERVE_PORT_SCAN = 100;
const SERVE_LAUNCH_ATTEMPTS = 5;

/** First loopback port at or above `start` that nothing else holds. `exclude`
 * keeps the webhook scan off the port the main listener just negotiated. */
async function firstFreeLoopbackPort(start: number, exclude?: number): Promise<number | null> {
  for (let candidate = start; candidate <= start + SERVE_PORT_SCAN && candidate <= 65_535; candidate++) {
    if (candidate === exclude) continue;
    if (await loopbackPortFree(candidate)) return candidate;
  }
  return null;
}

/** One spawned server child, live until its exit resolves. `runServe`'s
 * shutdown path reaches the in-flight child through this handle, so a signal
 * mid-relaunch still terminates the latest attempt rather than a stale one. */
export interface ServeChildHandle {
  readonly pid: number | undefined;
  readonly exited: number | null;
  readonly exit: Promise<number>;
  terminate(): Promise<void>;
}

/** The child that negotiated its ports and answered health: what `runServe`
 * proxies, pairs and reports against. */
export interface RunningServe extends ServeChildHandle {
  readonly port: number;
  readonly webhookPort: number;
  readonly logPath: string | undefined;
  readonly publicUrl: string | undefined;
  /** Remove the process signal handlers the launcher installed. */
  disarm(): void;
}

export interface ServeTailscaleState {
  status: TailscaleStatus;
  serving: boolean;
  attempted: boolean;
}

export interface ServeLaunchDeps {
  entry: { command: string; args: string[] };
  env: NodeJS.ProcessEnv;
  dataDir: string;
  guided: boolean | undefined;
  requestedPort: number;
  requestedWebhookPort: number;
  publicUrl: string | undefined;
  ownerToken: string | undefined;
  tailscale: ServeTailscaleState | null;
  log(line: string): void;
  error(line: string): void;
  /** True once shutdown has begun; vetoes a pending retry spawn. */
  stopping(): boolean;
  /** Full teardown — callers keep it pointed at the child registered by onChild. */
  stop(): Promise<void>;
  /** Installed as the SIGINT/SIGTERM handler after the first spawn. */
  onShutdown(): void;
  /** Registers the live child so stop() terminates the newest attempt. */
  onChild(handle: ServeChildHandle): void;
  /** Release plan resources when a spawn could not happen. */
  onSpawnFailure(): void;
  onCancelled(): void;
  /** The per-launch secret went to the child over stdin; remember it for API calls. */
  onOwnerToken(token: string): void;
  serverUp(port: number, pid?: number): Promise<boolean>;
  /** ingress.available from /api/webhooks; undefined when it cannot be read. */
  webhookIngressAvailable(port: number): Promise<boolean | undefined>;
}

export type ServeLaunchOutcome =
  | { status: "ready"; server: RunningServe }
  | { status: "exit"; code: number }
  | { status: "stopping"; exit: Promise<number> };

export async function launchServeChild(deps: ServeLaunchDeps): Promise<ServeLaunchOutcome> {
  const { entry, env, dataDir, guided, tailscale, log, error } = deps;
  let publicUrl = deps.publicUrl;
  let logPath: string | undefined;
  let startupCancelled = false;
  const cancelStartup = () => { startupCancelled = true; };
  let shutdownSignalsArmed = false;
  const armShutdown = () => {
    if (shutdownSignalsArmed) return;
    shutdownSignalsArmed = true;
    process.on("SIGINT", deps.onShutdown);
    process.on("SIGTERM", deps.onShutdown);
  };
  const disarm = () => {
    process.removeListener("SIGINT", deps.onShutdown);
    process.removeListener("SIGTERM", deps.onShutdown);
    process.removeListener("SIGINT", cancelStartup);
    process.removeListener("SIGTERM", cancelStartup);
  };
  process.on("SIGINT", cancelStartup);
  process.on("SIGTERM", cancelStartup);

  // The CLI negotiates ports for the child it launches, the same way the
  // desktop parent owns port selection: probe a free pair, then pin the child
  // to it (OMB_PORT_PINNED) so the ports the proxies and the readiness check
  // target can never drift. A probe cannot hold the port, so a third party
  // can still claim it before the child's own bind — that surfaces as a fast
  // exit while the negotiated port is held, and the launch retries on the
  // next free pair.
  let port = deps.requestedPort;
  let lastChild: ServeChildHandle | null = null;
  let serverReady = false;
  try {
    for (let attempt = 0; attempt < SERVE_LAUNCH_ATTEMPTS && !serverReady && !deps.stopping(); attempt++) {
      const freePort = await firstFreeLoopbackPort(port);
      if (freePort === null) {
        error(`no free loopback port at or above ${port}; free a port or pass --port`);
        return { status: "exit", code: 1 };
      }
      port = freePort;
      const webhookPort = await firstFreeLoopbackPort(deps.requestedWebhookPort, port);
      if (webhookPort === null) {
        error(`no free loopback port at or above ${deps.requestedWebhookPort} for the webhook receiver; free a port or set OMB_WEBHOOK_PORT`);
        return { status: "exit", code: 1 };
      }
      if (port !== deps.requestedPort) log(`note: port ${deps.requestedPort} is in use; using http://127.0.0.1:${port}`);
      if (webhookPort !== deps.requestedWebhookPort) log(`note: webhook port ${deps.requestedWebhookPort} is in use; using ${webhookPort}`);
      env.OMB_PORT = String(port);
      env.OMB_WEBHOOK_PORT = String(webhookPort);

      let logFd: number | undefined;
      let child: ChildProcess;
      try {
        if (guided) {
          if (!logPath) {
            const logsDir = join(dataDir, "logs");
            mkdirSync(logsDir, { recursive: true, mode: 0o700 });
            logPath = join(logsDir, `server-${Date.now()}-${process.pid}.log`);
            log("\nStarting your workspace…");
          }
          logFd = openSync(logPath, "a", 0o600);
        }
        if (tailscale) {
          tailscale.attempted = true;
          if (tailscale.serving) await tailscaleServeOff(tailscale.status).catch(() => undefined);
          const served = await tailscaleServe(tailscale.status, port);
          if (startupCancelled || deps.stopping()) throw new SetupCancelled();
          if ("failure" in served) throw new Error(`--tailscale: ${explainTailscaleFailure(served.failure)}`);
          tailscale.serving = true;
          publicUrl = served.origin;
          log(`tailscale: serving https://${tailscale.status.dnsName} → http://127.0.0.1:${port} (only your tailnet can reach it)`);
        }
        // From the second attempt on, cancelStartup is already disarmed — a
        // signal during the port scan arrives through onShutdown and sets
        // stopping, so it has to veto the spawn here too.
        if (startupCancelled || deps.stopping()) throw new SetupCancelled();
        if (publicUrl) env.OMB_PUBLIC_URL = publicUrl;
        child = spawn(entry.command, entry.args, { env, stdio: [deps.ownerToken ? "pipe" : "ignore", logFd ?? "inherit", logFd ?? "inherit"] });
        if (deps.ownerToken) {
          child.stdin?.on("error", () => {});
          child.stdin?.end(`${deps.ownerToken}\n`);
          deps.onOwnerToken(deps.ownerToken);
        }
      } catch (spawnError) {
        if ((tailscale?.serving || (startupCancelled && tailscale?.attempted)) && tailscale) {
          await tailscaleServeOff(tailscale.status).catch(() => undefined);
          tailscale.serving = false;
        }
        deps.onSpawnFailure();
        if (spawnError instanceof SetupCancelled) {
          deps.onCancelled();
          return { status: "exit", code: 130 };
        }
        throw spawnError;
      } finally {
        if (logFd !== undefined) closeSync(logFd);
        process.removeListener("SIGINT", cancelStartup);
        process.removeListener("SIGTERM", cancelStartup);
      }

      let exited: number | null = null;
      const exit = new Promise<number>((done) => {
        child.once("error", () => { exited = 1; done(1); });
        child.once("exit", (code, signal) => { exited = code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1); done(exited); });
      });
      const handle: ServeChildHandle = {
        get pid() { return child.pid; },
        get exited() { return exited; },
        exit,
        terminate: async () => {
          if (exited !== null) return;
          child.kill("SIGTERM");
          const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
          timer.unref();
          await exit;
          clearTimeout(timer);
        },
      };
      lastChild = handle;
      deps.onChild(handle);
      armShutdown();

      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline && exited === null && !deps.stopping()) {
        if (await deps.serverUp(port, child.pid)) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (exited !== null) {
        // A dead child whose negotiated port is already held by someone else
        // lost the probe→bind race; negotiate the next pair and relaunch.
        if (!deps.stopping() && exited !== 0 && attempt + 1 < SERVE_LAUNCH_ATTEMPTS && !(await loopbackPortFree(port))) {
          log(`port ${port} was claimed while the server was starting; trying the next free port`);
          continue;
        }
        if (exited !== 0) log(`OpenMausBot could not start.${logPath ? ` Details: ${logPath}` : " See the output above."}`);
        return { status: "exit", code: exited };
      }
      if (deps.stopping()) return { status: "stopping", exit };
      if (!(await deps.serverUp(port, child.pid))) {
        error(`OpenMausBot did not become ready within a minute.${logPath ? ` Details: ${logPath}` : " See its output above."}`);
        await deps.stop();
        return { status: "exit", code: 1 };
      }
      // The webhook receiver is a second bind on the negotiated pair, and a
      // pinned child that loses it still serves — leaving Caddy and Tailscale
      // pointed at a foreign socket. Relaunch on a fresh pair when the port
      // was taken, the same way a stolen main port is handled.
      let ingressAvailable: boolean | undefined;
      try {
        ingressAvailable = await deps.webhookIngressAvailable(port);
      } catch { /* ingress verification is best-effort; the receiver logged its own failure */ }
      if (ingressAvailable === false && !(await loopbackPortFree(webhookPort))) {
        if (attempt + 1 >= SERVE_LAUNCH_ATTEMPTS) {
          // Never declare ready with the webhook port in foreign hands: Caddy
          // and Tailscale would forward hooks to a process that is not us.
          error(`webhook port ${webhookPort} is owned by another process; the server cannot accept webhooks safely`);
          await deps.stop();
          return { status: "exit", code: 1 };
        }
        log(`webhook port ${webhookPort} was claimed while the server was starting; trying a new pair`);
        await handle.terminate();
        continue;
      }
      serverReady = true;
      const server = Object.assign(handle, { port, webhookPort, logPath, publicUrl, disarm });
      return { status: "ready", server };
    }
    if (deps.stopping() && lastChild) return { status: "stopping", exit: lastChild.exit };
    return { status: "exit", code: lastChild?.exited ?? (deps.stopping() ? 0 : 1) };
  } finally {
    if (!serverReady) disarm();
  }
}
