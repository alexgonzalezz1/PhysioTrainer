'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  MessageCircle, 
  TrendingUp, 
  ClipboardList, 
  Dumbbell,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Chat IA', href: '/chat', icon: MessageCircle },
  { name: 'Tendencias', href: '/tendencias', icon: TrendingUp },
  { name: 'Registros', href: '/registros', icon: ClipboardList },
  { name: 'Ejercicios', href: '/ejercicios', icon: Dumbbell },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">PhysioTrainer</h1>
            <p className="text-xs text-gray-500">Asistente de Rehab</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon className={cn('w-5 h-5', isActive && 'text-primary-600')} />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100">
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg p-4">
          <p className="text-xs text-gray-600 mb-2">Regla del Semáforo</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1">🟢 0-3</span>
            <span className="flex items-center gap-1">🟡 4-5</span>
            <span className="flex items-center gap-1">🔴 6+</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
