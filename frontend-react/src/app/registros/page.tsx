'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { api, Registro } from '@/lib/api';
import { formatDateTime, getPainColor, getTrafficLightEmoji, cn } from '@/lib/utils';

export default function RegistrosPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPain, setFilterPain] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    ejercicio_nombre: '',
    series: 3,
    reps: 10,
    peso: 10,
    dolor_intra: 0,
    notas: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRegistros();
  }, []);

  const loadRegistros = async () => {
    try {
      const data = await api.getRegistros(100);
      setRegistros(data);
    } catch (error) {
      console.error('Error loading registros:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ejercicio_nombre.trim()) return;

    setSubmitting(true);
    try {
      await api.createRegistro({
        ...formData,
        notas: formData.notas || undefined,
      });
      setShowForm(false);
      setFormData({
        ejercicio_nombre: '',
        series: 3,
        reps: 10,
        peso: 10,
        dolor_intra: 0,
        notas: '',
      });
      loadRegistros();
    } catch (error) {
      console.error('Error creating registro:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter registros
  const filteredRegistros = registros.filter((r) => {
    const matchesSearch = r.ejercicio_nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPain = filterPain === 'all' 
      ? true 
      : filterPain === 'green' 
        ? r.dolor_intra <= 3
        : filterPain === 'yellow'
          ? r.dolor_intra > 3 && r.dolor_intra <= 5
          : r.dolor_intra > 5;
    return matchesSearch && matchesPain;
  });

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Registros</h1>
          <p className="text-gray-500 mt-1">Historial completo de tus sesiones de entrenamiento</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Registro
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar ejercicio..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterPain}
              onChange={(e) => setFilterPain(e.target.value)}
              className="input"
            >
              <option value="all">Todos los niveles</option>
              <option value="green">🟢 Dolor 0-3</option>
              <option value="yellow">🟡 Dolor 4-5</option>
              <option value="red">🔴 Dolor 6+</option>
            </select>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Nuevo Registro</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Ejercicio *</label>
                <input
                  type="text"
                  value={formData.ejercicio_nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, ejercicio_nombre: e.target.value }))}
                  className="input"
                  placeholder="Nombre del ejercicio"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Series</label>
                  <input
                    type="number"
                    value={formData.series}
                    onChange={(e) => setFormData(prev => ({ ...prev, series: Number(e.target.value) }))}
                    className="input"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="label">Reps</label>
                  <input
                    type="number"
                    value={formData.reps}
                    onChange={(e) => setFormData(prev => ({ ...prev, reps: Number(e.target.value) }))}
                    className="input"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="label">Peso (kg)</label>
                  <input
                    type="number"
                    value={formData.peso}
                    onChange={(e) => setFormData(prev => ({ ...prev, peso: Number(e.target.value) }))}
                    className="input"
                    min={0}
                    step={0.5}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Dolor durante ejercicio (0-10)</label>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, dolor_intra: value }))}
                      className={cn(
                        'w-9 h-9 rounded-lg text-sm font-medium transition-all',
                        formData.dolor_intra === value
                          ? value <= 3
                            ? 'bg-green-500 text-white'
                            : value <= 5
                            ? 'bg-yellow-500 text-white'
                            : 'bg-red-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Notas (opcional)</label>
                <textarea
                  value={formData.notas}
                  onChange={(e) => setFormData(prev => ({ ...prev, notas: e.target.value }))}
                  className="input"
                  rows={3}
                  placeholder="Observaciones de la sesión..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.ejercicio_nombre.trim()}
                  className="btn-primary flex-1"
                >
                  {submitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Registros Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Ejercicio</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Series×Reps</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Peso</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Dolor Intra</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Dolor 24h</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Volumen</th>
                <th className="text-left py-4 px-4 text-xs font-medium text-gray-500 uppercase">Notas</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistros.map((registro) => (
                <tr key={registro.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 px-4 text-sm text-gray-600">
                    {formatDateTime(registro.fecha)}
                  </td>
                  <td className="py-4 px-4 text-sm font-medium text-gray-900">
                    {registro.ejercicio_nombre}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600">
                    {registro.series}×{registro.reps}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600">
                    {registro.peso}kg
                  </td>
                  <td className="py-4 px-4">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
                      getPainColor(registro.dolor_intra)
                    )}>
                      {getTrafficLightEmoji(registro.dolor_intra)} {registro.dolor_intra}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    {registro.dolor_24h !== null ? (
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
                        getPainColor(registro.dolor_24h)
                      )}>
                        {getTrafficLightEmoji(registro.dolor_24h)} {registro.dolor_24h}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Pendiente</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600">
                    {registro.volumen_total.toFixed(1)}kg
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-500 max-w-[200px] truncate">
                    {registro.notas || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRegistros.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No se encontraron registros
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-500 text-right">
        Mostrando {filteredRegistros.length} de {registros.length} registros
      </div>
    </div>
  );
}
