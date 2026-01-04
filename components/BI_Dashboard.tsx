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
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  ReferenceLine,
  Cell,
  Legend,
  ErrorBar
} from 'recharts';
import { CalendarIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { Bet, BetStatus, BetType } from '../types';

interface BIDashboardProps {
  bets: Bet[];
}

// --- CONFIGURAÇÃO VISUAL ---
const COLORS = {
  profit: '#10b981', // Emerald 500
  loss: '#f43f5e',   // Rose 500
  line: '#3b82f6',   // Blue 500
  line2: '#8b5cf6',  // Violet 500
  grid: '#1e293b',   // Slate 800
  text: '#94a3b8',   // Slate 400
  darkBg: '#0f172a', // Slate 900
};

const formatCurrency = (val: number) => `R$ ${val.toFixed(2)}`;
const formatPct = (val: number) => `${val.toFixed(1)}%`;

// --- COMPONENTES UI ---
const Card = ({ title, subtitle, children, className = '' }: any) => (
  <div className={`bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-sm flex flex-col ${className}`}>
    <div className="mb-6">
      <h3 className="text-slate-100 font-bold text-lg">{title}</h3>
      {subtitle && <p className="text-slate-500 text-xs uppercase tracking-wider font-bold mt-1">{subtitle}</p>}
    </div>
    <div className="flex-1 w-full min-h-[250px]">
      {children}
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs z-50">
        <p className="font-bold text-slate-200 mb-2">{label}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            <span className="text-slate-400 capitalize">{p.name}:</span>
            <span className="font-mono text-slate-200 font-bold">
              {formatter ? formatter(p.value) : (typeof p.value === 'number' ? p.value.toFixed(2) : p.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const BIDashboard: React.FC<BIDashboardProps> = ({ bets }) => {
  // --- ESTADO DO FILTRO DE DATA ---
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0], // Último mês default
    end: new Date().toISOString().split('T')[0]
  });

  // --- PROCESSAMENTO DE DADOS (CORE) ---
  const data = useMemo(() => {
    // 1. Filtragem Inicial
    const startTs = new Date(dateRange.start).getTime();
    const endTs = new Date(dateRange.end).getTime() + 86400000; // Incluir o dia final inteiro

    const filteredBets = bets
      .filter(b => b.status !== BetStatus.OPEN && b.status !== BetStatus.VOID)
      .filter(b => b.timestamp >= startTs && b.timestamp <= endTs)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Variáveis Acumuladoras
    let cumulativeProfit = 0;
    let cumulativeEV = 0;
    let peakProfit = -Infinity;
    
    // Mapas para agrupamento
    const dailyMap: Record<string, { profit: number; bets: number; ev: number }> = {};
    const refMap: Record<string, { profit: number; count: number }> = {};
    const typeMap: Record<string, { profit: number; count: number }> = { UNDER: { profit: 0, count: 0 }, OVER: { profit: 0, count: 0 } };
    
    // Arrays para Gráficos
    const timelineData: any[] = [];
    const scatterData: any[] = [];
    const volatilityData: any[] = []; // Desvio padrão móvel
    
    // Métricas de Erro
    let totalIaError = 0;
    let totalBookError = 0;
    let errorCount = 0;

    // Métricas de Odds (Buckets)
    const oddBuckets: Record<string, { profit: number; stake: number; wins: number; total: number; avgOdd: number }> = {};
    const getBucket = (odd: number) => {
        if (odd < 1.60) return '1.00 - 1.59';
        if (odd < 1.75) return '1.60 - 1.75';
        if (odd < 1.90) return '1.75 - 1.90';
        if (odd < 2.10) return '1.90 - 2.10';
        return '2.10+';
    };

    // --- LOOP PRINCIPAL ---
    filteredBets.forEach(bet => {
        const dateKey = new Date(bet.timestamp).toLocaleDateString('pt-BR');
        
        // Accumulators
        cumulativeProfit += bet.profit;
        peakProfit = Math.max(peakProfit, cumulativeProfit);
        const drawdown = cumulativeProfit - peakProfit;
        
        // EV Calc (Stake * (%Edge / 100)) - Assumindo que bet.edge é % (ex: 5.2)
        const evValue = bet.stake * ((bet.edge || 0) / 100);
        cumulativeEV += evValue;

        // Daily Map
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { profit: 0, bets: 0, ev: 0 };
        dailyMap[dateKey].profit += bet.profit;
        dailyMap[dateKey].bets += 1;
        dailyMap[dateKey].ev += evValue;

        // Referee Map
        const refName = bet.referee || 'Desconhecido';
        if (!refMap[refName]) refMap[refName] = { profit: 0, count: 0 };
        refMap[refName].profit += bet.profit;
        refMap[refName].count += 1;

        // Type Map
        const typeKey = bet.type === BetType.UNDER ? 'UNDER' : 'OVER';
        typeMap[typeKey].profit += bet.profit;
        typeMap[typeKey].count += 1;

        // Scatter Data
        scatterData.push({ stake: bet.stake, profit: bet.profit, name: `${bet.homeTeam} x ${bet.awayTeam}` });

        // Error Metrics (IA vs Book)
        if (bet.iaPrediction && bet.bookieLine && bet.actualFouls !== undefined) {
            totalIaError += Math.abs(bet.iaPrediction - bet.actualFouls);
            totalBookError += Math.abs(bet.bookieLine - bet.actualFouls);
            errorCount++;
        }

        // Odds Buckets
        const bucket = getBucket(bet.odd);
        if (!oddBuckets[bucket]) oddBuckets[bucket] = { profit: 0, stake: 0, wins: 0, total: 0, avgOdd: 0 };
        oddBuckets[bucket].profit += bet.profit;
        oddBuckets[bucket].stake += bet.stake;
        oddBuckets[bucket].total += 1;
        oddBuckets[bucket].avgOdd += bet.odd;
        if (bet.status === BetStatus.WON) oddBuckets[bucket].wins += 1;

        // Timeline Push (Simplificado por aposta para suavidade ou agrupado por dia depois)
        timelineData.push({
            date: dateKey,
            fullDate: new Date(bet.timestamp),
            cumulativeProfit,
            cumulativeEV,
            drawdown,
            profit: bet.profit
        });
    });

    // --- PÓS-PROCESSAMENTO ---

    // 1. Agrupar Timeline Diária para Volatilidade
    const dailyTimeline = Object.entries(dailyMap).map(([date, data]) => ({
        date,
        profit: data.profit,
        ev: data.ev
    }));

    // Calcular Desvio Padrão Móvel (Janela de 5 dias)
    dailyTimeline.forEach((day, index) => {
        const start = Math.max(0, index - 4);
        const window = dailyTimeline.slice(start, index + 1);
        const mean = window.reduce((acc, val) => acc + val.profit, 0) / window.length;
        const variance = window.reduce((acc, val) => acc + Math.pow(val.profit - mean, 2), 0) / window.length;
        volatilityData.push({ date: day.date, stdDev: Math.sqrt(variance) });
    });

    // 2. Ordenar Odds Buckets
    const oddsChartData = Object.entries(oddBuckets).map(([range, data]) => ({
        range,
        roi: (data.profit / data.stake) * 100,
        winRate: (data.wins / data.total) * 100,
        avgOdd: data.avgOdd / data.total
    })).sort((a, b) => a.range.localeCompare(b.range));

    // 3. Top/Bottom Referees
    const refereeChartData = Object.entries(refMap)
        .map(([name, data]) => ({ name, profit: data.profit, count: data.count }))
        .sort((a, b) => b.profit - a.profit) // Melhores primeiro
        .filter(r => r.count >= 2); // Filtro mínimo de amostra
    
    // Pegar Top 5 e Bottom 5 se houver muitos
    let finalRefData = refereeChartData;
    if (refereeChartData.length > 10) {
        finalRefData = [...refereeChartData.slice(0, 5), ...refereeChartData.slice(-5)];
    }

    // 4. Market Data
    const marketChartData = Object.entries(typeMap).map(([name, data]) => ({
        name, profit: data.profit
    }));

    return {
        timelineData, // Para chart 1 e 6
        dailyTimeline, // Para chart 2
        scatterData, // Para chart 3
        oddsChartData, // Para chart 4 e 5
        finalRefData, // Para chart 8
        marketChartData, // Para chart 9
        volatilityData, // Para chart 10
        errors: {
            ia: errorCount ? totalIaError / errorCount : 0,
            book: errorCount ? totalBookError / errorCount : 0
        } // Para chart 7
    };

  }, [bets, dateRange]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* FILTRO DE DATA */}
      <div className="flex items-end gap-4 bg-slate-900/40 p-6 rounded-3xl border border-slate-800">
        <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                <CalendarIcon className="w-3 h-3"/> Data Inicial
            </label>
            <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-blue-600"
            />
        </div>
        <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                 <CalendarIcon className="w-3 h-3"/> Data Final
            </label>
            <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white font-bold outline-none focus:ring-2 focus:ring-blue-600"
            />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 font-medium bg-slate-800/50 px-4 py-2 rounded-lg">
            <FunnelIcon className="w-4 h-4" />
            Mostrando {data.scatterData.length} apostas filtradas
        </div>
      </div>

      {/* --- LINHA 1: O GRANDE GRÁFICO (CHART 1) --- */}
      <Card title="Lucro Acumulado & Drawdown" subtitle="Saúde Estrutural do Sistema" className="h-[400px]">
        <ResponsiveContainer>
            <ComposedChart data={data.timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} opacity={0.5} />
                <XAxis dataKey="date" hide />
                <YAxis yAxisId="left" tickFormatter={val => `R$${val}`} stroke={COLORS.text} fontSize={10} />
                <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                <Legend />
                <Bar yAxisId="left" dataKey="drawdown" name="Drawdown" fill={COLORS.loss} opacity={0.3} barSize={4} />
                <Line yAxisId="left" type="monotone" dataKey="cumulativeProfit" name="Lucro Acumulado" stroke={COLORS.profit} strokeWidth={3} dot={false} />
            </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* --- LINHA 2: PULSO E STAKE (CHART 2 e 3) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Resultado Diário" subtitle="Pulso Emocional">
            <ResponsiveContainer>
                <BarChart data={data.dailyTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{fill: COLORS.text, fontSize: 10}} minTickGap={30} />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                    <ReferenceLine y={0} stroke={COLORS.text} />
                    <Bar dataKey="profit" name="Lucro Dia">
                        {data.dailyTimeline.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? COLORS.profit : COLORS.loss} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </Card>

        <Card title="Stake vs Lucro" subtitle="Calibragem de Sizing">
            <ResponsiveContainer>
                <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                    <XAxis type="number" dataKey="stake" name="Stake" unit="R$" stroke={COLORS.text} fontSize={10} />
                    <YAxis type="number" dataKey="profit" name="Lucro" unit="R$" stroke={COLORS.text} fontSize={10} />
                    <Tooltip content={<CustomTooltip formatter={formatCurrency} />} cursor={{ strokeDasharray: '3 3' }} />
                    <ReferenceLine y={0} stroke={COLORS.loss} strokeDasharray="3 3"/>
                    <Scatter name="Apostas" data={data.scatterData} fill={COLORS.line} opacity={0.6} />
                </ScatterChart>
            </ResponsiveContainer>
        </Card>
      </div>

      {/* --- LINHA 3: ODDS ANALYSIS (CHART 4 e 5) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="ROI por Faixa de Odds" subtitle="Onde está o valor real?">
            <ResponsiveContainer>
                <BarChart data={data.oddsChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} horizontal={false} />
                    <XAxis type="number" tickFormatter={(val) => `${val}%`} stroke={COLORS.text} fontSize={10} />
                    <YAxis type="category" dataKey="range" stroke={COLORS.text} fontSize={10} width={70} />
                    <Tooltip content={<CustomTooltip formatter={formatPct} />} />
                    <ReferenceLine x={0} stroke={COLORS.text} />
                    <Bar dataKey="roi" name="ROI %">
                        {data.oddsChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.roi >= 0 ? COLORS.line : COLORS.loss} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </Card>

        <Card title="Win Rate vs Odd Média" subtitle="Expectativa Matemática">
            <ResponsiveContainer>
                <ComposedChart data={data.oddsChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                    <XAxis dataKey="range" stroke={COLORS.text} fontSize={10} />
                    <YAxis yAxisId="left" orientation="left" stroke={COLORS.profit} tickFormatter={(v) => `${v}%`} fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" stroke={COLORS.text} fontSize={10} domain={[1, 3]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="winRate" name="Win Rate %" stroke={COLORS.profit} strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="avgOdd" name="Odd Média" stroke={COLORS.text} strokeWidth={1} strokeDasharray="5 5" />
                </ComposedChart>
            </ResponsiveContainer>
        </Card>
      </div>

      {/* --- LINHA 4: INTELIGÊNCIA E MERCADO (CHART 6 e 7) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card title="EV vs Realidade" subtitle="A sorte está influenciando?" className="lg:col-span-2">
            <ResponsiveContainer>
                <LineChart data={data.timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                    <XAxis dataKey="date" hide />
                    <YAxis tickFormatter={val => `R$${val}`} stroke={COLORS.text} fontSize={10} />
                    <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                    <Legend />
                    <Line type="monotone" dataKey="cumulativeProfit" name="Lucro Real" stroke={COLORS.profit} strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="cumulativeEV" name="EV (Esperado)" stroke={COLORS.line2} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </Card>

        <Card title="Qualidade da IA" subtitle="Erro Médio Absoluto (Faltas)">
            <ResponsiveContainer>
                <BarChart data={[
                    { name: 'Modelo IA', error: data.errors.ia, fill: COLORS.profit },
                    { name: 'Casa de Aposta', error: data.errors.book, fill: COLORS.loss }
                ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="name" stroke={COLORS.text} fontSize={12} fontWeight="bold" />
                    <YAxis stroke={COLORS.text} fontSize={10} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                    <Bar dataKey="error" name="Erro Médio" radius={[8, 8, 0, 0]} barSize={50} />
                </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 text-center text-[10px] text-slate-500">
                *Quanto menor a barra, mais preciso é o preditor.
            </div>
        </Card>
      </div>

      {/* --- LINHA 5: SEGMENTAÇÃO (CHART 8, 9, 10) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card title="Top & Flop Árbitros" subtitle="Lucro por Juiz">
            <ResponsiveContainer>
                <BarChart data={data.finalRefData} layout="vertical" margin={{left: 20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" stroke={COLORS.text} fontSize={9} width={90} />
                    <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                    <ReferenceLine x={0} stroke={COLORS.text} />
                    <Bar dataKey="profit" name="Lucro">
                        {data.finalRefData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? COLORS.profit : COLORS.loss} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </Card>

        <Card title="Especialidade" subtitle="Over vs Under">
            <ResponsiveContainer>
                <BarChart data={data.marketChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="name" stroke={COLORS.text} fontSize={12} fontWeight="bold" />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip formatter={formatCurrency} />} cursor={{fill: 'transparent'}} />
                    <ReferenceLine y={0} stroke={COLORS.text} />
                    <Bar dataKey="profit" name="Lucro" radius={[8, 8, 8, 8]} barSize={60}>
                         {data.marketChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? COLORS.line : COLORS.loss} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </Card>

        <Card title="Volatilidade Diária" subtitle="Desvio Padrão (Risco)">
            <ResponsiveContainer>
                <AreaChart data={data.volatilityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                    <XAxis dataKey="date" hide />
                    <YAxis stroke={COLORS.text} fontSize={10} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="stdDev" name="Volatilidade" stroke={COLORS.loss} fill={COLORS.loss} fillOpacity={0.1} />
                </AreaChart>
            </ResponsiveContainer>
        </Card>
      </div>

    </div>
  );
};

export default BIDashboard;