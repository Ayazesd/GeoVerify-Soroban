# Konum Kanıtı

`Konum Kanıtı`, merkezi olmayan son kilometre adres doğrulaması için geliştirilmiş bir Stellar + Soroban DePIN prototipidir. Hedef, navigasyonun başarısız olduğu noktaları düzeltmektir: apartman girişleri, kapıcı masaları, servis yolları, site kapıları ve yalnızca teslimat yapılabilen erişim noktaları.

Bu depo, istenen mimariye göre yapılandırılmıştır:

- `contracts/geoverify/src/lib.rs`: Soroban akıllı sözleşmesi
- `src/lib/stellar/geoverify_client.ts`: Freighter + Stellar SDK istemcisi
- `agent/skills/geoverify_skill.md`: Doğrulama otomasyonu için AI ajan becerisi tanımı
- `src/components/Map/HexGrid.tsx`: H3 + Google Haritalar güven yüzeyi görselleştirmesi

## Neler Dahil

- Şunları yöneten bir Soroban sözleşmesi:
  - `50 XLM` emanet destekli paketler
  - Paket başına `10` POI
  - H3 çözünürlüğü `8`
  - Ağırlıklı sakin ve kurye oylaması
  - Başarılı paketler için paylaşılan hazine finansmanı
  - Kötü niyetli anlaşmazlık tırmanması ve hazine destekli paket kesintisi (slashing)
- **Konum Kanıtı** markasıyla React frontend'i
- Kırmızı / Sarı / Yeşil güven durumlarıyla Google Haritalar tabanlı heksagon grid görünümü
- Sözleşmeyi çağırmak için Freighter'a hazır TypeScript istemcisi
- Otomatik kurye/sakin doğrulama akışları için ajan becerisi dosyası

## Hazine Modeli

Başarısız depozitolar yakılmak yerine bu uygulama, kesilen XLM'i protokol hazinesinde tutar. Bu hazine daha sonra doğrulanmış paketler sonuçlandırıldığında dürüst katkıcılara ödül ödemek için kullanılır.

İlgili Stellar belgeleri:

- Stellar Varlık Sözleşmesi'ne genel bakış: https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Yerel varlık SAC dağıtımı ve davranışı: https://developers.stellar.org/docs/build/guides/cli/deploy-stellar-asset-contract

## Frontend Kurulumu

Bu uygulama artık canlı haritayı render etmek için resmi Google Maps JavaScript API'yi kullanmaktadır. Gömülü etkileşimli harita için tarayıcı tarafı harita SDK'sına ihtiyaç duyulmaktadır.

İlgili belgeler:

- Google Maps JavaScript API'ye genel bakış: https://developers.google.com/maps/documentation/javascript/overview
- Maps JavaScript API yükleme: https://developers.google.com/maps/documentation/javascript/load-maps-js-api
- Poligon katmanları: https://developers.google.com/maps/documentation/javascript/reference/polygon

`.env.example` dosyasından yerel `.env` dosyası oluşturun:

```bash
VITE_GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_TARAYICI_ANAHTARINIZ
VITE_GOOGLE_MAPS_MAP_ID=
VITE_GEOVERIFY_CONTRACT_ID=CC...
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK=TESTNET
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

Bağımlılıkları yükleyin ve uygulamayı başlatın:

```bash
npm install
npm run dev
```

## Sözleşme Kurulumu

Sözleşmeyi derlemek ve dağıtmak için Rust + Stellar CLI ortamı gereklidir:

```bash
cargo test --manifest-path contracts/Cargo.toml -p geoverify
stellar contract build --package geoverify --manifest-path contracts/Cargo.toml
```

Dağıtımın ardından, dağıtılan sözleşme kimliğini `VITE_GEOVERIFY_CONTRACT_ID` değerine yerleştirin.

## Beklenen İş Akışı

1. Sözleşmeyi şunlarla başlatın:
   - `admin` (yönetici adresi)
   - Yerel XLM SAC adresi
2. `fund_treasury` veya geriye dönük uyumlu `fund_rewards` kullanarak hazineyi doldurun.
3. Kullanıcılar `create_batch` ile paket açar.
4. POI'ler `submit_poi` ile gönderilir.
5. Kuryeler ve sakinler `verify_poi` ile doğrulama yapar.
6. Anlaşmazlıklar `flag_poi` üzerinden tırmanır.
7. Başarılı paketler `finalize_batch` çağırır; sahte olanlar `slash_batch` çağırır ve depozitoyu hazineye aktarır.

## Notlar

- Bu ortamda `node`, `npm`, `rust`, `cargo` veya `git` yüklü olmadığından, buradaki kod yerel olarak çalıştırılmadan hazırlanmıştır.
- Frontend, canlı bir sözleşme bağlamadan önce sitenin anlamlı H3 bölgelerine sahip olması için İstanbul etrafında çalışan bir demo veri katmanıyla birlikte gelmektedir.
