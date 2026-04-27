'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, X, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useUser } from '@/firebase/provider';
import type { BibliotecaQueryOutput } from '@/ai/flows/biblioteca-rag';

/**
 * Componente: BibliotecaChat
 * Módulo: Biblioteca — Bot de consulta RAG
 * 
 * Interfaz de chat flotante o integrada para consultar documentos organizacionales.
 * Maneja el estado de la conversación y las llamadas al endpoint de IA.
 */
export function BibliotecaChat() {
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{
    role: 'user' | 'bot';
    content: string;
    sources?: BibliotecaQueryOutput['sources'];
    timestamp: Date;
  }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final cuando hay mensajes nuevos
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      // Obtener el token de Firebase Auth para la API
      const token = await user.getIdToken();

      const response = await fetch('/api/ai/biblioteca', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: userMessage })
      });

      if (!response.ok) {
        throw new Error('No se pudo obtener respuesta del asistente');
      }

      const data = await response.json() as BibliotecaQueryOutput;

      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: data.answer, 
        sources: data.sources,
        timestamp: new Date() 
      }]);

    } catch (error) {
      console.error('[BibliotecaChat] Error:', error);
      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: 'Lo siento, hubo un error al procesar tu pregunta. Por favor intenta de nuevo más tarde.', 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center group z-50"
        title="Preguntar a Biblioteca AI"
      >
        <Bot className="w-7 h-7 group-hover:scale-110 transition-transform" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="p-4 bg-indigo-600 text-white flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <div>
            <h3 className="font-semibold text-sm">Biblioteca AI</h3>
            <p className="text-[10px] text-indigo-100 leading-none">Stuffactory Assistant</p>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-indigo-500 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50"
      >
        {messages.length === 0 && (
          <div className="text-center py-8 px-4">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bot className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-800">¡Hola! Soy tu asistente de Biblioteca.</p>
            <p className="text-xs text-slate-500 mt-1">Pregúntame sobre políticas, manuales o procesos de la empresa.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div 
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                msg.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-indigo-100 text-indigo-600'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
              }`}>
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Fuentes consultadas:</p>
                    <div className="space-y-1">
                      {msg.sources.map(source => (
                        <div 
                          key={source.documentId}
                          className="flex items-center gap-2 p-1.5 bg-slate-50 rounded border border-slate-100 hover:border-indigo-200 transition-colors cursor-default"
                        >
                          <FileText className="w-3 h-3 text-indigo-500" />
                          <span className="text-[11px] font-medium text-slate-600 truncate">
                            {source.documentTitle}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-2 max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3 rounded-2xl rounded-tl-none bg-white border border-slate-100 shadow-sm flex items-center gap-2 text-slate-400 text-sm italic">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analizando documentos...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form 
        onSubmit={handleSend}
        className="p-4 bg-white border-t border-slate-100 flex items-center gap-2"
      >
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Haz una pregunta..."
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-indigo-500/50 transition-all outline-none disabled:opacity-50"
        />
        <button 
          type="submit"
          disabled={!input.trim() || isLoading}
          className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-300 transition-all shrink-0 shadow-sm active:scale-95"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
