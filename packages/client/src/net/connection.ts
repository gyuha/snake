import { decodeServerFrame, encodeClient, type ClientMsg, type ServerMsg } from '@snake/shared';

export class Connection {
  private readonly ws: WebSocket;

  constructor(url: string, onMessages: (msgs: ServerMsg[]) => void, onClose: () => void) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        onMessages(decodeServerFrame(new Uint8Array(ev.data as ArrayBuffer)));
      } catch (err) {
        console.error('[client] failed to decode server frame', err);
        this.ws.close();
      }
    };
    this.ws.onclose = () => onClose();
  }

  whenOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('close', () => reject(new Error('connection closed')), { once: true });
    });
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encodeClient(msg));
  }

  close(): void {
    this.ws.close();
  }
}
