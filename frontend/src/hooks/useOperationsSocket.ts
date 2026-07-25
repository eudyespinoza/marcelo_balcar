import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useOperationsSocket(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let retry: number | undefined;
    let socket: WebSocket | undefined;
    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}/ws/operations`);
      socket.onmessage = () => {
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["services"] });
        void queryClient.invalidateQueries({ queryKey: ["calendar"] });
      };
      socket.onclose = () => { retry = window.setTimeout(connect, 2500); };
    };
    connect();
    return () => { window.clearTimeout(retry); socket?.close(); };
  }, [enabled, queryClient]);
}
