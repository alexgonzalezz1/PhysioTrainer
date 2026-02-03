'use client';

import { useEffect, useState } from 'react';
import { Plus, Dumbbell, Edit2, Trash2 } from 'lucide-react';
import { api, Ejercicio } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';

const CATEGORIAS = [
  'Fuerza',
  'Movilidad',
  'Estabilidad',
  'Cardio',
  'Flexibilidad',
  'General',
];

export default function EjerciciosPage() {
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    nombre: '',
    categoria: 'Fuerza',
    umbral_dolor_max: 4,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEjercicios();
  }, []);

  const loadEjercicios = async () => {
    try {
      const data = await api.getEjercicios();
      setEjercicios(data);
    } catch (error) {
      console.error('Error loading ejercicios:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    setSubmitting(true);
    setError(null);
    
    try {
      await api.createEjercicio(formData);
      setShowForm(false);
      setFormData({
        nombre: '',
        categoria: 'Fuerza',
        umbral_dolor_max: 4,
      });
      loadEjercicios();
    } catch (error: any) {
      setError('Ya existe un ejercicio con ese nombre');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter ejercicios
  const filteredEjercicios = ejercicios.filter((e) => {
    const matchesSearch = e.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategoria = filterCategoria === 'all' || e.categoria === filterCategoria;
    return matchesSearch && matchesCategoria;
  });

  // Group by categoria
  const groupedEjercicios = filteredEjercicios.reduce((acc, ej) => {
    if (!acc[ej.categoria]) {
      acc[ej.categoria] = [];
    }
    acc[ej.categoria].push(ej);
    return acc;
  }, {} as Record<string, Ejercicio[]>);

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
          <h1 className="text-3xl font-bold text-gray-900">Ejercicios</h1>
          <p className="text-gray-500 mt-1">Biblioteca de ejercicios para tu rehabilitación</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo Ejercicio
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Buscar ejercicio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <select
              value={filterCategoria}
              onChange={(e) => setFilterCategoria(e.target.value)}
              className="input"
            >
              <option value="all">Todas las categorías</option>
              {CATEGORIAS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Nuevo Ejercicio</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  className="input"
                  placeholder="Ej: Sentadilla Búlgara"
                  required
                />
              </div>

              <div>
                <label className="label">Categoría</label>
                <select
                  value={formData.categoria}
                  onChange={(e) => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                  className="input"
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Umbral máximo de dolor (0-10)</label>
                <p className="text-xs text-gray-500 mb-2">
                  Nivel de dolor a partir del cual se considera sobrecarga
                </p>
                <input
                  type="range"
                  value={formData.umbral_dolor_max}
                  onChange={(e) => setFormData(prev => ({ ...prev, umbral_dolor_max: Number(e.target.value) }))}
                  className="w-full"
                  min={0}
                  max={10}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span>
                  <span className="font-medium text-primary-600">{formData.umbral_dolor_max}</span>
                  <span>10</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.nombre.trim()}
                  className="btn-primary flex-1"
                >
                  {submitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ejercicios Grid */}
      {Object.keys(groupedEjercicios).length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedEjercicios).map(([categoria, items]) => (
            <div key={categoria}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className={cn(
                  'w-3 h-3 rounded-full',
                  categoria === 'Fuerza' ? 'bg-red-500' :
                  categoria === 'Movilidad' ? 'bg-blue-500' :
                  categoria === 'Estabilidad' ? 'bg-yellow-500' :
                  categoria === 'Cardio' ? 'bg-green-500' :
                  categoria === 'Flexibilidad' ? 'bg-purple-500' :
                  'bg-gray-500'
                )} />
                {categoria}
                <span className="text-sm font-normal text-gray-500">({items.length})</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((ejercicio) => (
                  <div
                    key={ejercicio.id}
                    className="card hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center',
                        categoria === 'Fuerza' ? 'bg-red-100' :
                        categoria === 'Movilidad' ? 'bg-blue-100' :
                        categoria === 'Estabilidad' ? 'bg-yellow-100' :
                        categoria === 'Cardio' ? 'bg-green-100' :
                        categoria === 'Flexibilidad' ? 'bg-purple-100' :
                        'bg-gray-100'
                      )}>
                        <Dumbbell className={cn(
                          'w-6 h-6',
                          categoria === 'Fuerza' ? 'text-red-600' :
                          categoria === 'Movilidad' ? 'text-blue-600' :
                          categoria === 'Estabilidad' ? 'text-yellow-600' :
                          categoria === 'Cardio' ? 'text-green-600' :
                          categoria === 'Flexibilidad' ? 'text-purple-600' :
                          'text-gray-600'
                        )} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{ejercicio.nombre}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Umbral dolor: {ejercicio.umbral_dolor_max}/10
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          Creado: {formatDate(ejercicio.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Dumbbell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay ejercicios</h3>
          <p className="text-gray-500 mb-4">
            Los ejercicios se crean automáticamente al usar el chat o puedes añadirlos manualmente.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Crear Ejercicio
          </button>
        </div>
      )}

      {/* Summary */}
      {ejercicios.length > 0 && (
        <div className="text-sm text-gray-500 text-right">
          {filteredEjercicios.length} de {ejercicios.length} ejercicios
        </div>
      )}
    </div>
  );
}
