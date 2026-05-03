import { useState, useEffect } from "react";
import { HexGrid, type PoiState } from "./components/Map/HexGrid";
import {
  GeoVerifyClient,
  defaultGeoVerifyConfig,
  type WalletSession
} from "./lib/stellar/geoverify_client";
import { SelectedHexPanel } from "./components/Panel/SelectedHexPanel";
import type { SubmissionData } from "./components/Panel/SubmissionForm";
import { WelcomeModal } from "./components/WelcomeModal";
import { LiveFeed, TrustScoreBadge } from "./components/LiveFeed";

const client = new GeoVerifyClient(defaultGeoVerifyConfig);

function App() {
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [selectedH3Id, setSelectedH3Id] = useState<string | null>(null);
  const [selectedPoiState, setSelectedPoiState] = useState<PoiState | null>(null);

  const [poiStateMap, setPoiStateMap] = useState<Record<string, PoiState>>({});
  const [latestBatchId, setLatestBatchId] = useState<number | null>(null);
  const [latestPoiId, setLatestPoiId] = useState<number | null>(null);
  
  // On-chain işlem hakları state'i (null ile başlatıyoruz ki gerçek veri gelene kadar yanlış görünmesin)
  const [remainingRights, setRemainingRights] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [isContractInitialized, setIsContractInitialized] = useState<boolean | null>(null);
  const [xlmSacInput, setXlmSacInput] = useState(
    (import.meta.env.VITE_XLM_SAC_ADDRESS as string | undefined) ?? ""
  );

  const [statusMessage, setStatusMessage] = useState(
    "Freighter'ı bağlayarak zincir üstü verilere erişin ve harita etkileşimlerini açın."
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const googleMapsMapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const contractConfigured = client.hasContractBinding();

  // On-chain verileri çek
  const refreshOnChainData = async () => {
    if (!wallet || !contractConfigured) return;
    try {
      // İşlem haklarını on-chain'den asenkron çek
      const rights = await client.getRights(wallet.address);
      setRemainingRights(rights);

      const { pois, batches, latestBatchId: lbid } = await client.fetchAllOnChainPois();
      const newMap: Record<string, PoiState> = {};
      let maxPoiId = 0;

      console.log("Fetched POIs:", pois); // DEBUG

      pois.forEach((poi: any) => {
        const poiId = Number(poi.id);

        // Yeni kontratta h3_index, eski kontratta h3_id
        const h3IdRaw = poi.h3_index || poi.h3_id;
        if (!h3IdRaw) return; // Geçersiz POI

        // Symbol olarak dönen tipi garanti altına almak için String() kullanıyoruz
        const h3IdKey = String(h3IdRaw);

        // Yeni kontratta trust_score, eski kontratta status/verification_score
        const isNewContract = poi.trust_score !== undefined;

        let statusNum = 0;
        let verifScore = 0;
        let malScore = 0;

        // DEBUG: Kontrattan gelen ham POI verisini inceleyelim
        console.log(`[DEBUG] POI #${poiId} Raw Status:`, poi.status);

        if (poi.status) {
          let statusStr = "";
          if (typeof poi.status === 'string') statusStr = poi.status;
          else if (Array.isArray(poi.status)) statusStr = poi.status[0];
          else if (poi.status.tag) statusStr = poi.status.tag;
          else if (typeof poi.status === 'object') statusStr = Object.keys(poi.status)[0];
          
          const s = String(statusStr || "").toLowerCase();
          if (s === "confirmed" || s === "verified") statusNum = 1;
          else if (s === "rejected" || s === "malicious") statusNum = 2;
          else statusNum = 0;
        } else if (isNewContract) {
          verifScore = Number(poi.trust_score);
          statusNum = verifScore >= 10 ? 1 : (verifScore < 0 ? 2 : 0);
          malScore = verifScore < 0 ? Math.abs(verifScore) : 0;
        } else {
          verifScore = Number(poi.verification_score || 0);
          malScore = Number(poi.malicious_score || 0);
          if (verifScore >= 10) statusNum = 1;
          else if (malScore > 0) statusNum = 2;
          else statusNum = 0;
        }

        newMap[h3IdKey] = {
          id: poiId,
          batch_id: Number(poi.batch_id),
          h3_id: h3IdKey,
          status: statusNum,
          verify_count: Number(poi.verify_count || 0),
          dispute_count: Number(poi.dispute_count || 0),
          author: poi.author?.toString() || poi.submitter?.toString() || "Bilinmiyor",
          metadata_ipfs_hash: poi.description_cid?.toString() || poi.ipfs_hash?.toString() || "",
          voters: poi.voters ? (Array.isArray(poi.voters) ? poi.voters.map((v: any) => v.toString()) : []) : []
        };
        if (poiId > maxPoiId) maxPoiId = poiId;
      });

      console.log("New POI Map:", newMap, "Selected H3Id:", selectedH3Id); // DEBUG

      // Kendi "Active" paketimizi bulalım
      let userActiveBatchId = null;

      if (wallet && wallet.address && batches && batches.length > 0) {
        const sortedBatches = [...batches].sort((a, b) => Number(b.id) - Number(a.id));
        for (const b of sortedBatches) {
          const batchAuthor = b.author?.toString();
          if (batchAuthor === wallet.address) {
            const statusVal = b.status;

            // Soroban JS SDK enum'u "Active" tag'i ile veya array [tag, value] veya direkt 0 ile dönebilir
            let isActive = false;
            if (statusVal === 0 || statusVal === '0' || statusVal === 'Active') {
              isActive = true;
            } else if (typeof statusVal === 'object' && statusVal !== null) {
              const tag = statusVal.tag || statusVal[0];
              if (tag === 'Active' || tag === '0' || tag === 0) {
                isActive = true;
              }
            }

            if (isActive) {
              userActiveBatchId = Number(b.id);
              const poiCount = Number(b.poi_count || 0);
              console.log(`Found Active Batch for user: #${userActiveBatchId}, POIs: ${poiCount}, On-chain Rights: ${rights}`);
              break;
            }
          }
        }
      }

      setPoiStateMap(prevMap => {
        // Ekranda Optimistic (Anında) eklenmiş ama blokzincirinden henüz dönmemiş POI'leri koru
        const mergedMap = { ...newMap };
        if (selectedH3Id && !mergedMap[selectedH3Id] && prevMap[selectedH3Id]) {
          mergedMap[selectedH3Id] = prevMap[selectedH3Id];
        }

        // Update selected state
        if (selectedH3Id && mergedMap[selectedH3Id]) {
          setSelectedPoiState(mergedMap[selectedH3Id]);
        } else if (selectedH3Id) {
          console.log("Selected H3Id not found in mergedMap:", selectedH3Id);
          // Kullanıcıya bir "Yükleniyor..." durumu hissettirmek için state'i null veya loading yapabiliriz
          // Ancak optimistic UI sayesinde bu bloğa artık nadiren düşecek.
        }

        return mergedMap;
      });

      // latestBatchId'yi artık global son id olarak değil, kullanıcının aktif paketi olarak ayarlıyoruz
      setLatestBatchId(userActiveBatchId);

      // Artık "Akıllı Akış" veya "poi_count" hesaplaması yok.
      // Kontrattan doğrudan dönen güncel hak bilgisini kullanıyoruz:
      // rights zaten asenkron olarak sayfanın başında setRemainingRights ile set edildi.
      // setLatestPoiId'yi güncelle
      setLatestPoiId(maxPoiId > 0 ? maxPoiId : null);
    } catch (e) {
      console.error("Veri çekme hatası:", e);
    }
  };

  useEffect(() => {
    if (wallet) {
      refreshOnChainData();
    }
  }, [wallet]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setErrorMessage(null);
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Beklenmeyen hata");
    } finally {
      setBusy(false);
    }
  }

  function requireContract() {
    if (!contractConfigured) {
      throw new Error("VITE_GEOVERIFY_CONTRACT_ID ayarlanmamış.");
    }
  }

  async function connectWallet() {
    await runAction(async () => {
      const session = await client.connectWallet();
      setWallet(session);
      setStatusMessage(`Cüzdan ${session.network} ile bağlandı.`);

      if (contractConfigured) {
        setIsContractInitialized(null);
        const initialized = await client.checkInitialized(session.address);
        setIsContractInitialized(initialized);
        if (!initialized) {
          setStatusMessage("Kontrat henüz başlatılmamış. Lütfen başlatın.");
        }
      }
    });
  }

  async function initContract() {
    await runAction(async () => {
      if (!wallet) throw new Error("Önce cüzdanı bağlayın.");
      requireContract();

      await client.initializeContract(wallet.address);
      setIsContractInitialized(true);
      setStatusMessage("Kontrat başlatıldı!");
    });
  }

  const [pendingSubmissionData, setPendingSubmissionData] = useState<SubmissionData | null>(null);

  async function createBatch(): Promise<number | null> {
    let newBatchId: number | null = null;
    await runAction(async () => {
      requireContract();
      const result = await client.createBatch(wallet?.address);
      newBatchId = typeof result.returnValue === "number" ? result.returnValue : Number(result.returnValue ?? 0);
      setLatestBatchId(newBatchId);
      setRemainingRights(10); // Hakları sıfırla
      setStatusMessage(`Batch #${newBatchId} başarıyla açıldı.`);
    });
    return newBatchId;
  }

  async function handlePoiSubmitIntent(data: SubmissionData) {
    if (!selectedH3Id) return;
    if (remainingRights !== null && remainingRights <= 0) {
      alert("İşlem hakkınız doldu!");
      return;
    }

    if (!latestBatchId) {
      const confirm = window.confirm("Aktif paketiniz bulunmuyor. Yeni bir paket açmak (50 XLM) ve bu bildirimi göndermek istiyor musunuz? (Arka arkaya 2 işlem onayı istenecektir)");
      if (!confirm) return;

      const newBatchId = await createBatch();
      if (newBatchId) {
        await submitSelectedPoi(data, newBatchId);
      }
    } else {
      const confirm = window.confirm("Bu işlem 1 hakkınızı tüketecektir, onaylıyor musunuz?");
      if (!confirm) return;
      await submitSelectedPoi(data, latestBatchId);
    }
  }

  async function submitSelectedPoi(data?: SubmissionData, batchIdOverride?: number) {
    await runAction(async () => {
      requireContract();
      const targetBatchId = batchIdOverride || latestBatchId;
      if (!targetBatchId || !selectedH3Id) return;

      const metadata = data ? `${data.errorType}: ${data.description.substring(0, 20)}...` : "ipfs://dummy-hash-for-demo";

      console.log("Submitting POI - Batch:", targetBatchId, "H3Id:", selectedH3Id, "Metadata:", metadata); // DEBUG

      const result = await client.submitPoi(
        targetBatchId,
        selectedH3Id,
        metadata
      );

      const poiId = typeof result.returnValue === "number" ? result.returnValue : Number(result.returnValue ?? 0);
      console.log("POI submitted successfully! ID:", poiId); // DEBUG
      setLatestPoiId(poiId);
      setStatusMessage(`H3 ${selectedH3Id} için Konum Hatası #${poiId} gönderildi.`);

      // Hak düşümü (Optimistic Update)
      setRemainingRights(prev => prev !== null ? Math.max(0, prev - 1) : null);

      // Optimistic UI Update (Haritada anında görünmesi için)
      const newPoiState: PoiState = {
        id: poiId,
        batch_id: targetBatchId,
        h3_id: selectedH3Id,
        status: 0, // Pending (Sarı)
        verify_count: 0,
        dispute_count: 0,
        author: wallet?.address || "Bilinmiyor",
        metadata_ipfs_hash: metadata,
        voters: [] // Yeni POI'de henüz oy yok
      };

      setPoiStateMap(prev => ({ ...prev, [selectedH3Id]: newPoiState }));
      setSelectedPoiState(newPoiState);

      await new Promise(resolve => setTimeout(resolve, 5000));
      await refreshOnChainData();
    });
  }

  async function verifySelectedPoi() {
    if (remainingRights !== null && remainingRights <= 0) {
      alert("İşlem hakkınız doldu!");
      return;
    }
    const confirm = window.confirm("Bu işlem 1 hakkınızı tüketecektir, onaylıyor musunuz?");
    if (!confirm) return;

    await runAction(async () => {
      requireContract();
      if (!selectedPoiState) throw new Error("Önce bir POI seçmelisiniz.");

      await client.verifyPoi(selectedPoiState.id);
      setStatusMessage(`POI #${selectedPoiState.id} doğrulandı.`);

      // Hak düşümü (Local State Update)
      setRemainingRights(prev => (prev !== null && prev > 0) ? prev - 1 : prev);

      await new Promise(resolve => setTimeout(resolve, 5000));
      await refreshOnChainData();
    });
  }

  async function flagSelectedPoi() {
    if (remainingRights !== null && remainingRights <= 0) {
      alert("İşlem hakkınız doldu!");
      return;
    }
    const confirm = window.confirm("Bu işlem 1 hakkınızı tüketecektir, onaylıyor musunuz?");
    if (!confirm) return;

    await runAction(async () => {
      requireContract();
      if (!selectedPoiState) throw new Error("Önce bir POI seçmelisiniz.");

      await client.flagPoi(selectedPoiState.id);
      setStatusMessage(`POI #${selectedPoiState.id} kötü amaçlı olarak işaretlendi.`);

      // Hak düşümü (Local State Update)
      setRemainingRights(prev => (prev !== null && prev > 0) ? prev - 1 : prev);

      await new Promise(resolve => setTimeout(resolve, 5000));
      await refreshOnChainData();
    });
  }

  const handleZoneSelect = (h3Id: string, state: PoiState | null) => {
    setSelectedH3Id(h3Id);
    setSelectedPoiState(state);
    setIsMobileSheetOpen(true);
  };

  const totalZones = Object.keys(poiStateMap).length;
  const verifiedZones = Object.values(poiStateMap).filter(p => p.status === 1).length;
  const verifyingZones = Object.values(poiStateMap).filter(p => p.status === 0).length;
  const deadZones = Object.values(poiStateMap).filter(p => p.status === 2).length;

  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-['Inter'] relative overflow-hidden">
      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(0,255,204,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,204,0.03) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
      {/* Ambient glows */}
      <div className="fixed top-0 right-0 w-96 h-96 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,255,204,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="fixed bottom-0 left-0 w-64 h-64 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,0,68,0.05) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      <WelcomeModal />

      {/* Top Nav Bar */}
      <header className="relative z-20 border-b border-white/5 bg-black/60 backdrop-blur-xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00ffcc,#00aaaa)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold font-['Space_Grotesk'] text-white tracking-wide">GeoVerify</span>
            <span className="text-xs text-[#00ffcc] bg-[#00ffcc]/10 px-2 py-0.5 rounded-full border border-[#00ffcc]/20">DePIN v2</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stat pills */}
          <div className="hidden lg:flex items-center gap-2">
            {[
              { label: 'POI', val: totalZones, color: '#00ffcc' },
              { label: 'Doğrulandı', val: verifiedZones, color: '#00ff00' },
              { label: 'İnceleniyor', val: verifyingZones, color: '#ffcc00' },
              { label: 'Hatalı', val: deadZones, color: '#ff0044' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                <span className="text-xs font-bold text-white">{s.val}</span>
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>
          <TrustScoreBadge poiStateMap={poiStateMap} />

          {/* Network Energy Bar */}
          {wallet && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={(remainingRights !== null && remainingRights <= 3) ? '#ff0044' : '#00ffcc'} strokeWidth="2.5"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              <div className="flex gap-0.5 items-center">
                {Array.from({ length: 10 }).map((_, i) => {
                  const isActive = remainingRights !== null && i < remainingRights;
                  const isLow = remainingRights !== null && remainingRights <= 3;
                  return (
                    <div key={i} className="w-2 h-3 rounded-sm transition-all duration-500"
                      style={{ 
                        background: isActive ? (isLow ? '#ff0044' : '#00ffcc') : 'rgba(255,255,255,0.08)', 
                        boxShadow: isActive ? `0 0 4px ${isLow ? '#ff0044' : '#00ffcc'}` : 'none' 
                      }}
                    />
                  );
                })}
              </div>
              <span className="text-xs font-mono text-gray-400">
                {remainingRights === null ? '--' : remainingRights}/10
              </span>
            </div>
          )}

          {/* Wallet button */}
          <button onClick={connectWallet} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-105 disabled:opacity-50"
            style={{ background: wallet ? 'rgba(0,255,204,0.1)' : 'linear-gradient(135deg,#00ffcc,#00aaaa)', border: wallet ? '1px solid rgba(0,255,204,0.3)' : 'none', color: wallet ? '#00ffcc' : 'black', boxShadow: wallet ? '0 0 12px rgba(0,255,204,0.15)' : '0 0 20px rgba(0,255,204,0.3)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>
            {busy ? 'İşleniyor...' : wallet ? `${wallet.address.substring(0, 4)}...${wallet.address.slice(-4)}` : "Freighter Bağla"}
          </button>

          {/* Settings gear */}
          <div className="relative">
            <button onClick={() => setShowSettings(s => !s)} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            {showSettings && (
              <div className="absolute right-0 top-11 w-80 bg-[#111] border border-white/10 rounded-2xl p-4 shadow-2xl z-50">
                <h3 className="text-sm font-bold text-white mb-3">Kontrat Ayarları</h3>
                <p className="text-xs text-gray-500 mb-3">Kontrat başlatılmamışsa XLM SAC adresini girin.</p>
                <input type="text" value={xlmSacInput} onChange={e => setXlmSacInput(e.target.value)} placeholder="XLM SAC Adresi" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 mb-2 focus:outline-none focus:border-[#00ffcc]/40" />
                <button onClick={() => { initContract(); setShowSettings(false); }} disabled={busy} className="w-full py-2 rounded-lg bg-[#ffcc00]/10 border border-[#ffcc00]/20 text-[#ffcc00] text-xs font-bold hover:bg-[#ffcc00]/20 transition-all disabled:opacity-50">{busy ? 'İşleniyor...' : 'Kontratı Başlat'}</button>
                {errorMessage && <p className="text-xs text-[#ff0044] mt-2">{errorMessage}</p>}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Status bar */}
      {wallet && (
        <div className="relative z-10 border-b border-white/5 bg-black/30 px-6 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ffcc] animate-pulse" />
            <span className="text-xs text-gray-500">{statusMessage}</span>
          </div>
          <span className="text-xs text-gray-700 font-mono">Stellar Testnet • {wallet.address.substring(0, 6)}...{wallet.address.slice(-6)}</span>
        </div>
      )}

      {/* Map + Panel layout */}
      <div className="relative z-10 flex" style={{ height: wallet ? 'calc(100vh - 89px)' : 'calc(100vh - 57px)' }}>
        {/* Map full height */}
        <div className="flex-1 relative">
          <HexGrid
            apiKey={googleMapsApiKey}
            mapId={googleMapsMapId}
            center={[28.9784, 41.0082]}
            poiStateMap={poiStateMap}
            onSelectZone={handleZoneSelect}
          />
          {/* Live Activity Feed */}
          <LiveFeed poiStateMap={poiStateMap} />
          {/* Legend overlay */}
          <div className="absolute bottom-4 left-4 flex items-center gap-4 px-4 py-2 rounded-xl bg-black/70 backdrop-blur-sm border border-white/10 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#00ff00', boxShadow: '0 0 6px #00ff00' }} /> Doğrulandı</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ffcc00', boxShadow: '0 0 6px #ffcc00' }} /> İnceleniyor</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ff0044', boxShadow: '0 0 6px #ff0044' }} /> Hatalı</span>
            <span className="hidden md:flex text-[#00ffcc]">· Stellar Network Verification: Active</span>
          </div>
        </div>

        {/* Right side panel */}
        <div className={`w-[380px] flex-shrink-0 border-l border-white/5 bg-black/50 backdrop-blur-xl overflow-y-auto transition-transform duration-300 md:translate-x-0 ${selectedH3Id ? '' : 'hidden md:block'}`}>
          {selectedH3Id ? (
            <SelectedHexPanel
              selectedH3Id={selectedH3Id}
              selectedPoiState={selectedPoiState}
              busy={busy}
              walletAddress={wallet?.address}
              remainingRights={remainingRights}
              onClose={() => { setIsMobileSheetOpen(false); setSelectedH3Id(null); }}
              onSubmitReport={handlePoiSubmitIntent}
              onCreateBatch={createBatch}
              onVerify={verifySelectedPoi}
              onFlag={flagSelectedPoi}
              onQueryBatch={async (batchId) => {
                // Batch POI'lerini kontrol et — 2/3 eşiği
                const batchPois = Object.values(poiStateMap).filter(p => p.batch_id === batchId);
                const totalCount = batchPois.length;
                const verifiedCount = batchPois.filter(p => p.status === 1).length;
                const requiredCount = Math.ceil((totalCount * 2) / 3);
                return { eligible: verifiedCount >= requiredCount, verifiedCount, totalCount, requiredCount };
              }}
              onFinalizeBatch={async (batchId) => {
                await runAction(async () => {
                  requireContract();
                  await client.finalizeBatch(batchId);
                   alert("✓ İade işlemi cüzdanınıza gönderildi! Lütfen Freighter onayını kontrol edin.");
                  setStatusMessage(`Paket #${batchId} başarıyla kapatıldı.`);
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  await refreshOnChainData();
                });
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1 font-['Space_Grotesk']">Hücre Seçin</h3>
                <p className="text-gray-600 text-sm">Haritadan bir altıgene tıklayarak bölge bildirimlerini görüntüleyin.</p>
              </div>
              {!wallet && (
                <button onClick={connectWallet} disabled={busy} className="mt-2 px-6 py-3 rounded-xl text-black font-bold text-sm transition-all hover:scale-105 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#00ffcc,#00aaaa)', boxShadow: '0 0 20px rgba(0,255,204,0.3)' }}>
                  Freighter'ı Bağla
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
