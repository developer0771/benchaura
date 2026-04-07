// ─── components/ui/Toast.tsx ─────────────────────────────────────────────────
// Simple imperative toast notification system.
// Usage: import { toast } from '@/components/ui/Toast'
//        toast('Camera connected!')

'use client';
import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  text: string;
}

// Module-level queue so any component can trigger a toast
// without prop drilling
let addToast: (text: string) => void = () => {};

export function toast(text: string) {
  addToast(text);
}

export function ToastContainer() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    let counter = 0;
    addToast = (text: string) => {
      const id = counter++;
      setMessages(prev => [...prev, { id, text }]);
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== id));
      }, 3000);
    };
  }, []);

  if (messages.length === 0) return null;

  return (
    <>
      {messages.map((msg, i) => (
        <div
          key={msg.id}
          className="toast show"
          style={{ bottom: `${100 + i * 52}px` }}
        >
          {msg.text}
        </div>
      ))}
    </>
  );
}
