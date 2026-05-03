import { useState } from "react";

export interface SubmissionData {
  errorType: string;
  description: string;
  photo?: File;
}

interface SubmissionFormProps {
  onSubmit: (data: SubmissionData) => void;
  onCancel: () => void;
  busy: boolean;
}

export function SubmissionForm({ onSubmit, onCancel, busy }: SubmissionFormProps) {
  const [errorType, setErrorType] = useState("Giriş Kapısı Yanlış");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | undefined>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ errorType, description, photo: file });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4 bg-black/40 p-4 rounded-xl border border-white/10">
      <h3 className="text-lg font-medium text-white mb-2">Konum Hatası Bildir</h3>
      
      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase tracking-wider text-gray-400">Hata Tipi</label>
        <select 
          value={errorType} 
          onChange={e => setErrorType(e.target.value)}
          className="bg-geoverify-panel border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-geoverify-accent"
          disabled={busy}
        >
          <option value="Giriş Kapısı Yanlış">Giriş Kapısı Yanlış</option>
          <option value="Kapalı Yol/Sokak">Kapalı Yol/Sokak</option>
          <option value="Yanlış Bina Numarası">Yanlış Bina Numarası</option>
          <option value="Navigasyon Buradan Geçirmiyor">Navigasyon Buradan Geçirmiyor</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase tracking-wider text-gray-400">Detaylı Açıklama</label>
        <textarea 
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Kuryeler için not: Bina girişi arka sokaktaki otopark tarafındadır..."
          className="bg-geoverify-panel border border-white/10 rounded-lg p-3 text-sm text-white min-h-[100px] focus:outline-none focus:border-geoverify-accent resize-none"
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase tracking-wider text-gray-400">Fotoğraf Kanıtı (Opsiyonel)</label>
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/20 rounded-lg cursor-pointer bg-black/20 hover:bg-black/40 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <p className="text-xs text-gray-400">
                {file ? file.name : "Dosya seçin veya sürükleyip bırakın"}
              </p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <div className="flex gap-3 mt-2">
        <button 
          type="button" 
          onClick={onCancel}
          disabled={busy}
          className="flex-1 py-2.5 rounded-lg border border-white/10 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          İptal
        </button>
        <button 
          type="submit" 
          disabled={busy}
          className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-geoverify-accent to-[#4ac68f] text-black font-bold text-sm shadow-lg shadow-geoverify-accent/20 hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:transform-none"
        >
          {busy ? "İşleniyor..." : "Gönder"}
        </button>
      </div>
    </form>
  );
}
