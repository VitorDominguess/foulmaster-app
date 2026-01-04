import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  ReferenceLine,
  Cell,
  Legend
} from 'recharts';

// --- TYPES (Simulados para contexto de Faltas/Props) ---
export enum BetStatus {
  OPEN = 'OPEN',
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID'
}

export interface Bet {
  id: string;
  timestamp: number;
  fixture: string;
  market: string;
  selection: string;
  stake: number;
  odds: number;
  profit: number; // Negativo se loss
  status: BetStatus;
  edge: number; // EV+ calculado pela IA
  closingLine: number; // Odd de fechamento
  iaPrediction: number; // Ex: 12.5 faltas
  bookieLine: number; // Ex: 10.5 faltas
  actualResult: number; // Ex: 14 faltas
}

interface BIDashboardProps {
  bets: Bet[];
}

// --- HELPERS ---
const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatPct = (v: number) => `${v.toFixed(1)}%`;

// --- COMPONENTES UI (Mini Design System) ---
const Card = ({ title, children, className = '' }: any) => (
  <div className={`bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm ${className}`}>
    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">{title}</h3>
    {children}
  </div>
);

const KPICard = ({ label, value, sub, color = 'text-white' }: any) => (
  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
    <p className="text-slate-500 text-xs uppercase font-semibold">{label}</p>
    <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
    {sub && <p className="text-xs text-slate-400 mt-2">{sub}</p>}
  </div>
);

