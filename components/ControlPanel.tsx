
import React, { useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { BrainCircuit, User } from 'lucide-react';

interface ControlPanelProps {
  messages: ChatMessage[];
  isSessionActive: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ messages, isSessionActive }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, messages.length > 0 ? messages[messages.length - 1].text : '']);


  return (
    <div className="bg-gray-800/60 backdrop-blur-xl border border-gray-700/50 rounded-lg p-4 shadow-2xl flex flex-col h-full">
      <div className="flex-grow overflow-y-auto mb-2 pr-2 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex-shrink-0 items-center justify-center flex">
                <BrainCircuit size={18} />
              </div>
            )}
            <div className={`max-w-xs md:max-w-md p-3 rounded-lg shadow-md ${msg.role === 'user' ? 'bg-cyan-800 text-white' : 'bg-gray-700'}`}>
              <p className={`text-sm break-words ${!msg.isFinal ? 'opacity-70' : 'opacity-100'}`}>
                {msg.text}
                {!msg.isFinal && <span className="inline-block w-1 h-3 bg-white ml-1 animate-pulse rounded-full"></span>}
              </p>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-600 flex-shrink-0 items-center justify-center flex">
                <User size={18} />
              </div>
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <BrainCircuit size={40} className="mb-2" />
            <p className="font-semibold">{isSessionActive ? "Listening..." : "Co-pilot is offline"}</p>
            <p className="text-xs mt-1">{isSessionActive ? "Start speaking to interact." : "Press the mic button to start."}</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
