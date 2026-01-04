import React, { useMemo } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar
} from 'recharts';
import { Bet, BetStatus } from '../types';

interface BIDashboardProps {
  bets: Bet[];
  currentBalance: number;
}

const currencyFormatter = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(value);

const BIDashboard: React.FC<BIDashboardProps> = ({ bets, currentBalance }) => {
  const settledBets = useMemo(
    () => bets.filter(b => b.status !== BetStatus.OPEN),
    [bets]
  );

  const metrics = useMemo(() => {
    if (settledBets.length === 0) return null;

    let maxProfit = 0;
    let currentCumulative = 0;
    let maxDrawdown = 0;
    let winCount = 0;
    let totalStake = 0;
    let totalProfit = 0;

    const sorted = [...settledBets].sort((a, b) => a.timestamp - b.timestamp);

    sorted.forEach(b => {
      totalStake += b.stake;
      totalProfit += b.profit;
      currentCumulative += b.profit;

      if (b.status === BetStatus.WON) winCount++;

      if (currentCumulative > maxProfit) maxProfit = currentCumulative;
      const drawdown = maxProfit - currentCumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    const winRate = (winCount / settledBets.length) * 100;
    const roi = (totalProfit / totalStake) * 100;
    const avgEV =
      settledBets.reduce((acc, b) => acc + b.edge, 0) / settledBets.length;
    const avgErrorIA =
      settledBets.reduce(
        (acc, b) =>
          acc + Math.abs(b.iaPrediction - (b.actualFouls || 0)),
        0
      ) / settledBets.length;
    const avgErrorBookie =
      settledBets.reduce(
        (acc, b) =>
          acc + Math.abs(b.bookieLine - (b.actualFouls || 0)),
        0
      ) / settledBets.length;

    const clv = roi / (avgEV || 1);

    return {
      maxDrawdown,
      avgErrorIA,
      avgErrorBookie,
      avgEV,
      totalProfit,
      roi,
      winRate,
      totalStake,
      clv,
      winCount,
      settledCount: settledBets.length
    };
  }, [settledBets]);

  const chartData = useMemo(() => {
    const dailyMap: Record<string, number> = {};

    settledBets.forEach(b => {
      const day = new Date(b.timestamp).toISOString().slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + b.profit;
    });

    let cumulative = 0;
    let peak = 0;

    return Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, dailyProfit]) => {
        cumulative += dailyProfit;
        peak = Math.max(peak, cumulative);

        return {
          date: day,
          dateLabel: new Date(day).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short'
          }),
          cumulative,
          drawdown: cumulative - peak
        };
      });
  }, [settledBets]);

  if (settledBets.length === 0) {
    return (
      <div className="py-24 text-center bg-slate-900/40 rounded-[3rem] border border-slate-800 border-dashed animate-in fade-in">
        <p className="text-slate-500 font-bold text-lg">
          Aguardando dados de performance finalizados...
        </p>
        <p className="text-slate-600 text-sm mt-2">
          Resolva os jogos em andamento para gerar inteligência.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-12 animate-in fade-in duration-1000">
      <div className="bg-slate-900/60 p-10 rounded-[3rem] border border-slate-800 shadow-2xl backdrop-blur-xl">
        <div className="flex justify-between items-center mb-10">
          <h3 className="text-xl font-black">Evolução do Lucro (R$)</h3>
          <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              Lucro acumulado
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              Drawdown
            </span>
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="#1e293b"
                vertical={false}
              />
              <XAxis
                dataKey="dateLabel"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={currencyFormatter}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#020617',
                  border: '1px solid #334155',
                  borderRadius: '1.5rem',
                  padding: '14px'
                }}
                formatter={(value: number) => currencyFormatter(value)}
                labelFormatter={label => `Data: ${label}`}
              />

              <Bar
                dataKey="drawdown"
                name="Drawdown"
                fill="#ef4444"
                barSize={14}
              />

              <Line
                type="monotone"
                dataKey="cumulative"
                name="Lucro acumulado"
                stroke="#22c55e"
                strokeWidth={3}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default BIDashboard;
