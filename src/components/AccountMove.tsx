// The one-time move to My Cloud in the account area at the bottom of the sidebar, never as a strip over the page: a
// short segment in the account's name, a line by the account (above it in Simple, under the name in Advanced), a dot
// on the avatar, and the move's own rows at the top of the account menu. In the desktop app only, never in a browser.
import { useState } from "react";
import { CloudAlert, CloudCheck, CloudUpload, Loader2, RefreshCw, Smartphone, X } from "lucide-react";
import { MOVE_LINE } from "../../electron/cloud-send-parts.mjs";
import { ipcErrorText, moveLine } from "@/lib/cloud-send";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { useCloudSendNotice } from "./CloudSendStrip";
import type { SidebarMenuItem } from "./SidebarPopoverMenu";

export type AccountMoveLine = NonNullable<ReturnType<typeof moveLine>>;
export type AccountMoveKind = AccountMoveLine["kind"];

const pageBridge = () => (!window.ogb?.remoteClient?.active ? window.ogb?.cloudSendPage : undefined);

/** The account's words for the move: it needs the person once it has failed for a day, goes quietly meanwhile, and
 * says nothing once done (its menu row says what arrived). */
export function accountMoveWords(kind: AccountMoveKind | null): string | null {
  if (kind === "failed") return t("sidebar.account.moveNeedsYou");
  if (kind === "sending") return t("sidebar.account.moving");
  return null;
}

/** The move's rows at the top of the account menu. Failed: why, then Try again (a spinner while it runs, and main's
 * words when it did not answer). On its way: the progress. Done: what arrived, the phone to pair, and Got it, which
 * closes it for good. The first row opens My Cloud in Settings. */
export function moveMenuItems(line: AccountMoveLine | null, { retrying = false, unanswered = null, onOpen, onRetry, onPairPhone, onClose }: {
  retrying?: boolean;
  unanswered?: string | null;
  onOpen: () => void;
  onRetry: () => void;
  onPairPhone?: () => void;
  onClose: () => void;
}): SidebarMenuItem[] {
  if (!line) return [];
  if (line.kind === "failed") {
    const label = t("cloudSend.move.failingPlain");
    const why = [unanswered && unanswered !== label ? unanswered : line.reason, ...line.extra].filter(Boolean).join(" ");
    return [
      { key: "cloud-move", label, ...(why ? { note: why } : {}), wrap: true, icon: <CloudAlert size={16} className="text-warning" />, onSelect: onOpen },
      ...(line.retry ? [{
        key: "cloud-move-retry",
        label: t("cloudSend.strip.retry"),
        icon: retrying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />,
        disabled: retrying,
        keepOpen: true,
        onSelect: onRetry,
      }] : []),
    ];
  }
  if (line.kind === "sending") return [{ key: "cloud-move", label: line.text, wrap: true, icon: <Loader2 size={16} className="animate-spin" />, onSelect: onOpen }];
  return [
    { key: "cloud-move", label: line.text, ...(line.extra.length ? { note: line.extra.join(" ") } : {}), wrap: true, icon: <CloudCheck size={16} />, onSelect: onOpen },
    ...(line.phone && onPairPhone ? [{ key: "cloud-move-phone", label: t("cloudSend.move.phone"), icon: <Smartphone size={16} />, onSelect: onPairPhone }] : []),
    { key: "cloud-move-close", label: t("sidebar.account.moveDismiss"), icon: <X size={16} />, onSelect: onClose },
  ];
}

/** The move as the account shows it: its kind and its menu rows, with the move's own Try again and close. */
export function useAccountMove(cloudHome: boolean, { onOpen, onPairPhone }: { onOpen: () => void; onPairPhone?: () => void }): {
  kind: AccountMoveKind | null;
  items: SidebarMenuItem[];
} {
  const bridge = pageBridge();
  const [notice, setNotice] = useCloudSendNotice(bridge);
  const [retrying, setRetrying] = useState(false);
  const [unanswered, setUnanswered] = useState<string | null>(null);
  const line = bridge && notice?.move ? moveLine(notice.move, cloudHome ? "cloud" : "local") : null;
  if (!bridge || !notice || !line) return { kind: null, items: [] };
  const retry = () => {
    setRetrying(true);
    setUnanswered(null);
    void (bridge.moveRetry?.() ?? Promise.resolve(notice)).then((next) => { setNotice(next); setRetrying(false); })
      .catch((cause: unknown) => { setUnanswered(ipcErrorText(cause) ?? t("cloudSend.move.failingPlain")); setRetrying(false); });
  };
  const close = () => { void bridge.dismiss(MOVE_LINE).then(setNotice).catch(() => {}); };
  return { kind: line.kind, items: moveMenuItems(line, { retrying, unanswered, onOpen, onRetry: retry, onPairPhone, onClose: close }) };
}

/** Only the move's kind, for the line Simple's sidebar shows above the account. */
export function useAccountMoveKind(cloudHome: boolean): AccountMoveKind | null {
  const bridge = pageBridge();
  const [notice] = useCloudSendNotice(bridge);
  return bridge && notice?.move ? moveLine(notice.move, cloudHome ? "cloud" : "local")?.kind ?? null : null;
}

/** The account's line for the move: amber while it needs the person, quiet while it goes, nothing otherwise. With
 * `onOpen` it is a button that opens the account menu, where the move's rows are; without, words inside a trigger. */
export function AccountMoveStatus({ kind, onOpen, className }: { kind: AccountMoveKind | null; onOpen?: () => void; className?: string }) {
  const words = accountMoveWords(kind);
  if (!words) return null;
  const Icon = kind === "failed" ? CloudAlert : CloudUpload;
  const look = cn("flex min-w-0 items-center gap-1.5 text-start text-[12px] leading-4", kind === "failed" ? "font-medium text-warning" : "text-ink-secondary");
  const body = <>
    <Icon size={13} aria-hidden="true" className="shrink-0" />
    <span className="truncate">{words}</span>
  </>;
  if (!onOpen) return <span data-account-move={kind} className={cn(look, className)}>{body}</span>;
  return (
    <div role="status" data-account-move={kind} className={cn("flex min-w-0", className)}>
      <button type="button" onClick={onOpen} className={cn(look, kind === "failed" ? "hover:underline" : "hover:text-ink")}>{body}</button>
    </div>
  );
}
