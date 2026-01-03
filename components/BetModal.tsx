
import React, { useState } from 'react';
import { Match } from '../types';

interface BetModalProps {
  matches: Match[];
  currentBalance: number;
  onConfirm: (stake: number) => void;
  onCancel: () => void;
}

const BetModal: React.FC<BetModalProps> = ({ matches, currentBalance, onConfirm, onCancel }) => {
  const [stake, setStake] = useState<number>(100);

  const isBatch = matches.length > 1;
  const totalStakeNeeded = matches.length * stake;
  const isInsufficient = totalStakeNeeded > currentBalance;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold mb-4 text-slate-100">
          {isBatch ? `Registrar ${matches.length} Apostas` : 'Registrar Aposta'}
        </h2>
        
        <div className="space-y-4 mb-6">
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700 max-h-48 overflow-y-auto">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Partida(s) Selecionada(s)</div>
            {matches.map(m => (
              <div key={m.id} className="text-sm py-1 border-b border-slate-800 last:border-0">
                <span className="font-medium text-slate-200">{m.homeTeam} x {m.awayTeam}</span>
                <span className="text-slate-500 ml-2">({m.type} {m.bookieLine})</span>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Stake {isBatch ? 'por Aposta' : ''} (R$)
            </label>
            <input 
              type="number"
              autoFocus
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className={`w-full bg-slate-900 border rounded-xl p-3 text-slate-100 focus:outline-none focus:ring-2 transition-all text-xl font-bold ${isInsufficient ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-700 focus:ring-blue-500'}`}
              placeholder="Ex: 100"
            />
            
            <div className="mt-2 flex justify-between items-center">
              <div className="text-xs text-slate-500 font-medium">
                Investimento Total: <span className={isInsufficient ? 'text-rose-400' : 'text-blue-400'}>R$ {totalStakeNeeded.toFixed(2)}</span>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Saldo: <span className="text-slate-300">R$ {currentBalance.toFixed(2)}</span>
              </div>
            </div>

            {isInsufficient && (
              <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                Saldo insuficiente para esta aposta.
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onConfirm(stake)}
            disabled={isInsufficient || stake <= 0}
            className={`flex-1 py-3 px-4 text-white rounded-xl font-bold shadow-lg transition-all transform ${isInsufficient || stake <= 0 ? 'bg-slate-600 opacity-50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] shadow-blue-900/20'}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default BetModal;
