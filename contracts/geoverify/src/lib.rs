#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, String, Symbol, Vec,
};

// =========================================================================
// Sabitler
// =========================================================================
const BATCH_DEPOSIT_STROOPS: i128 = 500_000_000; // 50 XLM
const MAX_POI_PER_BATCH: u32 = 10;
const CONSENSUS_THRESHOLD: i32 = 10;

// TTL yapılandırması (~5s/ledger)
const DAY_IN_LEDGERS: u32 = 17280;
const MIN_TTL: u32 = 7 * DAY_IN_LEDGERS; // Minimum 7 gün
const EXTEND_TTL: u32 = 14 * DAY_IN_LEDGERS; // 14 güne uzat

// =========================================================================
// Hata Katalogu
// =========================================================================
#[contracterror]
#[derive(Clone, Debug, Copy, Eq, PartialEq)]
pub enum GeoVerifyError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InsufficientDeposit = 3,
    BatchFull = 4,
    BatchNotFound = 5,
    BatchClosed = 6,
    BatchNotVerified = 7,
    PoiNotFound = 8,
    AlreadyVoted = 10,
    InvalidAmount = 11,
    Unauthorized = 12,
    RightsExhausted = 13,
}

// =========================================================================
// Enums & Structs
// =========================================================================
#[contracttype]
#[derive(Clone, Eq, PartialEq)]
pub enum BatchStatus {
    Active,
    Finalized,
    Slashed,
}

#[contracttype]
#[derive(Clone, Eq, PartialEq)]
pub enum PoiStatus {
    Pending,
    Confirmed,
    Rejected,
}

#[contracttype]
#[derive(Clone)]
pub struct SystemConfig {
    pub admin: Address,
    pub xlm_token: Address,
    pub batch_deposit: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Batch {
    pub id: u64,
    pub author: Address,
    pub poi_count: u32,
    pub status: BatchStatus,
    pub deposit_amount: i128,
    pub poi_ids: Vec<u64>,
}

#[contracttype]
#[derive(Clone)]
pub struct Poi {
    pub id: u64,
    pub batch_id: u64,
    pub author: Address,
    pub h3_index: Symbol,
    pub description_cid: String,
    pub trust_score: i32,
    pub voters: Vec<Address>,
    pub status: PoiStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,              // Instance Storage
    NextBatchId,         // Instance Storage
    NextPoiId,           // Instance Storage
    Batch(u64),          // Persistent Storage
    Poi(u64),            // Persistent Storage
    Vote(u64, Address),  // Persistent Storage (Optimizasyon için ayrı key)
    TreasuryBalance,     // Instance Storage (Hazine Havuzu)
    UserRights(Address), // Persistent Storage (Kullanıcı İşlem Hakları)
}

// =========================================================================
// Kontrat Implementasyonu
// =========================================================================
#[contract]
pub struct GeoVerifyContract;

#[contractimpl]
impl GeoVerifyContract {
    /// Kontratı başlat (admin ve XLM token)
    pub fn initialize(env: Env, admin: Address) -> Result<(), GeoVerifyError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(GeoVerifyError::AlreadyInitialized);
        }

        admin.require_auth();

        let token_str = soroban_sdk::String::from_str(&env, "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC");
        let xlm_token = Address::from_string(&token_str);

        let config = SystemConfig {
            admin,
            xlm_token,
            batch_deposit: BATCH_DEPOSIT_STROOPS,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::NextBatchId, &1u64);
        env.storage().instance().set(&DataKey::NextPoiId, &1u64);
        env.storage().instance().set(&DataKey::TreasuryBalance, &0i128);

