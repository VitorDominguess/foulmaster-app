import React, { useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area
} from 'recharts';
import { Bet, BetStatus } from '../types';

interface BIDashboardProps {
  bets: Bet[];
  currentBalance: number;
}

const BIDashboard: React.FC<BIDashboardProps> = ({ bets, currentBalance }) => {
  // Performance BI deve focar APENAS em apostas finalizadas para ser preciso
  const settledBets = useMemo(() => bets.filter(b => b.status !== BetStatus.OPEN), [bets]);

  const metrics = useMemo(() => {
    if (settledBets.length === 0) return null;

    let maxProfit = 0;
    let currentCumulative = 0;
    let maxDrawdown = 0;
    let winCount = 0;
    let totalStake = 0;
    let totalProfit = 0;

    // Ordenar por timestamp para cálculo cronológico de drawdown e evolução
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
    const avgEV = settledBets.reduce((acc, b) => acc + b.edge, 0) / settledBets.length;
    const avgErrorIA = settledBets.reduce((acc, b) => acc + Math.abs(b.iaPrediction - (b.actualFouls || 0)), 0) / settledBets.length;
    const avgErrorBookie = settledBets.reduce((acc, b) => acc + Math.abs(b.bookieLine - (b.actualFouls || 0)), 0) / settledBets.length;
    
    // CLV Simplificado: Lucratividade vs O que era esperado
    // Se o ROI for maior que o EV projetado, o modelo está superperformando
    const clv = roi / (avgEV || 1);

    return { 
      maxDrawdown, avgErrorIA, avgErrorBookie, avgEV, totalProfit, roi, 
      winRate, totalStake, clv, winCount, settledCount: settledBets.length 
    };
  }, [settledBets]);

  const chartData = useMemo(() => {
  const dailyMap: Record<string, number> = {};

  settledBets.forEach(b => {
    const day = new Date(b.timestamp).toISOString().slice(0, 10); // YYYY-MM-DD
    dailyMap[day] = (dailyMap[day] || 0) + b.profit;
  });

  let cumulative = 0;

  return Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dailyProfit]) => {
      cumulative += dailyProfit;
      return {
        name: new Date(day).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short'
        }),
        value: cumulative
      };
    });
}, [settledBets]);


  if (settledBets.length === 0) {
    return (
      <div className="py-24 text-center bg-slate-900/40 rounded-[3rem] border border-slate-800 border-dashed animate-in fade-in">
        <p className="text-slate-500 font-bold text-lg">Aguardando dados de performance finalizados...</p>
        <p className="text-slate-600 text-sm mt-2">Resolva os jogos em andamento para gerar inteligência.</p>
      </div>
    );
  }

  const DiagnosisItem = ({ question, success, value }: { question: string, success: boolean, value: string }) => (
    <div className={`p-8 rounded-[2.5rem] border-2 transition-all group relative overflow-hidden ${success ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
      <div className="flex justify-between items-start mb-4">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{question}</span>
        <div className={`px-4 py-1 rounded-full text-[10px] font-black tracking-widest ${success ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
          {success ? 'SIM' : 'NÃO'}
        </div>
      </div>
      <div className={`text-2xl font-black ${success ? 'text-emerald-400' : 'text-rose-400'}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-12 pb-12 animate-in fade-in duration-1000">
      
      {/* Diagnóstico de Performance (O Oráculo) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <DiagnosisItem 
          question="Lucro Operacional?" 
          success={(metrics?.totalProfit || 0) > 0} 
          value={`R$ ${metrics?.totalProfit.toFixed(2)}`} 
        />
        <DiagnosisItem 
          question="ROI Saudável (>3%)?" 
          success={(metrics?.roi || 0) > 3} 
          value={`${metrics?.roi.toFixed(2)}% ROI`} 
        />
        <DiagnosisItem 
          question="Risco Controlado?" 
          success={(metrics?.maxDrawdown || 0) < currentBalance * 0.2} 
          value={`${((metrics?.maxDrawdown || 0) / currentBalance * 100).toFixed(1)}% DD`} 
        />
        <DiagnosisItem 
          question="Modelo Bate Mercado?" 
          success={(metrics?.avgErrorIA || 0) < (metrics?.avgErrorBookie || 0)} 
          value={`${metrics?.avgErrorIA.toFixed(1)} vs ${metrics?.avgErrorBookie.toFixed(1)}`} 
        />
        <DiagnosisItem 
          question="Escalável?" 
          success={(metrics?.clv || 0) > 0.8 && (metrics?.settledCount || 0) > 15} 
          value={`${metrics?.clv.toFixed(2)} Efficiency`} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Evolução Acumulada */}
        <div className="lg:col-span-2 bg-slate-900/60 p-10 rounded-[3rem] border border-slate-800 shadow-2xl backdrop-blur-xl">
          <div className="flex justify-between items-center mb-10">
             <h3 className="text-xl font-black">Evolução do Lucro (R$)</h3>
             <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Saldo Acumulado</span>
             </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="5 5" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" hide />
                <YAxis stroke="#475569" fontSize={12} fontWeight="bold" axisLine={false} tickLine={false} tickFormatter={(val) => `R$${val}`} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '1.5rem', padding: '15px'}}
                  itemStyle={{color: '#3b82f6', fontWeight: 'bold'}}
                />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={4} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Estatísticas Operacionais */}
        <div className="bg-slate-900/60 p-10 rounded-[3rem] border border-slate-800 shadow-2xl flex flex-col">
          <h3 className="text-xl font-black mb-10">Análise Operacional</h3>
          <div className="space-y-8 grow">
            <div className="flex justify-between items-end border-b border-slate-800 pb-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Drawdown Máximo</span>
              <span className="text-xl font-black text-rose-400">R$ {metrics?.maxDrawdown.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-end border-b border-slate-800 pb-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">EV Médio (Value)</span>
              <span className="text-xl font-black text-emerald-400">+{metrics?.avgEV.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between items-end border-b border-slate-800 pb-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Erro do Modelo IA</span>
              <span className="text-xl font-black text-blue-400">{metrics?.avgErrorIA.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-end pb-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Erro da Casa</span>
              <span className="text-xl font-black text-slate-400">{metrics?.avgErrorBookie.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-slate-950/60 rounded-3xl border border-slate-800/50">
            <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Conclusão de Mercado</p>
            <p className="text-xs text-slate-400 leading-relaxed italic">
              A IA está sendo <span className="text-blue-400 font-bold">{metrics && metrics.avgErrorIA < metrics.avgErrorBookie ? 'mais eficiente' : 'menos eficiente'}</span> que os oddmakers na precificação de faltas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BIDashboard;
