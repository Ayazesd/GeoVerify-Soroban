import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";

export type HexState = "dead" | "verifying" | "verified";

export interface HexZone {
  h3Id: string;
  label: string;
  verificationScore: number;
  residentVotes: number;
  courierVotes: number;
  state: HexState;
  ipfsHash: string;
  centroid: [number, number];
  notes: string;
}

const H3_RESOLUTION = 8;
const ISTANBUL_CENTER: [number, number] = [28.9784, 41.0082];

const zoneProfiles = [
  {
    label: "Galata Son Kilometre Dar Sokağı",
    residentVotes: 0,
    courierVotes: 2,
    notes: "Kurye kapsaması zayıf ve apartman giriş metadata'ı eksik ölü bölge."
  },
  {
    label: "Karakoy Teslimat Omurgası",
    residentVotes: 1,
    courierVotes: 3,
    notes: "Bisiklet kuryelerinden karışık raporlar geliyor; güven eşiğinin altında."
  },
  {
    label: "Eminonü Çarşı Kümesi",
    residentVotes: 2,
    courierVotes: 1,
    notes: "Sakinler dükkan giriş noktalarını ve yükleme yolunu onayladı."
  },
  {
    label: "Sirkeci Kargo Cebi",
    residentVotes: 1,
    courierVotes: 5,
    notes: "Kurye yoğunluklu koridor; hala sakin onayı bekliyor."
  },
  {
    label: "Kadıköy Yoğun Adres Şeridi",
    residentVotes: 2,
    courierVotes: 4,
    notes: "Bina girişleri ve servis yolları etrafında sağlıklı fikir birliği mevcut."
  },
  {
    label: "Moda Avlu Labirenti",
    residentVotes: 0,
    courierVotes: 1,
    notes: "Kapalı avlular ve özel erişim kapıları nedeniyle kafa karıştırıcı yönlendirmeler."
  },
  {
    label: "Beşiktaş Liman Erişim Halkası",
    residentVotes: 1,
    courierVotes: 2,
    notes: "Kargo birağı zamanları etrafında daha fazla onay gerekiyor."
  },
  {
    label: "Nişantaşı Kapıcı Kuşağı",
    residentVotes: 2,
    courierVotes: 0,
    notes: "Sakin tanıklıkları güçlü; ancak kurye güzergahı seyrek."
  },
  {
    label: "Levent Kule Kavşağı",
    residentVotes: 1,
    courierVotes: 6,
    notes: "Kule servis rampalarını tekrar eden kuryeler sayesinde doğrulama ilerliyor."
  },
  {
    label: "Mecidiyeköy Servis Yolu",
    residentVotes: 0,
    courierVotes: 4,
    notes: "Kurye gözlemleri mevcut; henüz güvenilir sakin tanığı yok."
  },
  {
    label: "Usküdar Vapur Çıkışı",
    residentVotes: 2,
    courierVotes: 2,
    notes: "Vapur iskelesından ayrılan yaya ve bisikletli kuryeler için yeşil koridor."
  },
  {
    label: "Ataşehir Lojistik Cebi",
    residentVotes: 1,
    courierVotes: 1,
    notes: "Yeni eklenmiş heksagon; daha fazla geçiş verisi bekleniyor."
  }
];

const seedCell = latLngToCell(ISTANBUL_CENTER[1], ISTANBUL_CENTER[0], H3_RESOLUTION);

export const demoZones: HexZone[] = gridDisk(seedCell, 2)
  .slice(0, zoneProfiles.length)
  .map((h3Id, index) => {
    const profile = zoneProfiles[index];
    const verificationScore = profile.residentVotes * 6 + profile.courierVotes;
    const state: HexState =
      verificationScore < 3
        ? "dead"
        : verificationScore >= 10
          ? "verified"
          : "verifying";
    const [lat, lng] = cellToLatLng(h3Id);

    return {
      h3Id,
      label: profile.label,
      verificationScore,
      residentVotes: profile.residentVotes,
      courierVotes: profile.courierVotes,
      state,
      centroid: [lng, lat],
      ipfsHash: `bafybeigdemo${index.toString().padStart(2, "0")}prooflocationcid`,
      notes: profile.notes
    };
  });

export const demoCenter = ISTANBUL_CENTER;

