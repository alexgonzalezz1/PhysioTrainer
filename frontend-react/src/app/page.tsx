'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Activity, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  ArrowRight,
  Check
} from 'lucide-react';
import { api, Estadisticas, Registro } from '@/lib/api';
import { formatDateTime, getPainColor, getTrafficLightEmoji } from '@/lib/utils';

export default function DashboardPage() {
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const [pendientes, setPendientes] = useState<Registro[]>([]);
  const [recentRegistros, setRecentRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsData, pendientesData, registrosData] = await Promise.all([
        api.getEstadisticas(),
        api.getRegistrosPendientes(),
        api.getRegistros(10),
      ]);
      setStats(statsData);
      setPendientes(pendientesData);
      setRecentRegistros(registrosData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDolor24h = async (registroId: number, dolor: number) => {
    setUpdatingId(registroId);
    try {
      await api.updateDolor24h(registroId, dolor);
      setPendientes(prev => prev.filter(r => r.id !== registroId));
      loadData();
    } catch (error) {
      console.error('Error updating dolor:', error);
    } finally {
      setUpdatingId(null);
    }
  };

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
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen de tu progreso de rehabilitación</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Registros"
          value={stats?.total_registros || 0}
          icon={Activity}
          color="blue"
        />
        <StatCard
          title="Pendientes 24h"
          value={stats?.pendientes_dolor_24h || 0}
          icon={Clock}
          color={stats?.pendientes_dolor_24h ? 'yellow' : 'green'}
          alert={!!stats?.pendientes_dolor_24h}
        />
        <StatCard
          title="Dolor Promedio"
          value={`${stats?.promedio_dolor_intra?.toFixed(1) || 0}/10`}
          icon={TrendingUp}
          color={stats?.promedio_dolor_intra && stats.promedio_dolor_intra > 5 ? 'red' : 'green'}
        />
        <StatCard
          title="Último Registro"
          value={stats?.ultimo_registro ? formatDateTime(stats.ultimo_registro).split(' ')[0] : 'N/A'}
          icon={AlertCircle}
          color="purple"
        />
      </div>

      {/* Pending Updates */}
      {pendientes.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              Actualizar Dolor 24h
            </h2>
            <span className="bg-yellow-100 text-yellow-700 text-sm font-medium px-3 py-1 rounded-full">
              {pendientes.length} pendiente(s)
            </span>
          </div>

          <div className="space-y-3">
            {pendientes.slice(0, 5).map((registro) => (
              <div
                key={registro.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{registro.ejercicio_nombre}</p>
                  <p className="text-sm text-gray-500">
                    {registro.series}×{registro.reps} @ {registro.peso}kg • Dolor intra: {registro.dolor_intra}/10
                  </p>
                  <p className="text-xs text-gray-400">{formatDateTime(registro.fecha)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((dolor) => (
                    <button
                      key={dolor}
                      onClick={() => handleUpdateDolor24h(registro.id, dolor)}
                      disabled={updatingId === registro.id}
                      className={`w-8 h-8 rounded-full text-xs font-medium transition-all
                        ${dolor <= 3 ? 'bg-green-100 hover:bg-green-200 text-green-700' : 
                          dolor <= 5 ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700' : 
                          'bg-red-100 hover:bg-red-200 text-red-700'}
                        ${updatingId === registro.id ? 'opacity-50' : ''}
                      `}
                    >
                      {dolor}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Registros */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Últimos Registros</h2>
          <Link href="/registros" className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center gap-1">
            Ver todos <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Ejercicio</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Series×Reps</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Peso</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Dolor</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Volumen</th>
              </tr>
            </thead>
            <tbody>
              {recentRegistros.map((registro) => (
                <tr key={registro.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {formatDateTime(registro.fecha)}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    {registro.ejercicio_nombre}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {registro.series}×{registro.reps}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {registro.peso}kg
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getPainColor(registro.dolor_intra)}`}>
                      {getTrafficLightEmoji(registro.dolor_intra)} {registro.dolor_intra}/10
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {registro.volumen_total.toFixed(1)}kg
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/chat" className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center group-hover:bg-primary-200 transition-colors">
              <Activity className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Registrar Entrenamiento</h3>
              <p className="text-sm text-gray-500">Usa el chat con IA para registrar tu sesión</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 ml-auto group-hover:text-primary-600 transition-colors" />
          </div>
        </Link>

        <Link href="/tendencias" className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Ver Progreso</h3>
              <p className="text-sm text-gray-500">Analiza tus tendencias y evolución</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-400 ml-auto group-hover:text-green-600 transition-colors" />
          </div>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  color,
  alert 
}: { 
  title: string; 
  value: string | number; 
  icon: any;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  alert?: boolean;
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="card relative">
      {alert && (
        <span className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full animate-pulse" />
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
