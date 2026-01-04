import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PlusIcon, 
  ArrowUpRightIcon, 
  ArrowDownRightIcon, 
  ChartBarIcon, 
  WalletIcon, 
  TableCellsIcon, 
  ArrowDownTrayIcon, 
  CheckCircleIcon, 
  TrashIcon,
  ExclamationTriangleIcon,
  CloudIcon,
  Cog6ToothIcon,
  CheckIcon,
  PencilSquareIcon,
  XMarkIcon,
  InformationCircleIcon,
  DocumentDuplicateIcon,
  Square2StackIcon, // <--- NOME NOVO (CORRIGIDO)
  ArrowPathIcon,
  ServerIcon,
  KeyIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { Bet, BetStatus, BetType, Transaction, TransactionType, Match } from './types';
import { loadBets, saveBets, loadTransactions, saveTransactions, getSyncConfig, saveSyncConfig } from './utils/storage';
import { parseAIText } from './utils/parser';
import BIDashboard from './components/BI_Dashboard';
import StatsCard from './components/StatsCard';
import BetModal from './components/BetModal';
import DailyProfitCalendar from './components/DailyProfitCalendar';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'import' | 'active' | 'history' | 'bankroll' | 'settings'>('dashboard');
  const [bets, setBets] = useState<Bet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [importText, setImportText] = useState('');
  const [parsedMatches, setParsedMatches] = useState<Match[]>([]);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // O uso de useRef para persistência garante que o salvamento só ocorra após o carregamento completo
  const dataInitialized = useRef(false);

  const [customAmount, setCustomAmount] = useState<string>('');
  const [syncConfig, setSyncConfig] = useState(getSyncConfig() || { url: '', key: '' });

  // Carregamento inicial robusto
  useEffect(() => {
    const init = async () => {
      setIsSyncing(true);
      try {
        const [b, t] = await Promise.all([loadBets(), loadTransactions()]);
        setBets(b || []);
        setTransactions(t || []);
        // Delay mínimo para garantir que o estado do React foi atualizado antes de liberar o salvamento
        setTimeout(() => {
          dataInitialized.current = true;
        }, 100);
      } catch (err) {
        console.error("Erro crítico ao sincronizar dados. Operação de salvamento bloqueada para evitar perda de dados.", err);
        alert("Erro ao conectar com a nuvem. Verifique suas configurações de Sync ou internet.");
      } finally {
        setIsSyncing(false);
      }
    };
    init();
  }, []);

  // Persistência Automática com Trava de Segurança
  useEffect(() => { 
    if (dataInitialized.current) {
      saveBets(bets).catch(console.error);
    }
  }, [bets]);

  useEffect(() => { 
    if (dataInitialized.current) {
      saveTransactions(transactions).catch(console.error);
    }
  }, [transactions]);

  // ✅ NOVA LÓGICA UNIFICADA DE STATS (SALDO ATUAL VS ANTERIOR)
  const stats = useMemo(() => {
    // Definir o marco zero de hoje (00:00:00)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayTimestamp = startOfToday.getTime();

    // Função auxiliar para calcular saldo até uma data de corte
    const calculateBalanceUntil = (cutoff: number) => {
      // 1. Transações (Depósitos/Saques) até a data
      const txBalance = transactions
        .filter(t => t.timestamp < cutoff)
        .reduce((acc, t) => t.type === TransactionType.DEPOSIT ? acc + t.amount : acc - t.amount, 0);

      // 2. Apostas feitas até a data
      const relevantBets = bets.filter(b => b.timestamp < cutoff);
      const totalStakes = relevantBets.reduce((acc, b) => acc + b.stake, 0);
      
      // 3. Retornos (Payouts) de apostas feitas até a data
      const totalPayouts = relevantBets.reduce((acc, b) => {
        if (b.status === BetStatus.WON) return acc + (b.stake * b.odd);
        if (b.status === BetStatus.VOID) return acc + b.stake;
        return acc;
      }, 0);

      return txBalance - totalStakes + totalPayouts;
    };

    // Saldo Atual (Considera tudo até agora + margem de segurança)
    const balance = calculateBalanceUntil(Date.now() + 10000); 
    
    // Saldo Anterior (Considera tudo até ontem 23:59:59)
    const previousBalance = calculateBalanceUntil(todayTimestamp);

    // Outros KPIs
    const settledBets = bets.filter(b => b.status !== BetStatus.OPEN);
    const totalProfit = settledBets.reduce((acc, b) => acc + b.profit, 0);
    const settledStakes = settledBets.reduce((acc, b) => acc + b.stake, 0);
    const wins = settledBets.filter(b => b.status === BetStatus.WON).length;
    const winRate = settledBets.length > 0 ? (wins / settledBets.length) * 100 : 0;
    const roi = settledStakes > 0 ? (totalProfit / settledStakes) * 100 : 0;
    const openBetsTotalStake = bets.filter(b => b.status === BetStatus.OPEN).reduce((acc, b) => acc + b.stake, 0);

    return { 
      balance, 
      previousBalance, // Novo campo
      totalProfit, 
      winRate, 
      roi, 
      settledCount: settledBets.length,
      settledStakes, 
      openBetsTotalStake 
    };
  }, [bets, transactions]);

  const canAction = (timestamp: number) => {
    const betDate = new Date(timestamp).toDateString();
    const today = new Date().toDateString();
    return betDate === today;
  };

  const updateBetOdd = (id: string, newOdd: number) => {
    if (isNaN(newOdd) || newOdd < 1) return;
    setBets(prev => prev.map(b => {
      if (b.id !== id) return b;
      
      // Recalcular lucro instantaneamente ao mudar a odd
      let newProfit = b.profit;
      if (b.status === BetStatus.WON) {
        newProfit = b.stake * (newOdd - 1);
      } else if (b.status === BetStatus.VOID) {
        newProfit = 0;
      } else if (b.status === BetStatus.LOST) {
        newProfit = -b.stake;
      } else {
        // Para apostas abertas, o lucro latente é o valor da stake negativa
        newProfit = -b.stake;
      }

      return { ...b, odd: newOdd, profit: newProfit };
    }));
  };

  const deleteBet = (id: string) => {
    const bet = bets.find(b => b.id === id);
    if (bet && !canAction(bet.timestamp)) {
      alert("⚠️ Bloqueado: Exclusão permitida apenas no dia da aposta.");
      return;
    }
    if (confirm("Deseja excluir esta aposta? O valor investido retornará ao seu saldo.")) {
      setBets(prev => prev.filter(b => b.id !== id));
    }
  };

  const handleImport = () => {
    const matches = parseAIText(importText);
    if (matches.length === 0) { alert("Formato inválido. Use o separador |."); return; }
    setParsedMatches(matches);
    setImportText('');
  };

  const placeBets = (matchesToBet: Match[], stake: number) => {
    const total = matchesToBet.length * stake;
    if (total > stats.balance) { alert("Saldo insuficiente."); return; }

    const newBets: Bet[] = matchesToBet.map(m => ({
      ...m,
      stake,
      status: BetStatus.OPEN,
      profit: -stake,
      timestamp: Date.now()
    }));
    setBets([...bets, ...newBets]);
    setParsedMatches(parsedMatches.filter(m => !matchesToBet.find(nm => nm.id === m.id)));
    setSelectedMatchIds([]);
    setShowBatchModal(false);
  };

  const settleBet = (betId: string, actualFouls: number) => {
    setBets(prev => prev.map(b => {
      if (b.id !== betId) return b;
      let status = BetStatus.LOST;
      let profit = -b.stake;
      if (b.type === BetType.UNDER) {
        if (actualFouls < b.bookieLine) { status = BetStatus.WON; profit = b.stake * (b.odd - 1); }
        else if (actualFouls === b.bookieLine) { status = BetStatus.VOID; profit = 0; }
      } else {
        if (actualFouls > b.bookieLine) { status = BetStatus.WON; profit = b.stake * (b.odd - 1); }
        else if (actualFouls === b.bookieLine) { status = BetStatus.VOID; profit = 0; }
      }
      return { ...b, status, actualFouls, profit };
    }));
  };

  const resetBetStatus = (betId: string) => {
    setBets(prev => prev.map(b => 
      b.id === betId ? { ...b, status: BetStatus.OPEN, actualFouls: undefined, profit: -b.stake } : b
    ));
    setActiveTab('active');
  };

  const handleTransaction = (type: TransactionType) => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) { alert("Valor inválido."); return; }
    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      type,
      amount,
      description: type === TransactionType.DEPOSIT ? 'Depósito Manual' : 'Resgate',
      timestamp: Date.now()
    };
    setTransactions([...transactions, newTx]);
    setCustomAmount('');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#020617] text-slate-100 selection:bg-blue-500/30">
      
      {/* SIDEBAR */}
      <nav className="w-full md:w-80 bg-slate-900/40 border-b md:border-b-0 md:border-r border-slate-800/60 p-8 flex flex-col shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2.5 rounded-2xl shadow-xl shadow-blue-900/20">
            <ChartBarIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white leading-none">FoulMaster</h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold">Intelligence Unit</span>
          </div>
        </div>

        <div className="space-y-1.5 grow overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Painel BI', icon: ChartBarIcon },
            { id: 'import', label: 'Importar IA', icon: ArrowDownTrayIcon },
            { id: 'active', label: 'Apostas Vivas', icon: TableCellsIcon },
            { id: 'history', label: 'Histórico Real', icon: CheckCircleIcon },
            { id: 'bankroll', label: 'Gestão de Banca', icon: WalletIcon },
            { id: 'settings', label: 'Sincronização', icon: Cog6ToothIcon },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)} 
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm transition-all group ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
            >
              <tab.icon className={`w-5 h-5 transition-transform ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-110'}`} /> 
              {tab.label}
              {tab.id === 'active' && bets.filter(b => b.status === BetStatus.OPEN).length > 0 && (
                <span className="ml-auto bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-black">{bets.filter(b => b.status === BetStatus.OPEN).length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800/50">
          <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 shadow-inner">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-2">Banca Disponível</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-slate-400 font-bold">R$</span>
              <span className="text-3xl font-black text-white">{stats.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-6 md:p-12 relative">
        {isSyncing && (
          <div className="absolute top-6 right-12 z-[100] flex items-center gap-2 bg-blue-600/10 text-blue-400 px-4 py-2 rounded-full border border-blue-600/20 text-xs font-bold animate-pulse">
            <ArrowPathIcon className="w-3 h-3 animate-spin" />
            Sincronizando Dados...
          </div>
        )}

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatsCard label="Lucro Líquido" value={`R$ ${stats.totalProfit.toFixed(2)}`} icon={<ChartBarIcon className="w-6 h-6" />} trend={stats.totalProfit >= 0 ? 'up' : 'down'} />
              <StatsCard label="ROI Final" value={`${stats.roi.toFixed(2)}%`} icon={<ArrowUpRightIcon className="w-6 h-6" />} trend={stats.roi >= 0 ? 'up' : 'down'} />
              <StatsCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} subValue={`${stats.settledCount} resolvidos`} icon={<CheckCircleIcon className="w-6 h-6" />} trend="neutral" />
              
              {/* ✅ CARD DE BANCA TOTAL ATUALIZADO */}
              {(() => {
                const diff = stats.balance - stats.previousBalance;
                const percent = stats.previousBalance !== 0 
                  ? ((diff / stats.previousBalance) * 100) 
                  : 0;
                
                const trendDir = diff === 0 ? 'neutral' : diff > 0 ? 'up' : 'down';
                const subText = `${Math.abs(percent).toFixed(1)}% vs Anterior: R$ ${stats.previousBalance.toFixed(2)}`;

                return (
                  <StatsCard 
                    label="Banca Total" 
                    value={`R$ ${stats.balance.toFixed(2)}`} 
                    subValue={subText}
                    icon={<WalletIcon className="w-6 h-6" />} 
                    trend={trendDir} 
                  />
                );
              })()}
            </div>
            <BIDashboard bets={bets} />
          </div>
        )}

        {/* IMPORT */}
        {activeTab === 'import' && (
          <div className="max-w-5xl mx-auto space-y-10 animate-in slide-in-from-bottom duration-500">
            <div className="bg-slate-900/60 p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl backdrop-blur-xl">
              <h3 className="text-2xl font-black mb-4">Analisar Novas Predições</h3>
              <p className="text-slate-400 text-sm mb-8">Cole o conteúdo da IA para processar as bets automaticamente.</p>
              <textarea 
                value={importText} onChange={(e) => setImportText(e.target.value)}
                className="w-full h-56 bg-slate-950/80 border border-slate-800 rounded-3xl p-6 text-slate-300 font-mono text-sm focus:ring-2 focus:ring-blue-600 mb-8 outline-none transition-all placeholder:text-slate-900"
                placeholder="Ex: Como x Udinese | Arena A. | 22.1 | 28.5 | 1.91 | 25.8% | UNDER"
              />
              <button onClick={handleImport} className="bg-blue-600 hover:bg-blue-500 text-white font-black py-4 px-12 rounded-2xl transition-all shadow-xl shadow-blue-900/20 active:scale-95">Importar Projeções</button>
            </div>
            {parsedMatches.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {parsedMatches.map(m => (
                  <div key={m.id} onClick={() => setSelectedMatchIds(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                    className={`p-6 rounded-3xl border-2 cursor-pointer transition-all ${selectedMatchIds.includes(m.id) ? 'border-blue-600 bg-blue-600/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}>
                    <div className="font-black text-lg mb-1">{m.homeTeam} x {m.awayTeam}</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase mb-4">{m.referee}</div>
                    <div className="flex justify-between items-end">
                       <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${m.type === BetType.UNDER ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>
                         {m.type} {m.bookieLine}
                       </span>
                       <div className="text-right font-black">
                         <div className="text-white">@ {m.odd.toFixed(2)}</div>
                         <div className="text-[10px] text-emerald-400 uppercase">Edge {m.edge}%</div>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedMatchIds.length > 0 && (
              <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50">
                <button onClick={() => setShowBatchModal(true)} className="bg-emerald-600 text-white px-12 py-5 rounded-full font-black text-lg shadow-2xl shadow-emerald-900/40 border-4 border-slate-900 flex items-center gap-4 active:scale-95">
                   <PlusIcon className="w-6 h-6" /> Apostar em {selectedMatchIds.length} Jogos
                </button>
              </div>
            )}
          </div>
        )}

        {/* ACTIVE (TABULAR) */}
        {activeTab === 'active' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <h3 className="text-2xl font-black px-4">Operações em Aberto</h3>
            <div className="bg-slate-900/60 rounded-[2.5rem] border border-slate-800 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-950/60 border-b border-slate-800">
                    <tr>
                      <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Partida / Árbitro</th>
                      <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">IA Pred</th>
                      <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Entrada Casa</th>
                      <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Stake / Odd (Editável)</th>
                      <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Faltas Reais</th>
                      <th className="p-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {bets.filter(b => b.status === BetStatus.OPEN).map(bet => (
                      <tr key={bet.id} className="hover:bg-white/5 transition-colors group">
                        <td className="p-6">
                          <div className="font-black text-slate-100">{bet.homeTeam} x {bet.awayTeam}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase">{bet.referee}</div>
                        </td>
                        <td className="p-6 text-center">
                          <span className="text-blue-400 font-black text-lg">{bet.iaPrediction}</span>
                        </td>
                        <td className="p-6">
                          <span className={`text-xs font-black uppercase px-2 py-1 rounded ${bet.type === BetType.UNDER ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                            {bet.type} {bet.bookieLine}
                          </span>
                        </td>
                        <td className="p-6">
                          <div className="font-bold text-slate-200 mb-1.5 text-sm">R$ {bet.stake.toFixed(2)}</div>
                          <div className="flex items-center gap-1.5">
                             <span className="text-[10px] text-slate-500 font-black uppercase">@</span>
                             <input 
                               type="number" 
                               step="0.01" 
                               defaultValue={bet.odd}
                               onBlur={(e) => updateBetOdd(bet.id, parseFloat(e.target.value))}
                               className="w-20 bg-slate-950/50 border border-slate-700 rounded-lg p-1.5 text-xs font-black text-blue-400 focus:border-blue-500 outline-none transition-all hover:border-slate-600"
                             />
                          </div>
                        </td>
                        <td className="p-6">
                           <div className="flex items-center gap-2 max-w-[150px]">
                              <input 
                                type="number" 
                                id={`f-in-${bet.id}`} 
                                className="w-16 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-center font-black text-white focus:ring-2 focus:ring-blue-600 outline-none transition-all" 
                                placeholder="0" 
                              />
                              <button 
                                onClick={() => {
                                  const val = (document.getElementById(`f-in-${bet.id}`) as HTMLInputElement).value;
                                  if (val) settleBet(bet.id, parseInt(val));
                                }} 
                                className="bg-blue-600 hover:bg-blue-500 p-2.5 rounded-xl text-white transition-all shadow-lg active:scale-95"
                              >
                                <CheckIcon className="w-5 h-5" />
                              </button>
                           </div>
                        </td>
                        <td className="p-6 text-center">
                          <button onClick={() => deleteBet(bet.id)} className="text-slate-700 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-500/10 transition-colors">
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {bets.filter(b => b.status === BetStatus.OPEN).length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-32 text-center text-slate-600 font-bold uppercase tracking-widest text-xs">Sem operações vivas</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* BANKROLL */}
        {activeTab === 'bankroll' && (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in slide-in-from-right duration-500">
            <div className="bg-slate-900/60 p-12 rounded-[3rem] border border-slate-800 shadow-2xl h-fit">
              <h3 className="text-2xl font-black mb-2 flex items-center gap-4">
                <WalletIcon className="w-8 h-8 text-blue-500"/> Gestão Financeira
              </h3>
              <p className="text-slate-500 text-sm mb-10">Mantenha seu saldo sincronizado realizando aportes ou retiradas.</p>
              
              <div className="space-y-8">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block ml-1">Valor da Operação (R$)</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-700">R$</span>
                    <input 
                      type="number" 
                      value={customAmount} 
                      onChange={(e) => setCustomAmount(e.target.value)} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-8 pl-16 text-4xl font-black text-white focus:ring-4 focus:ring-blue-600/20 outline-none transition-all placeholder:text-slate-900" 
                      placeholder="0,00" 
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => handleTransaction(TransactionType.DEPOSIT)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-6 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all">DEPOSITAR</button>
                  <button onClick={() => handleTransaction(TransactionType.WITHDRAWAL)} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-6 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all">RESGATAR</button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/40 p-10 rounded-[3rem] border border-slate-800 shadow-xl flex flex-col h-[700px]">
              <h4 className="text-xs font-black text-slate-500 mb-8 uppercase tracking-widest">Movimentações Recentes</h4>
              <div className="space-y-4 grow overflow-y-auto pr-4 scrollbar-hide">
                {transactions.sort((a,b) => b.timestamp - a.timestamp).map(t => (
                  <div key={t.id} className="flex justify-between items-center p-6 bg-slate-950/60 rounded-3xl border border-slate-800/50 group transition-all hover:border-slate-700">
                    <div>
                      <span className="text-sm font-black block text-slate-200">{t.description}</span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(t.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <span className={`text-2xl font-black ${t.type === TransactionType.DEPOSIT ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.type === TransactionType.DEPOSIT ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS / SYNC */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500 space-y-12">
             <div className="bg-slate-900/60 p-12 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute -top-10 -right-10 opacity-5 pointer-events-none">
                   <CloudIcon className="w-64 h-64 text-blue-500" />
                </div>

                <div className="flex items-center gap-6 mb-10 relative z-10">
                   <div className="bg-blue-600/20 p-4 rounded-3xl border border-blue-600/30">
                     <ServerIcon className="w-10 h-10 text-blue-500" />
                   </div>
                   <div>
                     <h3 className="text-2xl font-black">Nuvem & Sincronização</h3>
                     <p className="text-slate-400 text-sm">Vincule sua conta Supabase para salvar dados em tempo real e evitar perdas.</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 relative z-10">
                  <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Supabase Project URL</label>
                      <input type="text" placeholder="https://xyz.supabase.co" value={syncConfig.url} onChange={e => setSyncConfig({...syncConfig, url: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600 font-medium text-sm transition-all" />
                  </div>
                  <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Anon Key</label>
                      <input type="password" placeholder="Chave pública do projeto" value={syncConfig.key} onChange={e => setSyncConfig({...syncConfig, key: e.target.value})} className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600 font-medium text-sm transition-all" />
                  </div>
                </div>

                <div className="flex gap-4 relative z-10">
                  <button onClick={() => { saveSyncConfig(syncConfig); window.location.reload(); }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl font-black shadow-xl transition-all">ESTABELECER CONEXÃO</button>
                  <button onClick={() => { saveSyncConfig(null); window.location.reload(); }} className="px-8 bg-slate-800 text-slate-400 py-5 rounded-2xl font-black text-xs hover:text-rose-400 transition-all">REDEFINIR</button>
                </div>

                <div className="mt-12 p-10 bg-slate-950/60 rounded-[2.5rem] border border-slate-800 relative z-10">
                   <h4 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-6 flex items-center gap-3"><ArrowRightIcon className="w-4 h-4 text-blue-500"/> Tutorial de Setup Cloud</h4>
                   <div className="space-y-6 text-sm text-slate-500 leading-relaxed">
                      <p>1. Crie um projeto no <a href="https://supabase.com" target="_blank" className="text-blue-500 font-bold hover:underline">Supabase</a>.</p>
                      <p>2. Em <strong>Settings API</strong>, copie a URL e a Anon Key nos campos acima.</p>
                      <p>3. No <strong>SQL Editor</strong>, execute o comando abaixo para criar a tabela de dados:</p>
                      <div className="relative group">
                          <pre className="bg-slate-900 p-6 rounded-2xl text-[11px] font-mono text-blue-400 border border-blue-500/20 overflow-x-auto">
{`create table user_data (
  id text primary key,
  content jsonb,
  updated_at timestamp with time zone default now()
);`}
                          </pre>
                          <button 
                            onClick={() => navigator.clipboard.writeText("create table user_data (id text primary key, content jsonb, updated_at timestamp with time zone default now());")} 
                            className="absolute top-4 right-4 p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 transition-all shadow-md"
                          >
                            <Square2StackIcon className="w-4 h-4" /> {/* <--- USO CORRIGIDO */}
                          </button>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
            <DailyProfitCalendar bets={bets} />
            
            <div className="bg-slate-900/40 rounded-[2.5rem] border border-slate-800/60 overflow-hidden shadow-2xl backdrop-blur-xl">
              <div className="px-10 py-8 border-b border-slate-800/50 flex justify-between items-center">
                <h3 className="text-xl font-black">Arquivo de Performance</h3>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{bets.filter(b => b.status !== BetStatus.OPEN).length} Finalizadas</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/40">
                    <tr>
                      <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Partida / Data</th>
                      <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest">Mercado / Odd (Editável)</th>
                      <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Resultado</th>
                      <th className="p-8 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Gestão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {bets.filter(b => b.status !== BetStatus.OPEN).sort((a,b) => b.timestamp - a.timestamp).map(bet => (
                      <tr key={bet.id} className="hover:bg-slate-800/20 transition-colors group">
                        <td className="p-8">
                          <div className="font-black text-slate-100 mb-1">{bet.homeTeam} x {bet.awayTeam}</div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">{new Date(bet.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                               <span className="text-xs font-bold text-slate-300">{bet.type} {bet.bookieLine} @</span>
                               <input 
                                 type="number" 
                                 step="0.01" 
                                 defaultValue={bet.odd}
                                 onBlur={(e) => updateBetOdd(bet.id, parseFloat(e.target.value))}
                                 disabled={!canAction(bet.timestamp)}
                                 className="w-16 bg-slate-950/50 border border-slate-800 rounded p-1.5 text-xs font-black text-blue-400 outline-none focus:border-blue-500 transition-all hover:border-slate-700 disabled:opacity-50"
                               />
                            </div>
                            <span className={`text-[10px] w-fit font-black px-2.5 py-1 rounded-full ${bet.status === BetStatus.WON ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : bet.status === BetStatus.VOID ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                              {bet.actualFouls} FALTAS ({bet.status})
                            </span>
                          </div>
                        </td>
                        <td className={`p-8 text-right font-black text-lg ${bet.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {bet.profit >= 0 ? '+' : ''}R$ {bet.profit.toFixed(2)}
                        </td>
                        <td className="p-8 text-center">
                          <div className="flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canAction(bet.timestamp) && (
                              <>
                                <button onClick={() => resetBetStatus(bet.id)} className="text-blue-400 hover:bg-blue-500/10 p-2.5 rounded-xl transition-all"><PencilSquareIcon className="w-5 h-5"/></button>
                                <button onClick={() => deleteBet(bet.id)} className="text-rose-400 hover:bg-rose-500/10 p-2.5 rounded-xl transition-all"><TrashIcon className="w-5 h-5"/></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {showBatchModal && (
        <BetModal 
          matches={parsedMatches.filter(m => selectedMatchIds.includes(m.id))}
          currentBalance={stats.balance}
          onConfirm={(stake) => placeBets(parsedMatches.filter(m => selectedMatchIds.includes(m.id)), stake)}
          onCancel={() => setShowBatchModal(false)}
        />
      )}
    </div>
  );
};

export default App;