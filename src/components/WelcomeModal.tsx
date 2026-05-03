import { useState, useEffect } from "react";

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeenModal = localStorage.getItem("geoverify_welcome_seen");
    if (!hasSeenModal) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("geoverify_welcome_seen", "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl max-w-lg w-full p-8 shadow-[0_0_50px_rgba(0,255,204,0.15)] transform transition-all">
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold font-['Space_Grotesk'] text-white mb-2 tracking-tight">
            DePIN Kontrol Merkezi
          </h2>
          <p className="text-gray-400 text-sm">
            Konum Kanıtı Ağına Hoş Geldiniz. GeoVerify ile haritayı keşfedin, stake edin ve kazanın.
          </p>
        </div>

        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#00ffcc]/10 flex items-center justify-center border border-[#00ffcc]/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00ffcc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-1">1. Keşfet</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Haritada hatalı olduğunu düşündüğünüz bölgeleri veya doğrulanmayı bekleyen altıgenleri (hücreleri) bulun.</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#f2c14e]/10 flex items-center justify-center border border-[#f2c14e]/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f2c14e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-1">2. Stake Et</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Yeni bir bildirim oluşturmak için 50 XLM depozito (Stake) işlemi yapın. Bu depozito, ağın güvenliğini sağlar.</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#00ff00]/10 flex items-center justify-center border border-[#00ff00]/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-1">3. Kazan</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Bildiriminiz topluluk tarafından %80 oranında doğrulandığında depozitonuzu geri alın ve ağ ödülü kazanın.</p>
            </div>
          </div>
        </div>

        <button 
          onClick={handleClose}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-[#00ffcc] to-[#00ccaa] text-black font-bold text-lg hover:scale-[1.02] transition-transform shadow-[0_0_20px_rgba(0,255,204,0.3)]"
        >
          Ağı Korumaya Başla
        </button>
      </div>
    </div>
  );
}
