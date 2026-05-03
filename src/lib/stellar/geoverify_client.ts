import {
  BASE_FEE,
  Operation,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr
} from "@stellar/stellar-sdk";
import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction
} from "@stellar/freighter-api";

// ─── Rust contracterror kodları → Türkçe mesaj tablosu ─────────────────────
const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  1: "Kontrat başlatılmamış. Önce 'Kontratı Başlat' (initialize) adımını tamamlayın.",
  2: "Kontrat zaten başlatılmış. initialize() ikinci kez çağrılamaz.",
  3: "Depozito yetersiz veya geçerli değil.",
  4: "Paket doldu. Paket başına en fazla 10 POI gönderilebilir.",
  5: "Paket bulunamadı. Paket kimliğini kontrol edin.",
  6: "Paket kapatılmış (Tamamlandı veya Ceza uygulandı).",
  7: "Paket doğrulama eşiğini henüz karşılamıyor.",
  8: "POI bulunamadı. POI kimliğini kontrol edin.",
  10: "Bu doğrulayıcı bu POI'ye zaten oy kullandı.",
  11: "Geçersiz miktar. Tutar sıfır veya negatif olamaz.",
  12: "Yetkisiz işlem. Sadece sahibi veya admin bu işlemi yapabilir.",
};

/**
 * Soroban simülasyon veya onchain hata mesajından contract hata kodunu parse eder.
 * Örnek: "Error(Contract, #5)" → 5
 */
