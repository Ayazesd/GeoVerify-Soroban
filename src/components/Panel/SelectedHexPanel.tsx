import { useState } from "react";
import { PoiState } from "../Map/HexGrid";
import { SubmissionForm, type SubmissionData } from "./SubmissionForm";
import { DePINProof } from "../DePINProof";
import { CyberAvatar, shortAddress } from "../LiveFeed";

interface SelectedHexPanelProps {
  selectedH3Id: string | null;
  selectedPoiState: PoiState | null;
  busy: boolean;
  walletAddress?: string;
  remainingRights?: number | null;
  onClose: () => void;
  onSubmitReport: (data: SubmissionData) => Promise<void>;
  onCreateBatch?: () => Promise<any>;
  onVerify: () => Promise<void>;
  onFlag: () => Promise<void>;
  onFinalizeBatch?: (batchId: number) => Promise<void>;
  onQueryBatch?: (batchId: number) => Promise<{ eligible: boolean; verifiedCount: number; totalCount: number; requiredCount: number }>;
}

export function SelectedHexPanel({
  selectedH3Id,
  selectedPoiState,
  busy,
  walletAddress,
  remainingRights = null,
  onClose,
  onSubmitReport,
  onCreateBatch,
  onVerify,
  onFlag,
  onFinalizeBatch,
  onQueryBatch,
}: SelectedHexPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [queryStatus, setQueryStatus] = useState<null | { eligible: boolean; verifiedCount: number; totalCount: number; requiredCount: number; loading?: boolean }>(null);
  const [querying, setQuerying] = useState(false);

  if (!selectedH3Id) return null;

  const isAuthor = selectedPoiState?.author === walletAddress && walletAddress !== undefined;
  const hasVoted = walletAddress ? selectedPoiState?.voters?.includes(walletAddress) : false;
  // null veya 0 ise hak bitti say; veri yükleniyor (null) ise izin ver
  const outOfRights = remainingRights !== null && remainingRights <= 0;
  
  const isConfirmed = selectedPoiState?.status === 1;
  const voterCount = selectedPoiState?.voters?.length || 0;
  
  // Oy butonlarını göster: sadece üçüncü taraf, oy kullanmamış kullanıcılara ve henüz onaylanmamışlara
  const showVoteButtons = !isAuthor && !hasVoted && !isConfirmed;

  return (
    <aside className="bg-geoverify-panel border border-white/10 rounded-3xl p-6 flex flex-col gap-6 w-full shadow-2xl relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-geoverify-accent uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-geoverify-accent shadow-[0_0_8px_rgba(44,166,111,0.5)]"></span>
          Bölge Detayları
        </span>
        <h2 className="text-2xl font-bold font-['Space_Grotesk'] text-white">
          Heksagon Seçildi
        </h2>
        <p className="text-gray-400 text-sm font-mono mt-1 break-all bg-black/30 p-2 rounded-lg border border-white/5">
          {selectedH3Id}
        </p>
        {/* DePIN Proof Terminal */}
        <DePINProof h3Id={selectedH3Id} />
      </div>

      {!selectedPoiState ? (
        <div className="flex flex-col gap-4">
          <div className="bg-white/5 rounded-xl p-5 border border-dashed border-white/20 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-500 mb-3" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" /><path d="M7 3.34V5a3 3 0 0 0 3 3v0a2 2 0 0 1 2 2v0c0 1.1.9 2 2 2v0a2 2 0 0 0 2-2v0c0-1.1.9-2 2-2h3.17" /><path d="M11 21.95V18a2 2 0 0 0-2-2v0a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" /><circle cx="12" cy="12" r="10" /></svg>
            <h3 className="text-white font-medium mb-1">Henüz Bildirim Yok</h3>
            <p className="text-sm text-gray-400">Bu bölge için sisteme kaydedilmiş herhangi bir konum hatası veya POI verisi bulunmuyor.</p>
          </div>

          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              disabled={outOfRights}
              className="w-full py-3 rounded-xl bg-geoverify-accent text-black font-bold text-sm hover:bg-geoverify-accentHover transition-colors shadow-lg shadow-geoverify-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Yeni Hata Bildirimi Oluştur
            </button>
          ) : (
            <SubmissionForm
              onSubmit={onSubmitReport}
              onCancel={() => setShowForm(false)}
              busy={busy || outOfRights}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/30 p-4 rounded-xl border border-white/5">
              <span className="block text-xs text-gray-400 mb-1 uppercase">Durum</span>
              <span className={`font-bold ${isConfirmed ? 'text-[#00ff88]' :
                selectedPoiState.status === 2 ? 'text-geoverify-malicious' : 'text-geoverify-pending'
                }`}>
                {isConfirmed ? "Doğrulandı" :
                  selectedPoiState.status === 2 ? "Reddedildi" : "İnceleniyor"}
              </span>
            </div>
            <div className="bg-black/30 p-4 rounded-xl border border-white/5 flex flex-col justify-center">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>Konsensüs</span>
                <span className="font-mono">{voterCount}/3</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-700 ${isConfirmed ? 'bg-[#00ff88]' : 'bg-[#ffcc00]'}`}
                  style={{ width: `${Math.min(100, (voterCount / 3) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-white font-medium flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Sosyal Akış (İtiraz Geçmişi)
            </h3>

            <div className="bg-black/40 rounded-xl p-4 border border-white/10">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <CyberAvatar address={selectedPoiState.author || ''} size={32} />
                  <span className="text-sm font-medium text-gray-200 font-mono">
                    {shortAddress(selectedPoiState.author || '')}
                  </span>
                </div>
                <span className="text-xs text-gray-500">Yeni</span>
              </div>
              <div className="text-sm text-gray-300 mb-2 border-l-2 border-geoverify-pending pl-3 ml-1 py-1">
                {selectedPoiState.metadata_ipfs_hash ? (
                  <span>{selectedPoiState.metadata_ipfs_hash}</span>
                ) : (
                  <span className="text-gray-500 italic">Detaylı açıklama bulunmuyor.</span>
                )}
              </div>

              {/* Oy Butonları: Sadece 3. taraf, daha önce oy kullanmamış kullanıcılara göster */}
              {showVoteButtons ? (
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                  <button
                    onClick={onVerify}
                    disabled={busy || outOfRights}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                    style={{ background: 'rgba(0,255,0,0.08)', border: '1px solid rgba(0,255,0,0.2)', color: '#00ff00', boxShadow: busy ? 'none' : '0 0 10px rgba(0,255,0,0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                    {busy ? "İşleniyor" : "Katılıyorum"}
                  </button>
                  <button
                    onClick={onFlag}
                    disabled={busy || outOfRights}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                    style={{ background: 'rgba(255,0,68,0.08)', border: '1px solid rgba(255,0,68,0.2)', color: '#ff0044', boxShadow: busy ? 'none' : '0 0 10px rgba(255,0,68,0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" /></svg>
                    {busy ? "İşleniyor" : "Hatalı Bildirim"}
                  </button>
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-white/5">
                  {isConfirmed ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#00ff88]/5 border border-[#00ff88]/20 text-xs text-[#00ff88] font-bold">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                      <span>Bu bildiri ağ tarafından doğrulandı</span>
                    </div>
                  ) : isAuthor ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/8 text-xs text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ffcc" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" /></svg>
                      <span>Bu bildiriyi siz oluşturdunuz</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/8 text-xs text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ff00" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
                      <span>Bu bildiri için oyunuzu kullandınız</span>
                    </div>
                  )}
                </div>
              )}
              {/* Akıllı Sorgula & Otomatik İade — sadece paket sahibine */}
              {isAuthor && selectedPoiState.batch_id && (onFinalizeBatch || onQueryBatch) && (
                <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-3">

                  {onQueryBatch && (
                    <button
                      onClick={async () => {
                        setQuerying(true);
                        setQueryStatus(null);
                        try {
                          const result = await onQueryBatch(selectedPoiState.batch_id);
                          setQueryStatus(result);
                          // Eşik aşıldıysa hemen finalize
                          if (result.eligible && onFinalizeBatch) {
                            await onFinalizeBatch(selectedPoiState.batch_id);
                          }
                        } catch {
                          setQueryStatus(null);
                        } finally {
                          setQuerying(false);
                        }
                      }}
                      disabled={querying || busy}
                      className="w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{
                        background: 'rgba(0,255,204,0.06)',
                        border: '1px solid rgba(0,255,204,0.25)',
                        color: '#00ffcc',
                        boxShadow: querying ? 'none' : '0 0 12px rgba(0,255,204,0.1)',
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                      {querying || busy ? "İşleniyor..." : "Paket Durumunu Sorgula"}
                    </button>
                  )}

                  {queryStatus && (
                    <div className={`rounded-xl p-4 border text-sm ${queryStatus.eligible
                      ? 'bg-[#00ff00]/5 border-[#00ff00]/20'
                      : 'bg-[#ffcc00]/5 border-[#ffcc00]/20'
                      }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${queryStatus.eligible ? 'bg-[#00ff00]' : 'bg-[#ffcc00]'
                          }`} style={{ boxShadow: queryStatus.eligible ? '0 0 6px #00ff00' : '0 0 6px #ffcc00' }} />
                        <span className={`font-bold ${queryStatus.eligible ? 'text-[#00ff00]' : 'text-[#ffcc00]'
                          }`}>
                          {queryStatus.eligible ? '✓ İade işlemi başlatıldı!' : '⏳ Henüz Yeterli Değil'}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs">
                        {queryStatus.verifiedCount} / {queryStatus.totalCount} POI doğrulandı
                        &nbsp;(En az {queryStatus.requiredCount} gerekli)
                      </p>
                      {!queryStatus.eligible && (
                        <p className="text-gray-500 text-xs mt-1">
                          %80 eşiğine ulaşmak için {queryStatus.requiredCount - queryStatus.verifiedCount} POI daha doğrulanması gerekiyor.
                        </p>
                      )}
                    </div>
                  )}

                  {!queryStatus && (
                    <p className="text-xs text-gray-600 text-center">
                      Sorgula → Eşik aşıldıysa depozito otomatik iade edilir.
                    </p>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {outOfRights && onCreateBatch && (
        <div className="mt-2 pt-4 border-t border-geoverify-malicious/30">
          <p className="text-xs text-geoverify-malicious mb-3 text-center font-medium">
            Mevcut paketinizin işlem limiti doldu (10/10). Bildirim yapmaya devam etmek için yeni bir paket açmalısınız.
          </p>
          <button
            onClick={onCreateBatch}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#f2c14e] to-[#e6a822] text-black font-bold text-sm shadow-lg shadow-[#f2c14e]/20 hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:transform-none"
          >
            {busy ? "İşleniyor..." : "50 XLM ile Yeni Paket Al (10 Hak)"}
          </button>
        </div>
      )}
    </aside>
  );
}
