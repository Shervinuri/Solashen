
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GoogleGenAI, Modality, LiveSession } from '@google/genai';
import { TradingViewWidget } from './components/TradingViewWidget';
import { InfoWidget } from './components/InfoWidget';
import { ControlPanel } from './components/ControlPanel';
import { SYSTEM_PROMPT } from './constants';
import type { ChatMessage, MarketData } from './types';
import { decode, decodeAudioData, createBlob, playSfx } from './utils/audioUtils';
import { SFX_PRICE_UP, SFX_PRICE_DOWN, SFX_ALERT } from './assets/audio';
import { Coins, Mic, MicOff, AlertTriangle } from 'lucide-react';

// Component for Microphone Permission Modal
const MicPermissionModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-50 p-4 text-center">
      <div className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md border border-red-500/50">
        <div className="flex justify-center mb-4">
            <MicOff className="text-red-400" size={48} />
        </div>
        <h2 className="text-2xl font-bold mb-4 text-red-400">
          Microphone Access Required
        </h2>
        <p className="text-gray-300 mb-6">
          SOLASHΞN™ needs microphone access to act as your voice co-pilot.
          <br /><br />
          Please <strong>allow</strong> microphone permissions in your browser. You may need to grant access in the site settings and refresh the page if you've previously denied it.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full mt-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
        >
          Refresh Page
        </button>
      </div>
    </div>
);

// Component for No Microphone Found Modal
const NoMicModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-50 p-4 text-center">
      <div className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md border border-yellow-500/50">
        <div className="flex justify-center mb-4">
            <MicOff className="text-yellow-400" size={48} />
        </div>
        <h2 className="text-2xl font-bold mb-4 text-yellow-400">
          Microphone Not Found
        </h2>
        <p className="text-gray-300 mb-6">
          SOLASHΞN™ could not detect a microphone on your device.
          <br /><br />
          Please ensure a microphone is connected and working, then refresh the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full mt-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
        >
          Refresh Page
        </button>
      </div>
    </div>
);

// Component for Fatal Error Modal
const FatalErrorModal = ({ message }: { message: string }) => (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[100] p-4 text-center">
      <div className="bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-lg border-2 border-red-500/50">
        <div className="flex justify-center mb-4">
            <AlertTriangle className="text-red-400" size={48} />
        </div>
        <h2 className="text-2xl font-bold mb-4 text-red-400">
          A Critical Error Occurred
        </h2>
        <div className="text-gray-300 mb-6 text-left">
          <p className="mb-2">The application encountered an unrecoverable error and cannot continue:</p>
          <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-900 p-4 rounded-md overflow-x-auto">
            {message}
          </pre>
        </div>
        <p className="text-gray-400">
           Please check your environment configuration, API permissions, and then refresh the page.
        </p>
      </div>
    </div>
);


