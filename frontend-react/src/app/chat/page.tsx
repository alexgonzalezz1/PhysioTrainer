'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Check, AlertCircle } from 'lucide-react';
import { api, ChatResponse } from '@/lib/api';
import { cn, getTrafficLightEmoji } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: ChatResponse;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '¡Hola! 👋 Soy tu asistente de rehabilitación. Cuéntame tu sesión de entrenamiento de forma natural.\n\nPor ejemplo:\n• "Hoy búlgaras 3x10 con 12kg, dolor 2"\n• "Sentadilla goblet 4x8 con 16kg dolor 3"\n• "Press militar 3x12 con 8kg, algo de molestia dolor 4"',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.sendChatMessage(input);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.mensaje,
        data: response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Chat con IA</h1>
        <p className="text-gray-500 mt-1">Registra tu entrenamiento en lenguaje natural</p>
      </div>

      {/* Chat Container */}
      <div className="flex-1 card flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          
          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-600" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe tu sesión de entrenamiento..."
              className="input flex-1"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                'btn-primary flex items-center gap-2',
                (!input.trim() || isLoading) && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
          
          {/* Quick suggestions */}
          <div className="flex gap-2 mt-3">
            {['Búlgaras 3x10 con 10kg, dolor 2', 'Press banca 4x8 con 30kg dolor 3', 'Peso muerto 3x5 con 50kg dolor 1'].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setInput(suggestion)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        isUser ? 'bg-primary-600' : 'bg-primary-100'
      )}>
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-primary-600" />
        )}
      </div>

      <div className={cn(
        'max-w-[70%] rounded-2xl px-4 py-3',
        isUser 
          ? 'bg-primary-600 text-white rounded-tr-none' 
          : 'bg-gray-100 text-gray-900 rounded-tl-none'
      )}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        
        {/* Show extracted data if available */}
        {message.data?.registro_guardado && message.data.datos_extraidos && (
          <div className={cn(
            'mt-3 p-3 rounded-lg',
            isUser ? 'bg-primary-700' : 'bg-white'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <Check className={cn('w-4 h-4', isUser ? 'text-green-300' : 'text-green-600')} />
              <span className={cn('text-sm font-medium', isUser ? 'text-white' : 'text-gray-900')}>
                Registro guardado
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className={cn('text-xs', isUser ? 'text-primary-200' : 'text-gray-500')}>Ejercicio</p>
                <p className={cn('font-medium', isUser ? 'text-white' : 'text-gray-900')}>
                  {message.data.datos_extraidos.ejercicio}
                </p>
              </div>
              <div>
                <p className={cn('text-xs', isUser ? 'text-primary-200' : 'text-gray-500')}>Series×Reps</p>
                <p className={cn('font-medium', isUser ? 'text-white' : 'text-gray-900')}>
                  {message.data.datos_extraidos.series}×{message.data.datos_extraidos.reps}
                </p>
              </div>
              <div>
                <p className={cn('text-xs', isUser ? 'text-primary-200' : 'text-gray-500')}>Peso</p>
                <p className={cn('font-medium', isUser ? 'text-white' : 'text-gray-900')}>
                  {message.data.datos_extraidos.peso}kg
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Show recommendation if available */}
        {message.data?.recomendacion && (
          <div className={cn(
            'mt-3 p-3 rounded-lg border-l-4',
            message.data.datos_extraidos?.dolorIntra !== undefined && message.data.datos_extraidos.dolorIntra <= 3
              ? 'bg-green-50 border-green-500'
              : message.data.datos_extraidos?.dolorIntra !== undefined && message.data.datos_extraidos.dolorIntra <= 5
              ? 'bg-yellow-50 border-yellow-500'
              : 'bg-red-50 border-red-500'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-medium text-gray-900">Recomendación IA</span>
            </div>
            <p className="text-sm text-gray-700">{message.data.recomendacion}</p>
          </div>
        )}
      </div>
    </div>
  );
}
