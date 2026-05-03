import { useEffect, useState } from "react";

interface DePINProofProps {
  h3Id: string | null;
}

// Dizi modül seviyesinde sabit — her render'da yeniden oluşmaz
const SEQUENCE: { text: string; color: string }[] = [
  { text: "▸ Konum kodu algılandı", color: '#00ffcc' },
  { text: "▸ Hexagon çözünürlüğü: Cadde seviyesi (Res-9)", color: '#00ffcc' },
  { text: "▸ Ağ: Stellar Testnet", color: '#aaaaaa' },
  { text: "▸ Kanıt türü: Konum Bildirimi", color: '#aaaaaa' },
  { text: "▸ İmza doğrulanıyor...", color: '#ffcc00' },
];

export function DePINProof({ h3Id }: DePINProofProps) {
  const [lines, setLines] = useState<{ text: string; color: string }[]>([]);

  useEffect(() => {
    if (!h3Id) {
      setLines([]);
      return;
    }

    // h3Id değiştiğinde animasyonu sıfırla
    setLines([]);
    let i = 0;

    const timer = setInterval(() => {
      // Önce sınır kontrolü — undefined hiçbir zaman diziye girmez
      if (i >= SEQUENCE.length) {
        clearInterval(timer);
        return;
      }
      const item = SEQUENCE[i];
      i++;
      // item her zaman geçerli ama yine de guard ekle
      if (item) {
        setLines(prev => [...prev, item]);
      }
      if (i >= SEQUENCE.length) {
        clearInterval(timer);
      }
    }, 220);

    return () => {
      clearInterval(timer);
    };
  }, [h3Id]);

  if (!h3Id || lines.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl bg-black border border-[#00ffcc]/20 p-3 overflow-hidden">
      <div className="text-[#00ffcc]/40 text-[9px] mb-2 uppercase tracking-widest font-mono">
        Konum Kanıtı — {h3Id.substring(0, 10)}...
      </div>
      <div className="flex flex-col gap-0.5 font-mono text-[10px] leading-relaxed">
        {(lines ?? []).map((line, idx) => {
          // Üçlü güvenlik: item, color ve text için fallback
          if (!line) return null; // Null/undefined item'ları skip et

          const color = typeof line?.color === 'string' && line?.color?.length > 0
            ? line.color
            : '#00ffcc';
          const text = typeof line?.text === 'string' && line?.text?.length > 0
            ? line.text
            : '';

          if (!text) return null; // Boş text'i render etme

          return (
            <div
              key={`line-${idx}`}
              className="flex items-start gap-1.5"
              style={{
                color: color ?? '#00ffcc',
                opacity: idx === (lines?.length ?? 0) - 1 ? 1 : 0.55,
                textShadow: idx === (lines?.length ?? 0) - 1 ? `0 0 8px ${color ?? '#00ffcc'}` : 'none',
              }}
            >
              <span>{text}</span>
              {idx === (lines?.length ?? 0) - 1 && (lines?.length ?? 0) < SEQUENCE.length && (
                <span className="animate-pulse">█</span>
              )}
            </div>
          );
        })}
        {(lines?.length ?? 0) >= SEQUENCE.length && (
          <div
            className="text-[#00ff00] mt-1 font-bold"
            style={{ textShadow: '0 0 8px #00ff00' }}
          >
            ✓ Konum kanıtı geçerli — İşlem yapılabilir
          </div>
        )}
      </div>
    </div>
  );
}