const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-950 border border-slate-800 p-3 rounded shadow-xl text-xs">
        <p className="font-bold text-slate-200 mb-2">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-400 capitalize">{p.name}:</span>
            <span className="font-mono text-slate-200 font-bold">
              {formatter ? formatter(p.value) : p.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// --- COMPONENTE PRINCIPAL ---
const BettingAIDashboard: React.FC<BIDashboardProps> = ({ bets }) => {
  // 1. STATE & FILTROS
  const [daysFilter, setDaysFilter] = useState(30);
  const [minEdge, setMinEdge] = useState(0.02); // 2%
  const [minStake, setMinStake] = useState(0);

  // 2. DATA PROCESSING (O Core da Performance)
  const { filtered, kpis, timeSeries, oddRanges, distribution, modelMetrics } = useMemo(() => {
    const now = Date.now();
    const cutoff = now - daysFilter * 24 * 60 * 60 * 1000;

    // A. Filtragem
    const filteredData = bets
      .filter(b => b.status !== BetStatus.OPEN && b.status !== BetStatus.VOID)
      .filter(b => b.timestamp >= cutoff)
      .filter(b => b.edge >= minEdge)
      .filter(b => b.stake >= minStake)
      .sort((a, b) => a.timestamp - b.timestamp);

    // B. Variáveis Acumuladoras
    let accProfit = 0;
    let accStake = 0;
    let wins = 0;
    let peak = 0;
    let maxDD = 0;
    
    // Mapas para agrupamento
    const dailyMap: Record<string, { profit: number; vol: number; stake: number }> = {};
    const oddsMap: Record<string, { wins: number; total: number; profit: number }> = {
      '1.0-1.5': { wins: 0, total: 0, profit: 0 },
      '1.5-1.8': { wins: 0, total: 0, profit: 0 },
      '1.8-2.0': { wins: 0, total: 0, profit: 0 },
      '2.0-2.5': { wins: 0, total: 0, profit: 0 },
      '2.5+': { wins: 0, total: 0, profit: 0 },
    };
    
    // Métricas de Erro (MAE)
    let totalErrorIA = 0;
    let totalErrorBook = 0;
    let validComparisonCount = 0;

    // C. Loop Único para Performance
    filteredData.forEach(b => {
      // KPI basics
      accProfit += b.profit;
      accStake += b.stake;
      if (b.status === BetStatus.WON) wins++;
      
      // Drawdown
      peak = Math.max(peak, accProfit);
      const currentDD = peak - accProfit;
      maxDD = Math.max(maxDD, currentDD);

      // Time Series Map
      const dateKey = new Date(b.timestamp).toLocaleDateString('pt-BR');
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { profit: 0, vol: 0, stake: 0 };
      dailyMap[dateKey].profit += b.profit;
      dailyMap[dateKey].vol += 1;
      dailyMap[dateKey].stake += b.stake;

      // Odds Range Logic
      let rangeKey = '2.5+';
      if (b.odds < 1.5) rangeKey = '1.0-1.5';
      else if (b.odds < 1.8) rangeKey = '1.5-1.8';
      else if (b.odds < 2.0) rangeKey = '1.8-2.0';
      else if (b.odds < 2.5) rangeKey = '2.0-2.5';
      
      oddsMap[rangeKey].total++;
      oddsMap[rangeKey].profit += b.profit;
      if (b.status === BetStatus.WON) oddsMap[rangeKey].wins++;

      // Error Calculation (Faltas/Cantos/Pontos)
      if (b.iaPrediction && b.actualResult && b.bookieLine) {
        totalErrorIA += Math.abs(b.iaPrediction - b.actualResult);
        totalErrorBook += Math.abs(b.bookieLine - b.actualResult);
        validComparisonCount++;
      }
    });

    // D. Montagem dos Arrays para Gráficos
    let runningProfit = 0;
    let runningStake = 0;

    const timeSeriesData = Object.keys(dailyMap).map(date => {
        const day = dailyMap[date];
        runningProfit += day.profit;
        runningStake += day.stake;
        
        return {
            date,
            dailyProfit: day.profit,
            accProfit: runningProfit,
            volume: day.vol,
            roi: runningStake > 0 ? (runningProfit / runningStake) * 100 : 0,
            drawdown: runningProfit - Math.max(peak, runningProfit) // Simplificação visual
        };
    });

    // Dados de Distribuição (Histograma simples)
    const profits = filteredData.map(b => b.profit);
    const minP = Math.floor(Math.min(...profits));
    const maxP = Math.ceil(Math.max(...profits));
    const binCount = 10;
    const step = (maxP - minP) / binCount;
    const distData = Array.from({ length: binCount }, (_, i) => {
        const start = minP + (i * step);
        const end = start + step;
        const count = profits.filter(p => p >= start && p < end).length;
        return { range: `${Math.floor(start)} a ${Math.floor(end)}`, count };
    });

    // Dados de Odds
    const oddsData = Object.entries(oddsMap).map(([range, data]) => ({
        range,
        winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
        volume: data.total,
        profit: data.profit
    }));

    // Métricas Finais
    return {
      filtered: filteredData,
      kpis: {
        totalProfit: accProfit,
        roi: accStake > 0 ? (accProfit / accStake) * 100 : 0,
        winRate: filteredData.length > 0 ? (wins / filteredData.length) * 100 : 0,
        maxDD,
        count: filteredData.length,
        avgEdge: filteredData.reduce((sum, b) => sum + b.edge, 0) / (filteredData.length || 1)
      },
      timeSeries: timeSeriesData,
      oddRanges: oddsData,
      distribution: distData,
      modelMetrics: {
        maeIA: validComparisonCount ? totalErrorIA / validComparisonCount : 0,
        maeBook: validComparisonCount ? totalErrorBook / validComparisonCount : 0,
        diff: validComparisonCount ? ((totalErrorBook - totalErrorIA) / totalErrorBook) * 100 : 0
      }
    };
  }, [bets, daysFilter, minEdge, minStake]);

  // 3. GERAÇÃO DE INSIGHTS AUTOMÁTICOS
  const insights = useMemo(() => {
    const i = [];
    if (kpis.roi > 5) i.push("🔥 Sistema altamente lucrativo com ROI acima de 5%.");
    if (kpis.roi < 0) i.push("⚠️ Atenção: ROI negativo no período selecionado.");
    
    const bestRange = oddRanges.reduce((a, b) => a.profit > b.profit ? a : b);
    if (bestRange.volume > 5) i.push(`🎯 Sua "Zona de Ouro" são odds ${bestRange.range} (Lucro: ${formatBRL(bestRange.profit)}).`);
    
    if (modelMetrics.maeIA < modelMetrics.maeBook) {
        i.push(`🤖 A IA é ${modelMetrics.diff.toFixed(1)}% mais precisa que a Casa de Apostas.`);
    } else {
        i.push(`📉 Cuidado: A Casa está precificando melhor que o modelo.`);
    }

    if (kpis.maxDD > kpis.totalProfit * 0.5) i.push("🛡️ Risco Alto: Seu Drawdown histórico é >50% do lucro atual.");

    return i;
  }, [kpis, oddRanges, modelMetrics]);


  // --- RENDER ---
  return (
    <div className="bg-slate-950 text-slate-200 p-8 min-h-screen font-sans">
      
      {/* HEADER & CONTROLS */}
      <header className="mb-8 flex flex-wrap justify-between items-end gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">AI Betting Intelligence</h1>
          <p className="text-slate-400">Dashboard de Performance & Validação de Modelo</p>
        </div>
        
        <div className="flex gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">Período (Dias)</label>
            <select 
              value={daysFilter} 
              onChange={e => setDaysFilter(+e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-2 text-sm focus:border-blue-500 outline-none"
            >
              <option value="7">7 Dias</option>
              <option value="30">30 Dias</option>
              <option value="90">3 Meses</option>
              <option value="365">Todo o Tempo</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">Edge Mínimo</label>
            <input 
              type="number" 
              step="0.01"
              value={minEdge}
              onChange={e => setMinEdge(+e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded p-2 text-sm w-24"
            />
          </div>
        </div>
      </header>

      {/* 1. SEÇÃO DE KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KPICard label="Lucro Líquido" value={formatBRL(kpis.totalProfit)} color={kpis.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <KPICard label="ROI Atual" value={formatPct(kpis.roi)} sub={`em ${kpis.count} apostas`} />
        <KPICard label="Win Rate" value={formatPct(kpis.winRate)} />
        <KPICard label="Max Drawdown" value={formatBRL(kpis.maxDD)} color="text-red-400" />
        <KPICard label="Precisão Modelo" value={`${modelMetrics.maeIA.toFixed(2)} MAE`} sub={`Bookie: ${modelMetrics.maeBook.toFixed(2)}`} />
      </div>

      {/* 2. INSIGHTS BOX */}
      <div className="bg-blue-900/20 border border-blue-800/50 p-6 rounded-xl mb-8">
        <h3 className="text-blue-400 font-bold mb-3 flex items-center gap-2">🧠 Insights da IA</h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {insights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-blue-100">
                    <span>•</span> {insight}
                </li>
            ))}
        </ul>
      </div>

      {/* 3. GRÁFICOS TEMPORAIS (Lucro, ROI, Volume) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* CHART 1: Lucro Acumulado & Drawdown */}
        <Card title="Curva de Lucro & Drawdown" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="date" tick={{fill: '#94a3b8', fontSize: 10}} minTickGap={30} />
              <YAxis yAxisId="left" tick={{fill: '#94a3b8', fontSize: 10}} tickFormatter={val => `R$${val}`} />
              <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
              <Area yAxisId="left" type="monotone" dataKey="drawdown" fill="#ef4444" stroke="none" opacity={0.1} name="Drawdown" />
              <Line yAxisId="left" type="monotone" dataKey="accProfit" stroke="#10b981" strokeWidth={2} dot={false} name="Lucro Acum." />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* CHART 4: ROI ao Longo do Tempo */}
        <Card title="Consistência do ROI">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={false} />
                <YAxis tickFormatter={val => `${val}%`} tick={{fill: '#94a3b8', fontSize: 10}} />
                <Tooltip content={<CustomTooltip formatter={formatPct} />} />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                <Line type="step" dataKey="roi" stroke="#3b82f6" dot={false} strokeWidth={2} name="ROI %" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* CHART 3: Lucro Diário */}
          <Card title="Resultado Diário">
            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={timeSeries}>
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip formatter={formatBRL} />} />
                    <ReferenceLine y={0} stroke="#475569" />
                    <Bar dataKey="dailyProfit" name="Lucro Dia">
                        {timeSeries.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.dailyProfit >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* CHART 10: Volume de Apostas */}
          <Card title="Volume de Apostas">
            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={timeSeries}>
                    <XAxis dataKey="date" hide />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="volume" fill="#64748b" name="Qtd Apostas" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
          </Card>

           {/* CHART 9: Distribuição de Resultados */}
           <Card title="Distribuição de Profit (Histograma)">
            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={distribution}>
                    <XAxis dataKey="range" tick={{fontSize: 10}} hide />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#8b5cf6" name="Frequência" />
                </BarChart>
            </ResponsiveContainer>
          </Card>
      </div>

      {/* 4. ANÁLISE ESTRATÉGICA */}
      <h2 className="text-xl font-bold text-white mb-4 mt-8">Análise de Estratégia</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          
          {/* CHART 7: Win Rate por Odd */}
          <Card title="Win Rate & Volume por Faixa de Odd">
            <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={oddRanges}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="range" tick={{fill: '#cbd5e1'}} />
                    <YAxis yAxisId="left" orientation="left" tickFormatter={val => `${val}%`} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip content={<CustomTooltip formatter={formatPct} />} />
                    <Bar yAxisId="right" dataKey="volume" fill="#334155" opacity={0.5} name="Volume" />
                    <Line yAxisId="left" type="monotone" dataKey="winRate" stroke="#f59e0b" strokeWidth={3} name="Win Rate" />
                </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* CHART 8: Comparativo de Erro (IA vs Bookie) */}
          <Card title="Quem erra menos? (Mean Absolute Error)">
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                    { name: 'Modelo IA', error: modelMetrics.maeIA, fill: '#10b981' },
                    { name: 'Casa de Aposta', error: modelMetrics.maeBook, fill: '#ef4444' }
                ]} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tick={{fill: '#94a3b8'}} />
                    <YAxis dataKey="name" type="category" width={100} tick={{fill: '#e2e8f0', fontWeight: 'bold'}} />
                    <Tooltip cursor={{fill: 'transparent'}} content={<CustomTooltip />} />
                    <Bar dataKey="error" barSize={40} name="Erro Médio (Unidades)" radius={[0, 4, 4, 0]}>
                         {/* Cell define cor individual se necessário, mas já está no data */}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-slate-400 mt-4 text-center">
                *Quanto menor a barra, mais preciso é o preditor.
            </p>
          </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CHART 6: Edge vs Profit */}
          <Card title="Correlação: Edge vs Lucro Real">
            <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{top: 10, right: 10, bottom: 10, left: 10}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" dataKey="edge" name="Edge IA" tickFormatter={(v) => v.toFixed(2)} label={{ value: 'Edge Identificado', position: 'bottom', fill: '#64748b', fontSize: 10 }} />
                    <YAxis type="number" dataKey="profit" name="Lucro" tickFormatter={(v) => `R$${v}`} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip formatter={formatBRL} />} />
                    <ReferenceLine y={0} stroke="#ef4444" />
                    <Scatter name="Apostas" data={filtered} fill="#8884d8">
                        {filtered.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
          </Card>

           {/* CHART 5: Stake vs Profit */}
           <Card title="Gestão de Stake: Tamanho da Aposta vs Retorno">
            <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" dataKey="stake" name="Stake" unit="BRL" />
                    <YAxis type="number" dataKey="profit" name="Lucro" unit="BRL" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip formatter={formatBRL} />} />
                    <ReferenceLine y={0} stroke="#ef4444" />
                    <Scatter name="Apostas" data={filtered} fill="#3b82f6" opacity={0.6} />
                </ScatterChart>
            </ResponsiveContainer>
          </Card>
      </div>

    </div>
  );
};

export default BettingAIDashboard;