        Ok(())
    }

    /// Tüm batch'lerin ID'si sıralı ilerlediğinden, oluşturulan en son batch'in ID'sini döndürür.
    /// Frontend bu metodu kullanarak kaç batch çekeceğini bilebilir.
    pub fn get_last_batch_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextBatchId).unwrap_or(1u64).saturating_sub(1)
    }

    /// Belirtilen kullanıcının kalan işlem hakkını döner (varsayılan: 10)
    pub fn get_rights(env: Env, user: Address) -> u32 {
        let key = DataKey::UserRights(user);
        env.storage().persistent().get(&key).unwrap_or(10u32)
    }

    /// İç fonksiyon: Kullanıcının hakkını 1 azalt. Hak 0 ise error döndür.
    /// Not: Bu private bir yardımcı fonksiyondur. Auth kontrolü çağıran public fonksiyonda yapılır.
    fn use_right(env: &Env, user: &Address) -> Result<(), GeoVerifyError> {
        let key = DataKey::UserRights(user.clone());
        let current_rights: u32 = env.storage().persistent().get(&key).unwrap_or(10u32);
        
        if current_rights == 0 {
            return Err(GeoVerifyError::RightsExhausted);
        }

        let new_rights = current_rights - 1;
        env.storage().persistent().set(&key, &new_rights);
        env.storage().persistent().extend_ttl(&key, MIN_TTL, EXTEND_TTL);

        Ok(())
    }

    /// Yeni paket (Batch) oluştur (50 XLM depozito keser)
    pub fn create_batch(env: Env, user: Address) -> Result<u64, GeoVerifyError> {
        user.require_auth();
        let config: SystemConfig = env.storage().instance().get(&DataKey::Config).ok_or(GeoVerifyError::NotInitialized)?;
        
        let client = token::Client::new(&env, &config.xlm_token);
        client.transfer(&user, &env.current_contract_address(), &config.batch_deposit);

        let batch_id: u64 = env.storage().instance().get(&DataKey::NextBatchId).unwrap();
        env.storage().instance().set(&DataKey::NextBatchId, &(batch_id + 1));

        let batch = Batch {
            id: batch_id,
            author: user.clone(),
            poi_count: 0,
            status: BatchStatus::Active,
            deposit_amount: config.batch_deposit,
            poi_ids: Vec::new(&env),
        };

        // Yeni paket alındığında kullanıcının işlem hakkını 10'a sıfırla
        let rights_key = DataKey::UserRights(user.clone());
        env.storage().persistent().set(&rights_key, &10u32);
        env.storage().persistent().extend_ttl(&rights_key, MIN_TTL, EXTEND_TTL);

        env.storage().persistent().set(&DataKey::Batch(batch_id), &batch);
        env.storage().persistent().extend_ttl(&DataKey::Batch(batch_id), MIN_TTL, EXTEND_TTL);

        Ok(batch_id)
    }

    /// Yeni bir POI bildirimi gönder
    pub fn submit_poi(
        env: Env,
        user: Address,
        batch_id: u64,
        h3_index: Symbol,
        cid: String,
    ) -> Result<u64, GeoVerifyError> {
        user.require_auth();

        // Kullanıcının hakkı kontrol et ve azalt
        Self::use_right(&env, &user)?;

        let mut batch: Batch = env.storage().persistent().get(&DataKey::Batch(batch_id)).ok_or(GeoVerifyError::BatchNotFound)?;
        
        if batch.status != BatchStatus::Active {
            return Err(GeoVerifyError::BatchClosed);
        }
        if batch.author != user {
            return Err(GeoVerifyError::Unauthorized);
        }
        if batch.poi_count >= MAX_POI_PER_BATCH {
            return Err(GeoVerifyError::BatchFull);
        }

        let poi_id: u64 = env.storage().instance().get(&DataKey::NextPoiId).unwrap();
        env.storage().instance().set(&DataKey::NextPoiId, &(poi_id + 1));

        let poi = Poi {
            id: poi_id,
            batch_id,
            author: user,
            h3_index,
            description_cid: cid,
            trust_score: 0,
            voters: Vec::new(&env),
            status: PoiStatus::Pending,
        };

        batch.poi_ids.push_back(poi_id);
        batch.poi_count += 1;

        env.storage().persistent().set(&DataKey::Poi(poi_id), &poi);
        env.storage().persistent().extend_ttl(&DataKey::Poi(poi_id), MIN_TTL, EXTEND_TTL);

        env.storage().persistent().set(&DataKey::Batch(batch_id), &batch);
        env.storage().persistent().extend_ttl(&DataKey::Batch(batch_id), MIN_TTL, EXTEND_TTL);

        Ok(poi_id)
    }

    /// Diğer kullanıcıların POI doğrulama (veya hatalı bildirme) fonksiyonu
    pub fn vote_poi(env: Env, voter: Address, poi_id: u64, approve: bool) -> Result<(), GeoVerifyError> {
        voter.require_auth();

        // Kullanıcının hakkı kontrol et ve azalt
        Self::use_right(&env, &voter)?;

        let mut poi: Poi = env.storage().persistent().get(&DataKey::Poi(poi_id)).ok_or(GeoVerifyError::PoiNotFound)?;
        
        // Mükerrer oy kontrolü (Zaten struct içinde tuttuğumuz için buradan da bakabiliriz)
        if poi.voters.contains(&voter) {
            return Err(GeoVerifyError::AlreadyVoted);
        }

        // Oyu ekle
        poi.voters.push_back(voter.clone());

        if approve {
            poi.trust_score += 1;
        } else {
            poi.trust_score -= 1;
        }

        // Eşik Kontrolü: 3 oy onay demektir
        if poi.voters.len() >= 3 {
            poi.status = PoiStatus::Confirmed;
        }

        env.storage().persistent().set(&DataKey::Poi(poi_id), &poi);
        env.storage().persistent().extend_ttl(&DataKey::Poi(poi_id), MIN_TTL, EXTEND_TTL);

        env.storage().persistent().extend_ttl(&DataKey::Batch(poi.batch_id), MIN_TTL, EXTEND_TTL);

        Ok(())
    }

    /// Paketi kapat ve geçerliyse depozitoyu iade et
    pub fn finalize_batch(env: Env, caller: Address, batch_id: u64) -> Result<(), GeoVerifyError> {
        caller.require_auth();
        let config: SystemConfig = env.storage().instance().get(&DataKey::Config).ok_or(GeoVerifyError::NotInitialized)?;
        let mut batch: Batch = env.storage().persistent().get(&DataKey::Batch(batch_id)).ok_or(GeoVerifyError::BatchNotFound)?;
        
        if batch.status != BatchStatus::Active {
            return Err(GeoVerifyError::BatchClosed);
        }
        if batch.author != caller && config.admin != caller {
            return Err(GeoVerifyError::Unauthorized);
        }

        if batch.poi_count == 0 {
            return Err(GeoVerifyError::BatchNotVerified);
        }

        let mut verified_count = 0;
        for poi_id in batch.poi_ids.clone() {
            let poi: Poi = env.storage().persistent().get(&DataKey::Poi(poi_id)).ok_or(GeoVerifyError::PoiNotFound)?;
            if poi.status == PoiStatus::Confirmed {
                verified_count += 1;
            }
        }

        // %80 başarı eşiği: Ceiling division ile hesapla ki 1-2 POI'li paketlerde
        // tam sayı yuvarlama hatası olmasın. (poi_count * 8 + 9) / 10 formülü
        // her zaman tavanı alır → 1 POI için 1, 2 POI için 2, 10 için 8.
        // .max(1) ile sıfır çıkmamasını garanti altına alıyoruz.
        let required_verified = ((batch.poi_count * 8 + 9) / 10).max(1);
        if verified_count < required_verified {
            return Err(GeoVerifyError::BatchNotVerified);
        }

        batch.status = BatchStatus::Finalized;
        env.storage().persistent().set(&DataKey::Batch(batch_id), &batch);

        let client = token::Client::new(&env, &config.xlm_token);
        client.transfer(&env.current_contract_address(), &batch.author, &batch.deposit_amount);

        env.storage().persistent().extend_ttl(&DataKey::Batch(batch_id), MIN_TTL, EXTEND_TTL);

        Ok(())
    }

    /// Kötü niyetli paketi kes (slash), depozitoyu Hazine Havuzuna ekle
    pub fn slash_batch(env: Env, admin: Address, batch_id: u64) -> Result<(), GeoVerifyError> {
        admin.require_auth();
        let config: SystemConfig = env.storage().instance().get(&DataKey::Config).ok_or(GeoVerifyError::NotInitialized)?;
        
        if config.admin != admin {
            return Err(GeoVerifyError::Unauthorized);
        }

        let mut batch: Batch = env.storage().persistent().get(&DataKey::Batch(batch_id)).ok_or(GeoVerifyError::BatchNotFound)?;
        if batch.status != BatchStatus::Active {
            return Err(GeoVerifyError::BatchClosed);
        }

        let mut has_malicious = false;
        for poi_id in batch.poi_ids.clone() {
            let poi: Poi = env.storage().persistent().get(&DataKey::Poi(poi_id)).ok_or(GeoVerifyError::PoiNotFound)?;
            if poi.trust_score < 0 {
                has_malicious = true;
                break;
            }
        }

        if !has_malicious {
            return Err(GeoVerifyError::BatchNotVerified);
        }

        batch.status = BatchStatus::Slashed;
        env.storage().persistent().set(&DataKey::Batch(batch_id), &batch);

        // Depozito zaten kontratın üstündeydi, Hazine Bakiyesini güncelleyerek havuza eklemiş oluyoruz.
        let current_treasury: i128 = env.storage().instance().get(&DataKey::TreasuryBalance).unwrap_or(0);
        env.storage().instance().set(&DataKey::TreasuryBalance, &(current_treasury + batch.deposit_amount));

        env.storage().persistent().extend_ttl(&DataKey::Batch(batch_id), MIN_TTL, EXTEND_TTL);

        Ok(())
    }

    /// Hazineye dışarıdan fon ekle
    pub fn fund_treasury(env: Env, sender: Address, amount: i128) -> Result<(), GeoVerifyError> {
        sender.require_auth();
        if amount <= 0 {
            return Err(GeoVerifyError::InvalidAmount);
        }

        let config: SystemConfig = env.storage().instance().get(&DataKey::Config).ok_or(GeoVerifyError::NotInitialized)?;
        
        // Sender'dan kontrat adresine transfer
        let client = token::Client::new(&env, &config.xlm_token);
        client.transfer(&sender, &env.current_contract_address(), &amount);

        // Hazine bakiyesini artır
        let current_treasury: i128 = env.storage().instance().get(&DataKey::TreasuryBalance).unwrap_or(0);
        env.storage().instance().set(&DataKey::TreasuryBalance, &(current_treasury + amount));

        Ok(())
    }

    // =========================================================================
    // Read-only Queries
    // =========================================================================

    pub fn get_treasury_balance(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TreasuryBalance).unwrap_or(0)
    }

    pub fn get_batch(env: Env, batch_id: u64) -> Result<Batch, GeoVerifyError> {
        env.storage().persistent().get(&DataKey::Batch(batch_id)).ok_or(GeoVerifyError::BatchNotFound)
    }

    pub fn get_poi(env: Env, poi_id: u64) -> Result<Poi, GeoVerifyError> {
        env.storage().persistent().get(&DataKey::Poi(poi_id)).ok_or(GeoVerifyError::PoiNotFound)
    }
}