function decodeContractError(raw: string): string {
  // Rust contracterror döndürür: "Error(Contract, #N)" veya "contract error: N"
  const match = raw.match(/#(\d+)/) ?? raw.match(/error[\s:]+code[\s:=]+(\d+)/i);
  if (match) {
    const code = parseInt(match[1], 10);
    const msg = CONTRACT_ERROR_MESSAGES[code];
    if (msg) return `Sözleşme hatası (kod ${code}): ${msg}`;
  }
  // WasmVm / UnreachableCodeReached — eski kontrat (henüz yeniden derlenmedi)
  if (raw.includes("UnreachableCodeReached") || raw.includes("InvalidAction")) {
    return (
      "İşlem başarısız: Akıllı kontrat hatası (WasmVm/InvalidAction). " +
      "Kontratın başlatılıp başlatılmadığını kontrol edin; " +
      "ya da kontratı wee_alloc kaldırılmış yeni WASM ile yeniden dağıtın."
    );
  }
  return raw;
}

export interface GeoVerifyClientConfig {
  contractId: string;
  rpcUrl: string;
  network: string;
  networkPassphrase: string;
  /** Testnet için: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC */
  xlmSacAddress: string;
}

export interface WalletSession {
  address: string;
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
}

export interface InvocationResult<T = unknown> {
  hash: string;
  status: string;
  returnValue: T | null;
}

const envConfig: GeoVerifyClientConfig = {
  contractId: import.meta.env.VITE_GEOVERIFY_CONTRACT_ID ?? "",
  rpcUrl:
    import.meta.env.VITE_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
  network: import.meta.env.VITE_STELLAR_NETWORK ?? "TESTNET",
  networkPassphrase:
    import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ??
    "Test SDF Network ; September 2015",
  xlmSacAddress: import.meta.env.VITE_XLM_SAC_ADDRESS ?? ""
};

export const defaultGeoVerifyConfig = envConfig;

export class GeoVerifyClient {
  constructor(private readonly config: GeoVerifyClientConfig) { }

  hasContractBinding() {
    return Boolean(this.config.contractId && this.config.rpcUrl);
  }

  async connectWallet(): Promise<WalletSession> {
    const availability = (await isConnected()) as {
      isConnected?: boolean;
      error?: string;
    };

    if (availability.error) {
      throw new Error(availability.error);
    }

    if (availability.isConnected === false) {
      throw new Error("Freighter eklentisi yüklenmemiş veya erişilemiyor.");
    }

    const access = await requestAccess();
    if (access.error) {
      throw new Error(access.error);
    }

    const [addressInfo, networkInfo] = await Promise.all([
      getAddress(),
      getNetworkDetails()
    ]);

    if (addressInfo.error) {
      throw new Error(addressInfo.error);
    }

    if (networkInfo.error) {
      throw new Error(networkInfo.error);
    }

    return {
      address: addressInfo.address,
      network: networkInfo.network ?? this.config.network,
      networkPassphrase:
        networkInfo.networkPassphrase ?? this.config.networkPassphrase,
      rpcUrl: networkInfo.sorobanRpcUrl ?? this.config.rpcUrl
    };
  }

  /** Kontraşın initialize() ile başlatılıp başlatılmadığını simule ederek kontrol eder. */
  async checkInitialized(walletAddress: string): Promise<boolean> {
    if (!this.hasContractBinding()) return false;
    try {
      const server = new rpc.Server(this.config.rpcUrl);
      const account = await server.getAccount(walletAddress);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.config.networkPassphrase
      })
        .setTimeout(30)
        .addOperation(
          Operation.invokeContractFunction({
            contract: this.config.contractId,
            function: "get_last_batch_id",
            args: []
          })
        )
        .build();

      const sim = await server.simulateTransaction(tx);
      // eğer simuleşasyon hata döndürmediyse kontrat başlatılmış demektir
      return !("error" in sim && sim.error);
    } catch {
      return false;
    }
  }

  /** Kontraşı sadece admin adresiyle başlatır. XLM token adresi kontrat içinde hardcode edilmiştir. */
  async initializeContract(adminAddress: string): Promise<InvocationResult> {
    const session = await this.connectWallet();
    return this.invoke("initialize", session, [
      nativeToScVal(adminAddress, { type: "address" })
    ]);
  }

  async createBatch(userAddress?: string) {
    const session = await this.connectWallet();
    const address = userAddress ?? session.address;

    return this.invoke<number>("create_batch", session, [
      nativeToScVal(address, { type: "address" })
    ]);
  }

  async submitPoi(batchId: number, h3Id: string, ipfsHash: string) {
    const session = await this.connectWallet();

    return this.invoke<number>("submit_poi", session, [
      nativeToScVal(session.address, { type: "address" }),
      nativeToScVal(batchId, { type: "u64" }),
      nativeToScVal(h3Id, { type: "symbol" }),
      nativeToScVal(ipfsHash, { type: "string" })
    ]);
  }

  async verifyPoi(poiId: number) {
    const session = await this.connectWallet();

    // vote_poi parametrelerinde batch_id bulunmuyor, poi_id üzerinden kontrat kendisi buluyor.
    return this.invoke("vote_poi", session, [
      nativeToScVal(session.address, { type: "address" }),
      nativeToScVal(poiId, { type: "u64" }),
      nativeToScVal(true, { type: "bool" })
    ]);
  }

  async flagPoi(poiId: number) {
    const session = await this.connectWallet();

    // vote_poi parametrelerinde batch_id bulunmuyor, poi_id üzerinden kontrat kendisi buluyor.
    return this.invoke("vote_poi", session, [
      nativeToScVal(session.address, { type: "address" }),
      nativeToScVal(poiId, { type: "u64" }),
      nativeToScVal(false, { type: "bool" })
    ]);
  }

  async finalizeBatch(batchId: number) {
    const session = await this.connectWallet();

    return this.invoke("finalize_batch", session, [
      nativeToScVal(session.address, { type: "address" }),
      nativeToScVal(batchId, { type: "u64" })
    ]);
  }

  async slashBatch(batchId: number) {
    const session = await this.connectWallet();

    return this.invoke("slash_batch", session, [
      nativeToScVal(session.address, { type: "address" }),
      nativeToScVal(batchId, { type: "u64" })
    ]);
  }

  async fundTreasury(xlmAmount: number) {
    const session = await this.connectWallet();
    const stroops = BigInt(Math.round(xlmAmount * 10_000_000));

    return this.invoke("fund_treasury", session, [
      nativeToScVal(session.address, { type: "address" }),
      nativeToScVal(stroops, { type: "i128" })
    ]);
  }

  async fundRewards(xlmAmount: number) {
    return this.fundTreasury(xlmAmount);
  }

  async getBatch(batchId: number) {
    const session = await this.connectWallet();

    return this.read("get_batch", session, [
      nativeToScVal(batchId, { type: "u64" })
    ]);
  }

  async getPoi(poiId: number) {
    const session = await this.connectWallet();

    return this.read("get_poi", session, [
      nativeToScVal(poiId, { type: "u64" })
    ]);
  }

  /**
   * Kullanıcının kontrattaki kalan işlem hakkını (rights) sorgular.
   */
  async getRights(address?: string): Promise<number> {
    const session = await this.connectWallet();
    const targetAddress = address || session.address;

    try {
      const result = await this.read("get_rights", session, [
        nativeToScVal(targetAddress, { type: "address" })
      ]);

      // Eğer sonuç dönerse number'a çevir, dönmezse (yeni kontratsa vs) varsayılan 10
      return result !== undefined && result !== null ? Number(result) : 10;
    } catch (e) {
      console.error("getRights çağrısı başarısız, varsayılan (10) dönülüyor. HATA DETAYI:", e);
      return 10; // Hata durumunda UI kitlenmesin diye varsayılan
    }
  }

  /** 
   * Demo ortamı için: batch=1'den başlayarak hata alana kadar tüm batch'leri çeker.
   * Kontratta "NextBatchId" dışa açık olmadığı için asenkron bir while döngüsü kullanılır.
   */
  async fetchAllOnChainPois(): Promise<{
    batches: any[];
    pois: any[];
    latestBatchId: number | null;
  }> {
    const session = await this.connectWallet();
    let maxBatchId = 0;
    let hasLastBatchIdMethod = false;

    // 1. Önce get_last_batch_id denemesi yapalım (yeni kontrat destekliyorsa)
    try {
      const lastIdVal = await this.read<any>("get_last_batch_id", session, [], { suppressErrorLog: true });
      if (lastIdVal !== null && lastIdVal !== undefined) {
        maxBatchId = Number(lastIdVal);
        hasLastBatchIdMethod = true;
        console.log(`get_last_batch_id başarılı: ${maxBatchId}`); // DEBUG
      }
    } catch (e) {
      console.log("get_last_batch_id desteklenmiyor, fallback mantığı kullanılacak."); // DEBUG
    }

    // Eğer kontratımızda get_last_batch_id varsa ve sonuç 0 ise, hiç paket yoktur.
    // Boşuna döngüye veya fallback'e girmemek için hemen boş dönelim.
    if (hasLastBatchIdMethod && maxBatchId === 0) {
      console.log("Kontratta henüz hiç paket bulunmuyor, boş liste dönülüyor.");
      return { batches: [], pois: [], latestBatchId: null };
    }

    const batches = [];
    const pois = [];

    // 2. Paketleri çekelim (paralel veya seri)
    if (hasLastBatchIdMethod && maxBatchId > 0) {
      // get_last_batch_id varsa, paralel fetch yap
      console.log(`Fetching ${maxBatchId} batches in parallel...`); // DEBUG
      const batchPromises = [];
      for (let i = 1; i <= maxBatchId; i++) {
        batchPromises.push(
          this.read<any>("get_batch", session, [nativeToScVal(i, { type: "u64" })], { suppressErrorLog: true })
            .then(b => ({ id: i, data: b }))
            .catch(() => ({ id: i, data: null }))
        );
      }

      const batchResults = await Promise.all(batchPromises);
      for (const res of batchResults) {
        if (res.data) batches.push(res.data);
      }
    } else {
      // Fallback: Eski kontrat mantığı (brute-force) ama hata 3 gelirse hemen kır
      let currentBatchId = 1;
      while (true) {
        try {
          const batchData = await this.read<any>("get_batch", session, [
            nativeToScVal(currentBatchId, { type: "u64" })
          ], { suppressErrorLog: true });
          if (batchData) {
            batches.push(batchData);
            currentBatchId++;
          } else {
            break;
          }
        } catch (e: any) {
          // Sözleşme hatası kod 3 ise veya Contract, #3 geçiyorsa sonuna gelmişizdir, gürültüsüzce kır
          const errStr = e instanceof Error ? e.message : String(e);
          if (errStr.includes("kod 3") || errStr.includes("Contract, #3")) {
            console.log(`End of batches reached at ID ${currentBatchId - 1}`); // DEBUG
            break;
          }
          // Başka bir hataysa uyar ve çık
          console.warn(`Unexpected batch read error for ID ${currentBatchId}:`, e);
          break;
        }
      }
    }

    // 3. Poi'leri paralel çekme
    const poiPromises = [];
    for (const batch of batches) {
      if (batch.poi_ids && Array.isArray(batch.poi_ids)) {
        for (const poiId of batch.poi_ids) {
          poiPromises.push(
            this.read<any>("get_poi", session, [nativeToScVal(Number(poiId), { type: "u64" })])
              .catch(err => {
                console.warn(`POI ${poiId} okunamadı:`, err);
                return null;
              })
          );
        }
      }
    }

    const poiResults = await Promise.all(poiPromises);
    for (const poiData of poiResults) {
      if (poiData) pois.push(poiData);
    }

    // 4. latestBatchId hesaplama
    let actualLatestBatchId = null;
    if (batches.length > 0) {
      // Sort batches by ID to safely find the max
      const sortedIds = batches.map(b => Number(b.id)).sort((a, b) => a - b);
      actualLatestBatchId = sortedIds[sortedIds.length - 1];
    }

    console.log(`Fetch complete: ${batches.length} batches, ${pois.length} POIs`); // DEBUG
    return {
      batches,
      pois,
      latestBatchId: actualLatestBatchId
    };
  }

  async getTreasuryPool() {
    const session = await this.connectWallet();
    // Eski/yanlış metot adını güncel kontrata göre düzelttik
    return this.read<bigint>("get_treasury_balance", session, []);
  }

  private async invoke<T = unknown>(
    method: string,
    session: WalletSession,
    args: xdr.ScVal[]
  ): Promise<InvocationResult<T>> {
    if (!this.hasContractBinding()) {
      throw new Error(
        "Sözleşme kimliği eksik. Ortam dosyanıza VITE_GEOVERIFY_CONTRACT_ID değeri girin."
      );
    }

    const server = new rpc.Server(session.rpcUrl);
    const account = await server.getAccount(session.address);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: session.networkPassphrase
    })
      .setTimeout(30)
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.config.contractId,
          function: method,
          args
        })
      )
      .build();

    const simulation = await server.simulateTransaction(tx);
    if ("error" in simulation && simulation.error) {
      const raw =
        typeof simulation.error === "string"
          ? simulation.error
          : JSON.stringify(simulation.error);
      throw new Error(decodeContractError(raw));
    }

    const preparedTx = rpc.assembleTransaction(tx, simulation).build();
    const signed = await signTransaction(preparedTx.toXDR(), {
      address: session.address,
      networkPassphrase: session.networkPassphrase
    });

    if (signed.error || !signed.signedTxXdr) {
      throw new Error(signed.error ?? "Freighter imzalanmış XDR döndürmedi. İmza reddedildi veya bağlantı kesildi.");
    }

    const submission = await server.sendTransaction(
      new Transaction(signed.signedTxXdr, session.networkPassphrase)
    );

    if (submission.status !== "PENDING") {
      throw new Error(`İşlem gönderilemedi: Durum kodu ${submission.status} — Ağ rölesi veya hesap bakiyesi kontrol edilmeli.`);
    }

    const completed = await server.pollTransaction(submission.hash, {
      attempts: 12,
      sleepStrategy: () => 1500
    });

    if (completed.status !== "SUCCESS") {
      // returnValue yoksa genel mesaj, varsa kontrat hata kodunu çöz
      const rawError = completed.status ?? "FAILED";
      throw new Error(
        `İşlem başarısız (durum: ${rawError}). ${decodeContractError(rawError)
        }`
      );
    }

    return {
      hash: submission.hash,
      status: completed.status,
      returnValue: this.decodeReturnValue<T>(completed)
    };
  }

  private async read<T>(
    method: string,
    session: WalletSession,
    args: xdr.ScVal[],
    options?: { suppressErrorLog?: boolean }
  ): Promise<T | null> {
    if (!this.hasContractBinding()) {
      throw new Error(
        "Sözleşme kimliği eksik. Ortam dosyanıza VITE_GEOVERIFY_CONTRACT_ID değeri girin."
      );
    }

    const server = new rpc.Server(session.rpcUrl);
    const account = await server.getAccount(session.address);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: session.networkPassphrase
    })
      .setTimeout(30)
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.config.contractId,
          function: method,
          args
        })
      )
      .build();

    const simulation = await server.simulateTransaction(tx);

    if ("error" in simulation && simulation.error) {
      const raw =
        typeof simulation.error === "string"
          ? simulation.error
          : JSON.stringify(simulation.error);
      const decodedError = decodeContractError(raw);
      if (!options?.suppressErrorLog) {
        console.error(`Read error for ${method}:`, decodedError); // DEBUG
      }
      throw new Error(decodedError);
    }

    const result = "result" in simulation ? simulation.result : undefined;

    // DEBUG: Gelen raw simulation objesini konsola basıyoruz
    if (method === "get_rights") {
      console.log(`[DEBUG] get_rights simulation:`, simulation);
    }

    if (!result?.retval) {
      console.warn(`[DEBUG] ${method} returned no result.retval!`);
      return null;
    }

    const nativeValue = scValToNative(result.retval) as T;
    console.log(`Read ${method} native value:`, nativeValue); // DEBUG
    return nativeValue;
  }

  private decodeReturnValue<T>(result: {
    returnValue?: string | xdr.ScVal | null;
  }): T | null {
    if (!result.returnValue) {
      return null;
    }

    const scVal =
      typeof result.returnValue === "string"
        ? xdr.ScVal.fromXDR(result.returnValue, "base64")
        : result.returnValue;

    return scValToNative(scVal) as T;
  }
}
