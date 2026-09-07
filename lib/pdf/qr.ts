import QRCode from "qrcode";

/** PNG data URL, generated server-side before render. @react-pdf cannot mount DOM SVG. */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 0,
    width: 240,
    errorCorrectionLevel: "M",
  });
}
