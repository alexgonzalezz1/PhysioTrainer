'use client';

import { useEffect, useState } from 'react';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  Area
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, FileText, Loader2 } from 'lucide-react';
import { api, Ejercicio, TendenciaData, InformeMensual } from '@/lib/api';
import { formatDate, getTrafficLightEmoji } from '@/lib/utils';

export default function TendenciasPage() {
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([]);
  const [selectedEjercicio, setSelectedEjercicio] = useState<string>('');
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTendencias, setLoadingTendencias] = useState(false);
  
  // Monthly report state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [informe, setInforme] = useState<InformeMensual | null>(null);
  const [loadingInforme, setLoadingInforme] = useState(false);

  useEffect(() => {
    loadEjercicios();
  }, []);

  useEffect(() => {
    if (selectedEjercicio) {
      loadTendencias(selectedEjercicio);
    }
  }, [selectedEjercicio]);

  const loadEjercicios = async () => {
    try {
      const data = await api.getEjercicios();
      setEjercicios(data);
      if (data.length > 0) {
        setSelectedEjercicio(data[0].id);
      }
    } catch (error) {
      console.error('Error loading ejercicios:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTendencias = async (ejercicioId: string) => {
    setLoadingTendencias(true);
    try {
      const data = await api.getTendencias(ejercicioId);
      setTendencias(data);
    } catch (error) {
      console.error('Error loading tendencias:', error);
    } finally {
      setLoadingTendencias(false);
    }
  };

  const loadInforme = async () => {
    setLoadingInforme(true);
    try {
      const data = await api.getInformeMensual(selectedYear, selectedMonth);
      setInforme(data);
    } catch (error) {
      console.error('Error loading informe:', error);
      setInforme(null);
    } finally {
      setLoadingInforme(false);
    }
  };

  // Calculate statistics
  const stats = tendencias.length > 0 ? {
    totalSesiones: tendencias.length,
    volumenMax: Math.max(...tendencias.map(t => t.volumen_total)),
    dolorPromedio: tendencias.reduce((acc, t) => acc + t.dolor_intra, 0) / tendencias.length,
    tendencia: tendencias.length >= 5 
      ? tendencias.slice(0, 3).reduce((acc, t) => acc + t.dolor_intra, 0) / 3 <
        tendencias.slice(-3).reduce((acc, t) => acc + t.dolor_intra, 0) / 3
        ? 'mejorando'
        : tendencias.slice(0, 3).reduce((acc, t) => acc + t.dolor_intra, 0) / 3 ===
          tendencias.slice(-3).reduce((acc, t) => acc + t.dolor_intra, 0) / 3
        ? 'estable'
        : 'empeorando'
      : null,
  } : null;

  // Prepare chart data
  const chartData = tendencias.map(t => ({
    fecha: formatDate(t.fecha),
    volumen: t.volumen_total,
    dolorIntra: t.dolor_intra,
    dolor24h: t.dolor_24h,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tendencias y Progreso</h1>
        <p className="text-gray-500 mt-1">Analiza tu evolución y relación carga-dolor</p>
      </div>

      {/* Exercise Selector */}
      <div className="card">
        <label className="label">Selecciona un ejercicio</label>
        <select
          value={selectedEjercicio}
          onChange={(e) => setSelectedEjercicio(e.target.value)}
          className="input max-w-md"
        >
          {ejercicios.map((ej) => (
            <option key={ej.id} value={ej.id}>
              {ej.nombre} ({ej.categoria})
            </option>
          ))}
        </select>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-sm text-gray-500">Total Sesiones</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalSesiones}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Volumen Máximo</p>
            <p className="text-2xl font-bold text-gray-900">{stats.volumenMax.toFixed(1)} kg</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Dolor Promedio</p>
            <p className="text-2xl font-bold text-gray-900">
              {getTrafficLightEmoji(stats.dolorPromedio)} {stats.dolorPromedio.toFixed(1)}/10
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-500">Tendencia</p>
            <div className="flex items-center gap-2">
              {stats.tendencia === 'mejorando' && (
                <>
                  <TrendingDown className="w-6 h-6 text-green-600" />
                  <span className="text-lg font-bold text-green-600">Mejorando</span>
                </>
              )}
              {stats.tendencia === 'estable' && (
                <>
                  <Minus className="w-6 h-6 text-yellow-600" />
                  <span className="text-lg font-bold text-yellow-600">Estable</span>
                </>
              )}
              {stats.tendencia === 'empeorando' && (
                <>
                  <TrendingUp className="w-6 h-6 text-red-600" />
                  <span className="text-lg font-bold text-red-600">Atención</span>
                </>
              )}
              {!stats.tendencia && (
                <span className="text-lg font-bold text-gray-400">N/A</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Chart */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Volumen vs Dolor</h2>
        
        {loadingTendencias ? (
          <div className="flex items-center justify-center h-80">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="fecha" 
                tick={{ fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis 
                yAxisId="left"
                tick={{ fontSize: 12 }}
                label={{ value: 'Volumen (kg)', angle: -90, position: 'insideLeft' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                domain={[0, 10]}
                tick={{ fontSize: 12 }}
                label={{ value: 'Dolor (0-10)', angle: 90, position: 'insideRight' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Legend />
              <Bar 
                yAxisId="left"
                dataKey="volumen" 
                name="Volumen Total" 
                fill="#3b82f6" 
                radius={[4, 4, 0, 0]}
                opacity={0.8}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="dolorIntra" 
                name="Dolor Intra" 
                stroke="#ef4444" 
                strokeWidth={3}
                dot={{ fill: '#ef4444', strokeWidth: 2 }}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="dolor24h" 
                name="Dolor 24h" 
                stroke="#f59e0b" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#f59e0b', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-80 text-gray-500">
            No hay datos suficientes para mostrar tendencias
          </div>
        )}
      </div>

      {/* Monthly Report */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Informe Mensual con IA
          </h2>
        </div>

        <div className="flex gap-4 mb-4">
          <div>
            <label className="label">Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="input"
            >
              {[2024, 2025, 2026].map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="input"
            >
              {[
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
              ].map((month, i) => (
                <option key={i} value={i + 1}>{month}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadInforme}
              disabled={loadingInforme}
              className="btn-primary flex items-center gap-2"
            >
              {loadingInforme && <Loader2 className="w-4 h-4 animate-spin" />}
              Generar Informe
            </button>
          </div>
        </div>

        {informe && (
          <div className="bg-gray-50 rounded-lg p-6 mt-4">
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
              <div>
                <p className="text-sm text-gray-500">Período</p>
                <p className="font-semibold">{informe.periodo}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Ejercicios</p>
                <p className="font-semibold">{informe.ejercicios_analizados}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Sesiones</p>
                <p className="font-semibold">{informe.total_sesiones}</p>
              </div>
            </div>
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap text-gray-700">{informe.resumen}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
