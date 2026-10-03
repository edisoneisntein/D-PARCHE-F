import { TaskState, TaskStateSchema } from '../contracts/schemas';

export class VideoApiClient {
  static async submitTask(formData: FormData, signal?: AbortSignal, endpoint = '/api/tasks/simple'): Promise<string> {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal,
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`El servidor devolvió un error (HTTP ${res.status}). Intente de nuevo en unos segundos.`);
      }
      throw new Error('El servidor está iniciando la conexión. Por favor espere 3 segundos y vuelva a presionar Generar Video.');
    }

    if (!res.ok) {
      const msg = data.detail || data.error || data.message || `Error HTTP ${res.status}: ${res.statusText}`;
      throw new Error(msg);
    }

    if (!data.task_id) {
      throw new Error('El servidor no devolvió un identificador de tarea válido.');
    }

    return data.task_id as string;
  }

  static async getTaskState(taskId: string, signal?: AbortSignal): Promise<TaskState> {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'GET',
      signal,
    });

    if (!res.ok) {
      throw new Error(`Error consultando tarea ${taskId}: HTTP ${res.status}`);
    }

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Respuesta no válida del backend al consultar estado.`);
    }

    const parsed = TaskStateSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Violación de esquema de tarea: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  static async stopTask(taskId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/tasks/${taskId}/stop`, {
        method: 'POST',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async testConnection(apiKey?: string, domain?: string): Promise<{ ok: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, domain }),
      });
      return await res.json();
    } catch (e: unknown) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Error de conexión con el backend',
      };
    }
  }
}
