// Réduit une photo dans le NAVIGATEUR (≤ 2000 px, JPEG 85 %) avant l'envoi :
// les photos de téléphone dépassent souvent la limite de 4,5 Mo par requête de
// Vercel. Client uniquement (canvas). Repli : fichier d'origine si illisible
// (ex. HEIC sur un navigateur qui ne le décode pas) et assez léger.
export async function reduireImage(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * k);
    cv.height = Math.round(bmp.height * k);
    cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close();
    return await new Promise((ok, ko) => cv.toBlob((b) => (b ? ok(b) : ko(new Error("toBlob"))), "image/jpeg", 0.85));
  } catch (e) {
    if (f.size <= 4 * 1024 * 1024) return f;
    throw e;
  }
}
