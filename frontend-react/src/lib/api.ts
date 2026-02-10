const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';

export interface Ejercicio {
  id: string;
  nombre: string;
  categoria: string;
  umbral_dolor_max: number;
  created_at: string;
}

export interface Registro {
  id: number;
  fecha: string;
  series: number;
  reps: number;
  peso: number;
  dolor_intra: number;
  dolor_24h: number | null;
  notas: string | null;
  ejercicio_nombre: string;
  volumen_total: number;
}

export interface ChatResponse {
  mensaje: string;
  datos_extraidos: {
    ejercicio: string;
    series: number;
    reps: number;
    peso: number;
    dolorIntra: number;
  } | null;
  registro_guardado: boolean;
  recomendacion: string | null;
}

export interface TendenciaData {
  fecha: string;
  volumen_total: number;
  dolor_intra: number;
  dolor_24h: number | null;
}

export interface Estadisticas {
  total_registros: number;
  pendientes_dolor_24h: number;
  promedio_dolor_intra: number;
  ultimo_registro: string | null;
}

export interface InformeMensual {
  periodo: string;
  ejercicios_analizados: number;
  total_sesiones: number;
  resumen: string;
  tendencias: TendenciaData[];
}

class ApiService {
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }

  // Chat
  async sendChatMessage(mensaje: string): Promise<ChatResponse> {
    return this.fetch<ChatResponse>('/chat/', {
      method: 'POST',
      body: JSON.stringify({ mensaje }),
    });
  }

  // Ejercicios
  async getEjercicios(): Promise<Ejercicio[]> {
    return this.fetch<Ejercicio[]>('/ejercicios/');
  }

  async createEjercicio(data: Omit<Ejercicio, 'id' | 'created_at'>): Promise<Ejercicio> {
    return this.fetch<Ejercicio>('/ejercicios/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Registros
  async getRegistros(limit = 100, offset = 0): Promise<Registro[]> {
    return this.fetch<Registro[]>(`/registros/?limit=${limit}&offset=${offset}`);
  }

  async getRegistrosPendientes(): Promise<Registro[]> {
    return this.fetch<Registro[]>('/registros/pendientes');
  }

  async getRegistrosByEjercicio(ejercicioId: string, limit = 50): Promise<Registro[]> {
    return this.fetch<Registro[]>(`/registros/ejercicio/${ejercicioId}?limit=${limit}`);
  }

  async createRegistro(data: {
    ejercicio_nombre: string;
    series: number;
    reps: number;
    peso: number;
    dolor_intra: number;
    notas?: string;
  }): Promise<Registro> {
    return this.fetch<Registro>('/registros/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDolor24h(registroId: number, dolor24h: number): Promise<Registro> {
    return this.fetch<Registro>(`/registros/${registroId}/dolor-24h`, {
      method: 'PATCH',
      body: JSON.stringify({ dolor_24h: dolor24h }),
    });
  }

  // Informes
  async getTendencias(ejercicioId: string, limit = 30): Promise<TendenciaData[]> {
    return this.fetch<TendenciaData[]>(`/informes/tendencias/${ejercicioId}?limit=${limit}`);
  }

  async getEstadisticas(): Promise<Estadisticas> {
    return this.fetch<Estadisticas>('/informes/estadisticas');
  }

  async getInformeMensual(year: number, month: number): Promise<InformeMensual> {
    return this.fetch<InformeMensual>(`/informes/mensual/${year}/${month}`);
  }
}

export const api = new ApiService();
