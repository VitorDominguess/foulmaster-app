
export enum BetType {
  UNDER = 'UNDER',
  OVER = 'OVER'
}

export enum BetStatus {
  OPEN = 'OPEN',
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID'
}

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  BET_RESULT = 'BET_RESULT'
}

export interface Match {
  id: string;
  fixture_id?: string;
  date: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  referee: string;
  iaPrediction: number;
  bookieLine: number;
  odd: number;
  edge: number;
  type: BetType;
}

export interface Bet extends Match {
  stake: number;
  status: BetStatus;
  actualFouls?: number;
  profit: number;
  timestamp: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  timestamp: number;
}

export interface BankrollState {
  currentBalance: number;
  initialDeposit: number;
  totalProfit: number;
}
