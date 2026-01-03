
import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, subValue, icon, trend }) => {
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-400';
  
  return (
    <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl shadow-xl backdrop-blur-sm">
      <div className="flex justify-between items-start mb-4">
        <span className="text-slate-400 font-medium text-sm">{label}</span>
        <div className="text-slate-500 bg-slate-900/50 p-2 rounded-lg">
          {icon}
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-2xl font-bold text-slate-100">{value}</span>
        {subValue && (
          <span className={`text-sm mt-1 font-semibold ${trendColor}`}>
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
};

export default StatsCard;
