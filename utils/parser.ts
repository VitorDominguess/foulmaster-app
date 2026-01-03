
import { Match, BetType } from '../types';

export const parseAIText = (text: string): Match[] => {
  const lines = text.split('\n').filter(l => l.trim() && l.includes('|'));
  return lines.map((line, idx) => {
    const parts = line.split('|').map(p => p.trim());
    const teams = parts[0].split(' x ');
    
    return {
      id: `ai-${Date.now()}-${idx}`,
      date: new Date().toISOString(),
      league: 'Unknown',
      homeTeam: teams[0] || 'Unknown',
      awayTeam: teams[1] || 'Unknown',
      referee: parts[1],
      iaPrediction: parseFloat(parts[2]),
      bookieLine: parseFloat(parts[3]),
      odd: parseFloat(parts[4]),
      edge: parseFloat(parts[5].replace('%', '')),
      type: parts[6].includes('UNDER') ? BetType.UNDER : BetType.OVER
    };
  });
};

export const parseCSVData = (csv: string): Match[] => {
  const lines = csv.split('\n').filter(l => l.trim());
  const header = lines[0].split(',');
  
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(',');
    return {
      id: cols[0],
      fixture_id: cols[0],
      date: cols[1],
      league: cols[2],
      homeTeam: cols[4],
      awayTeam: cols[5],
      referee: cols[6],
      iaPrediction: 0, // Not present in CSV sample, will be updated by user/merging
      bookieLine: parseFloat(cols[9]),
      odd: parseFloat(cols[10]),
      edge: 0,
      type: BetType.UNDER // Default, needs logic or manual selection
    };
  });
};
