import { HardwareTelemetry, HardwareTelemetrySchema } from '../contracts/schemas';

type TelemetryCallback = (data: HardwareTelemetry) => void;
type ErrorCallback = (err: Event) => void;

export class TelemetryStreamClient {
  private eventSource: EventSource | null = null;
  private listeners = new Set<TelemetryCallback>();
  private errorListeners = new Set<ErrorCallback>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;

  constructor(private url = '/api/telemetry/stream') {}

  public connect(): void {
    if (this.isDestroyed || this.eventSource) return;

    try {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onmessage = (event) => {
        try {
          const parsedJson = JSON.parse(event.data);
          const validation = HardwareTelemetrySchema.safeParse(parsedJson);
          if (validation.success) {
            this.listeners.forEach((cb) => cb(validation.data));
          }
        } catch {}
      };

      this.eventSource.onerror = (err) => {
        this.errorListeners.forEach((cb) => cb(err));
        this.disconnect();
        if (!this.isDestroyed) {
          this.reconnectTimeout = setTimeout(() => this.connect(), 4000);
        }
      };
    } catch {
      if (!this.isDestroyed) {
        this.reconnectTimeout = setTimeout(() => this.connect(), 4000);
      }
    }
  }

  public subscribe(cb: TelemetryCallback): () => void {
    this.listeners.add(cb);
    if (!this.eventSource && !this.isDestroyed) {
      this.connect();
    }
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
    this.listeners.clear();
    this.errorListeners.clear();
  }
}

export const globalTelemetryStream = new TelemetryStreamClient();