// Main App Component
export default function App() {
  const [session, setSession] = useState<LiveSession | null>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'not_found'>('prompt');
  const isModelSpeakingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const [marketData, setMarketData] = useState<MarketData>({
    solPrice: 0,
    btcPrice: 0,
    usdToIrr: 595000,
  });
  const previousSolPriceRef = useRef<number>(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const inputAudioContext = useMemo(() => new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 }), []);
  const outputAudioContext = useMemo(() => new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }), []);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());

  const stopSession = useCallback(() => {
    session?.close();
    setSession(null);
    sessionPromiseRef.current = null;
    
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (audioSourceRef.current && scriptProcessorRef.current) {
        audioSourceRef.current.disconnect(scriptProcessorRef.current);
        scriptProcessorRef.current.disconnect(inputAudioContext.destination);
    }
    
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    
    scriptProcessorRef.current = null;
    audioSourceRef.current = null;
    isModelSpeakingRef.current = false;

    setIsSessionActive(false);
  }, [session, inputAudioContext]);

  const startSession = useCallback(async () => {
    if (isSessionActive || micPermission === 'denied' || micPermission === 'not_found' || fatalError) return;

    if (outputAudioContext.state === 'suspended') {
      try {
        await outputAudioContext.resume();
      } catch (e) {
        console.error("Failed to resume output audio context:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        setFatalError(`Could not activate audio playback. Please interact with the page and try again. Error: ${errorMessage}`);
        return;
      }
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
        mediaStreamRef.current = stream;
        setMicPermission('granted');

        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    if (!mediaStreamRef.current) return;
                    const sourceNode = inputAudioContext.createMediaStreamSource(mediaStreamRef.current);
                    audioSourceRef.current = sourceNode;
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    
                    sourceNode.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                    setIsSessionActive(true);
                },
                onmessage: async (message) => {
                    if (message.serverContent?.interrupted) {
                        audioSourcesRef.current.forEach(source => source.stop());
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                        isModelSpeakingRef.current = false;
                    }

                    if (message.serverContent?.inputTranscription) {
                        currentInputTranscription.current += message.serverContent.inputTranscription.text;
                        setChatMessages(prev => {
                            const newMessages = [...prev];
                            const lastMsg = newMessages[newMessages.length - 1];
                            if (lastMsg && lastMsg.role === 'user' && !lastMsg.isFinal) {
                                lastMsg.text = currentInputTranscription.current;
                            } else {
                                newMessages.push({ role: 'user', text: currentInputTranscription.current, isFinal: false });
                            }
                            return newMessages;
                        });
                    }

                    if (message.serverContent?.outputTranscription) {
                        currentOutputTranscription.current += message.serverContent.outputTranscription.text;
                        setChatMessages(prev => {
                            const newMessages = [...prev];
                            const lastMsg = newMessages[newMessages.length - 1];
                            if (lastMsg && lastMsg.role === 'model' && !lastMsg.isFinal) {
                                lastMsg.text = currentOutputTranscription.current;
                            } else {
                                newMessages.push({ role: 'model', text: currentOutputTranscription.current, isFinal: false });
                            }
                            return newMessages;
                        });
                    }

                    if (message.serverContent?.turnComplete) {
                        setChatMessages(prev => prev.map(msg => msg.isFinal ? msg : { ...msg, isFinal: true }));
                        currentInputTranscription.current = '';
                        currentOutputTranscription.current = '';
                    }

                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    
                    if (base64Audio) {
                        if (!isModelSpeakingRef.current) {
                           playSfx(outputAudioContext, SFX_ALERT);
                        }

                        if (outputAudioContext.state === 'suspended') {
                            await outputAudioContext.resume();
                        }
                        isModelSpeakingRef.current = true;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                        const source = outputAudioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputAudioContext.destination);
                        source.addEventListener('ended', () => {
                            audioSourcesRef.current.delete(source);
                            if (audioSourcesRef.current.size === 0) isModelSpeakingRef.current = false;
                        });
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }
                },
                onclose: () => {
                    stopSession();
                },
                onerror: (e: any) => {
                    console.error('Live session error:', e);
                    setFatalError(`The live session failed. This might be due to a connection issue or invalid API permissions. Error: ${e.message}`);
                    setIsSessionActive(false);
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                systemInstruction: SYSTEM_PROMPT,
            },
        });
        
        const newSession = await sessionPromiseRef.current;
        setSession(newSession);

    } catch (err) {
        console.error("Failed to start session:", err);
        if (err instanceof Error) {
          if (err.name === 'NotFoundError') {
            setMicPermission('not_found');
          } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setMicPermission('denied');
          } else if (err.message.toLowerCase().includes('api key')) {
             setFatalError(`API Key Error: ${err.message}. Please ensure the environment is configured with a valid and enabled Gemini API key.`);
          } else {
             setFatalError(`An unexpected error occurred while starting the session: ${err.message}`);
          }
        }
    }
  }, [isSessionActive, micPermission, outputAudioContext, inputAudioContext, fatalError, stopSession]);

  useEffect(() => {
    const checkMicPermission = async () => {
        try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            if (permissionStatus.state === 'denied') {
                setMicPermission('denied');
                return;
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasMic = devices.some(device => device.kind === 'audioinput');
            if (!hasMic) {
                setMicPermission('not_found');
            }
        } catch (e) {
            console.warn("Could not query microphone permissions:", e);
        }
    };
    checkMicPermission();
  }, []);
  
  useEffect(() => {
    const PRICE_APIS = [
        'https://api.binance.com/api/v3/ticker/price?symbols=["SOLUSDT","BTCUSDT"]',
        'https://api1.binance.com/api/v3/ticker/price?symbols=["SOLUSDT","BTCUSDT"]',
        'https://api2.binance.com/api/v3/ticker/price?symbols=["SOLUSDT","BTCUSDT"]',
        'https://api3.binance.com/api/v3/ticker/price?symbols=["SOLUSDT","BTCUSDT"]',
    ];
    let currentApiIndex = 0;

    const fetchPrices = async () => {
      for (let i = 0; i < PRICE_APIS.length; i++) {
        const apiUrl = PRICE_APIS[(currentApiIndex + i) % PRICE_APIS.length];
        try {
          const response = await fetch(apiUrl);
          if (!response.ok) throw new Error(`API failed: ${response.statusText}`);
          const data = await response.json();
          const sol = data.find((d: any) => d.symbol === 'SOLUSDT');
          const btc = data.find((d: any) => d.symbol === 'BTCUSDT');
          
          if (sol && btc) {
            const newSolPrice = parseFloat(sol.price);
            const oldSolPrice = previousSolPriceRef.current;
            const PRICE_CHANGE_THRESHOLD = 0.10;

            if (oldSolPrice > 0) {
                if (newSolPrice > oldSolPrice + PRICE_CHANGE_THRESHOLD) {
                    playSfx(outputAudioContext, SFX_PRICE_UP);
                } else if (newSolPrice < oldSolPrice - PRICE_CHANGE_THRESHOLD) {
                    playSfx(outputAudioContext, SFX_PRICE_DOWN);
                }
            }
            previousSolPriceRef.current = newSolPrice;

            setMarketData(prev => ({ ...prev, solPrice: newSolPrice, btcPrice: parseFloat(btc.price) }));
            currentApiIndex = (currentApiIndex + i + 1) % PRICE_APIS.length;
            return;
          }
        } catch (error) {
          console.warn(`Failed to fetch from ${apiUrl}, trying next...`);
        }
      }
      console.error("All price APIs failed.");
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 20000);
    return () => clearInterval(interval);
  }, [outputAudioContext]);

  return (
    <div className="min-h-screen flex flex-col p-2 sm:p-4 bg-gray-900 text-gray-200 font-sans">
      {fatalError && <FatalErrorModal message={fatalError} />}
      {micPermission === 'denied' && <MicPermissionModal />}
      {micPermission === 'not_found' && <NoMicModal />}
      
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
          SOLASHΞN™
        </h1>
        <div className="flex items-center space-x-4">
          <button 
            onClick={isSessionActive ? stopSession : startSession} 
            className={`p-2 rounded-full transition-colors ${
              micPermission === 'denied' || micPermission === 'not_found' || !!fatalError
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : isSessionActive 
                  ? 'bg-green-500/30 text-green-400 animate-pulse' 
                  : 'bg-red-500/30 text-red-400'
            }`}
            disabled={micPermission === 'denied' || micPermission === 'not_found' || !!fatalError}
            aria-label={isSessionActive ? "Stop Session" : "Start Session"}
          >
            {isSessionActive ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
        </div>
      </header>

      <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-[50vh] lg:h-auto min-h-[300px]">
          <TradingViewWidget />
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
             <InfoWidget icon={<Coins className="text-yellow-400" />} title="SOL Price">
              <p className="text-xl sm:text-2xl font-bold text-gray-100">${marketData.solPrice.toFixed(2)}</p>
            </InfoWidget>
            <InfoWidget icon={<Coins className="text-orange-400" />} title="BTC Price">
              <p className="text-xl sm:text-2xl font-bold text-gray-100">${(marketData.btcPrice / 1000).toFixed(2)}k</p>
            </InfoWidget>
          </div>
          <ControlPanel messages={chatMessages} isSessionActive={isSessionActive} />
        </div>
      </main>
      <footer className="text-center mt-4">
        <a href="https://t.me/shervini" target="_blank" rel="noopener noreferrer" 
           className="text-xs text-transparent bg-clip-text bg-gradient-to-r from-gray-400 via-white to-gray-400 animate-pulse">
          Exclusive SHΞN™ made
        </a>
      </footer>
    </div>
  );
}
