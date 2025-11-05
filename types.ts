
export interface MarketData {
  solPrice: number;
  btcPrice: number;
  usdToIrr: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string | null;
  isFinal?: boolean;
}
