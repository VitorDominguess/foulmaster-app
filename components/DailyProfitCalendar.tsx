
import React, { useMemo } from 'react';
import { Bet, BetStatus } from '../types';

interface DailyProfitCalendarProps {
  bets: Bet[];
}

interface DayStats {
  date: string;
  profit: number;
  count: number;
  wins: number;
}

const DailyProfitCalendar: React.FC<DailyProfitCalendarProps> = ({ bets }) => {
  const daysToShow = 70; // Aproximadamente 10 semanas

  const calendarData = useMemo(() => {
    const stats: Record<string, DayStats> = {};
    
    // Filtrar apenas apostas resolvidas
    const settledBets = bets.filter(b => b.status !== BetStatus.OPEN);

    settledBets.forEach(bet => {
      const dateKey = new Date(bet.timestamp).toISOString().split('T')[0];
      if (!stats[dateKey]) {
        stats[dateKey] = { date: dateKey, profit: 0, count: 0, wins: 0 };
      }
      stats[dateKey].profit += bet.profit;
      stats[dateKey].count += 1;
      if (bet.status === BetStatus.WON) stats[dateKey].wins += 1;
    });

    // Gerar array de datas para os últimos X dias
    const result = [];
    const now = new Date();
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      result.push(stats[key] || { date: key, profit: 0, count: 0, wins: 0 });
    }
    return result;
  }, [bets]);

  // Encontrar o maior lucro/prejuízo para escala de cores
  const maxAbsProfit = useMemo(() => {
    const values = calendarData.map(d => Math.abs(d.profit));
    return Math.max(...values, 100); // Mínimo de 100 para não estourar escala
  }, [calendarData]);

  const getDayColor = (day: DayStats) => {
    if (day.count === 0) return 'bg-slate-800/40';
    
    const intensity = Math.min(Math.abs(day.profit) / maxAbsProfit, 1);
    
    if (day.profit > 0) {
      if (intensity < 0.3) return 'bg-emerald-900/60';
      if (intensity < 0.6) return 'bg-emerald-700';
      return 'bg-emerald-500';
    } else if (day.profit < 0) {
      if (intensity < 0.3) return 'bg-rose-950';
      if (intensity < 0.6) return 'bg-rose-800';
      return 'bg-rose-600';
    }
    return 'bg-slate-600'; // Empate exato (0 profit com apostas)
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00'); // Evitar problemas de timezone
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="p-8 bg-slate-950/40 rounded-[2.5rem] border border-slate-800/60 mb-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">Mapa de Calor Operacional</h4>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Últimos 70 dias de atividade</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-rose-500"></div>
             <span className="text-[9px] font-black text-slate-500 uppercase">Prejuízo</span>
           </div>
           <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             <span className="text-[9px] font-black text-slate-500 uppercase">Lucro</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-7 md:grid-cols-10 gap-3">
        {calendarData.map((day, idx) => {
          const winRate = day.count > 0 ? (day.wins / day.count * 100).toFixed(0) : 0;
          
          return (
            <div key={idx} className="group relative flex justify-center">
              <div 
                className={`w-full aspect-square max-w-[40px] rounded-lg transition-all duration-300 hover:ring-2 hover:ring-white/20 cursor-help ${getDayColor(day)}`}
              />
              
              {/* Tooltip */}
              <div className="absolute bottom-full mb-3 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl w-44 backdrop-blur-xl">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2 border-b border-slate-800 pb-2">{formatDate(day.date)}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-slate-400 font-bold">Lucro:</span>
                      <span className={`text-[10px] font-black ${day.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {day.profit >= 0 ? '+' : ''}R$ {day.profit.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-slate-400 font-bold">Apostas:</span>
                      <span className="text-[10px] text-slate-200 font-black">{day.count}</span>
                    </div>
                    {day.count > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[10px] text-slate-400 font-bold">Win Rate:</span>
                        <span className="text-[10px] text-slate-200 font-black">{winRate}%</span>
                      </div>
                    )}
                  </div>
                  {/* Seta do tooltip */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-700" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyProfitCalendar;
