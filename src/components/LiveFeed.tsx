import { useEffect, useState, useRef } from "react";
import type { PoiState } from "./Map/HexGrid";

interface ActivityItem {
  id: number;
  text: string;
  color: string;
  time: Date;
}

interface LiveFeedProps {
  poiStateMap: Record<string, PoiState>;
}

// Cüzdan adresine göre sabit renkli avatar rengi üret
function addressToColor(address: string): string {
  const colors = ['#00ffcc', '#ff0044', '#ffcc00', '#00ff00', '#ff6600', '#aa00ff', '#00aaff'];
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Cüzdan adresini kısalt
function shortAddress(addr: string): string {
  if (!addr || addr === 'Bilinmiyor') return 'Anonim';
  return `${addr.substring(0, 4)}...${addr.slice(-4)}`;
}

export function LiveFeed({ poiStateMap }: LiveFeedProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed'>('pending');

  const pois = Object.values(poiStateMap);
  const pendingPois = pois.filter(p => p.status !== 1).sort((a, b) => b.id - a.id);
  const confirmedPois = pois.filter(p => p.status === 1).sort((a, b) => b.id - a.id);

  const displayList = activeTab === 'pending' ? pendingPois : confirmedPois;

  return (
    <div className="absolute top-4 left-4 z-20 w-80 flex flex-col gap-3">
      {/* Tabs */}
      <div className="flex bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-1 shadow-2xl">
        <button 
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeTab === 'pending' ? 'bg-[#ffcc00] text-black shadow-lg shadow-[#ffcc00]/20' : 'text-gray-400 hover:text-white'}`}
        >
          ONAY BEKLEYENLER ({pendingPois.length})
        </button>
        <button 
          onClick={() => setActiveTab('confirmed')}
          className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeTab === 'confirmed' ? 'bg-[#00ff88] text-black shadow-lg shadow-[#00ff88]/20' : 'text-gray-400 hover:text-white'}`}
        >
          DOĞRULANANLAR ({confirmedPois.length})
        </button>
      </div>

      {/* List Container */}
      <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
        {displayList.length === 0 ? (
          <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl p-4 text-center">
            <p className="text-[10px] text-gray-500 italic">Bu kategoride henüz bildiri yok.</p>
          </div>
        ) : (
          displayList.map(poi => {
            const voterCount = poi.voters?.length || 0;
            const progress = (voterCount / 3) * 100;
            
            return (
              <div key={poi.id} className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 hover:bg-black/80 transition-all border-l-2" style={{ borderLeftColor: activeTab === 'pending' ? '#ffcc00' : '#00ff88' }}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono text-white font-bold">POI #{poi.id}</span>
                    <span className="text-[8px] text-gray-500 font-mono">{poi.h3_id.substring(0, 12)}...</span>
                  </div>
                  {activeTab === 'pending' ? (
                    <span className="text-[9px] font-bold text-[#ffcc00]">{voterCount}/3 Oy</span>
                  ) : (
                    <div className="flex items-center gap-1 text-[9px] font-bold text-[#00ff88]">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>
                      ONAYLI
                    </div>
                  )}
                </div>
                
                {activeTab === 'pending' && (
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#ffcc00] transition-all" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface TrustScoreProps {
  poiStateMap: Record<string, PoiState>;
}

export function TrustScoreBadge({ poiStateMap }: TrustScoreProps) {
  const total = Object.keys(poiStateMap).length;
  const verified = Object.values(poiStateMap).filter(p => p.status === 1).length;
  const score = total > 0 ? Math.round((verified / total) * 100) : 0;

  const color = score >= 70 ? '#00ff00' : score >= 40 ? '#ffcc00' : '#ff0044';

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span className="text-xs font-bold" style={{ color }}>{score}%</span>
      <span className="text-xs text-gray-500">Güven</span>
    </div>
  );
}

interface AvatarProps {
  address: string;
  size?: number;
}

export function CyberAvatar({ address, size = 28 }: AvatarProps) {
  const color = addressToColor(address);
  const letters = address && address !== 'Bilinmiyor' ? address.substring(0, 2).toUpperCase() : '??';
  
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-black flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, ${color}88)`,
        boxShadow: `0 0 8px ${color}44`,
        fontSize: size * 0.35,
      }}
    >
      {letters}
    </div>
  );
}

export { shortAddress, addressToColor };
