type MsgHandler = (msg: Record<string, unknown>) => void

let _ws: WebSocket | null = null
const _byId = new Map<string, MsgHandler>()
const _globals = new Set<MsgHandler>()

export function setWs(ws: WebSocket | null): void {
  _ws = ws
  if (ws) {
    ws.onmessage = (ev: MessageEvent) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(ev.data as string) as Record<string, unknown> } catch { return }
      const id = msg.id as string | undefined
      if (id) {
        _byId.get(id)?.(msg)
      } else {
        for (const handler of _globals) handler(msg)
      }
    }
  }
}

export function send(msg: unknown): void {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg))
  }
}

export function subscribe(id: string, handler: MsgHandler): () => void {
  _byId.set(id, handler)
  return () => _byId.delete(id)
}

export function subscribeGlobal(handler: MsgHandler): () => void {
  _globals.add(handler)
  return () => _globals.delete(handler)
}

export function isOpen(): boolean {
  return _ws?.readyState === WebSocket.OPEN
}
