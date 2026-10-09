"use client";

import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type NotificationType = "success" | "error" | "warning" | "info";

export interface NotifyOptions {
  type: NotificationType;
  header?: string;
  content: ReactNode;
  /** Reusing an id replaces the existing notification instead of stacking a duplicate. */
  id?: string;
}

interface Notification extends NotifyOptions {
  id: string;
}

interface NotificationsActions {
  notify: (options: NotifyOptions) => string;
  dismiss: (id: string) => void;
}

const ActionsContext = createContext<NotificationsActions | null>(null);
const ItemsContext = createContext<Notification[]>([]);

export const SUCCESS_AUTO_DISMISS_MS = 8000;

const STATUS_LABELS: Record<NotificationType, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

/**
 * App-wide notifications for the one Flashbar. Lives in the console layout, so messages survive
 * client navigations. Success items auto-dismiss after ~8 s; everything else stays until dismissed.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (options: NotifyOptions) => {
      counter.current += 1;
      const id = options.id ?? `notification-${counter.current}`;
      setItems((current) => [{ ...options, id }, ...current.filter((item) => item.id !== id)]);
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.delete(id);
      if (options.type === "success") {
        timers.current.set(id, setTimeout(() => dismiss(id), SUCCESS_AUTO_DISMISS_MS));
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const actions = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <ActionsContext.Provider value={actions}>
      <ItemsContext.Provider value={items}>{children}</ItemsContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useNotifications(): NotificationsActions {
  const context = useContext(ActionsContext);
  if (!context) throw new Error("useNotifications must be used inside NotificationsProvider");
  return context;
}

/** The single Flashbar, rendered in the AppLayout notifications slot. */
export function NotificationsFlashbar() {
  const items = useContext(ItemsContext);
  const { dismiss } = useNotifications();
  const flashItems: FlashbarProps.MessageDefinition[] = items.map((item) => ({
    id: item.id,
    type: item.type,
    header: item.header,
    content: item.content,
    dismissible: true,
    dismissLabel: "Dismiss notification",
    onDismiss: () => dismiss(item.id),
    ariaRole: item.type === "error" ? "alert" : "status",
    statusIconAriaLabel: STATUS_LABELS[item.type],
  }));
  return <Flashbar items={flashItems} />;
}
