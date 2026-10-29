import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FINAL_ACTIONS, SECRET_FIELDS, namesFinalAction, namesSecret } from "./screen-words.ts";

const SHIPPED = readdirSync(new URL("../../src/locales/", import.meta.url))
  .filter((file) => file.endsWith(".json") && file !== "source-hashes.json")
  .map((file) => file.slice(0, -".json".length))
  .sort();

describe("screen words", () => {
  it("cover every language the app ships", () => {
    expect(SHIPPED.length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(FINAL_ACTIONS).sort()).toEqual(SHIPPED);
    expect(Object.keys(SECRET_FIELDS).sort()).toEqual(SHIPPED);
  });

  it.each<[string, string[]]>([
    ["en", ["Send", "Send Message", "Delete Forever", "Buy now", "Pay", "Place your order", "Post", "Publish", "Submit", "Transfer", "Don’t Save", "Empty Trash", "Move to Trash", "paperplane.fill"]],
    ["de", ["Senden", "Löschen", "Jetzt kaufen", "Zahlungspflichtig bestellen", "Bezahlen", "Veröffentlichen", "Absenden", "Überweisen", "Nicht sichern"]],
    ["es", ["Enviar", "Eliminar", "Comprar ahora", "Pagar", "Realizar pedido", "Publicar", "Transferir", "No guardar"]],
    ["fr", ["Envoyer", "Supprimer", "Acheter", "Payer", "Passer la commande", "Publier", "Soumettre", "S’abonner", "Ne pas enregistrer"]],
    ["it", ["Invia", "Elimina", "Acquista", "Paga", "Effettua l’ordine", "Pubblica", "Bonifico", "Non salvare"]],
    ["pt-br", ["Enviar", "Excluir", "Apagar", "Comprar", "Pagar", "Fazer pedido", "Publicar", "Não Salvar"]],
    ["pl", ["Wyślij", "Usuń", "Kup teraz", "Zapłać", "Złóż zamówienie", "Opublikuj", "Przelej", "Nie zachowuj"]],
    ["ru", ["Отправить", "Удалить", "Купить", "Оплатить", "Оформить заказ", "Опубликовать", "Перевести", "Не сохранять"]],
    ["uk", ["Надіслати", "Видалити", "Купити", "Оплатити", "Оформити замовлення", "Опублікувати", "Переказати", "Не зберігати"]],
    ["tr", ["Gönder", "Sil", "SİL", "KALDIR", "Satın al", "Öde", "Sipariş ver", "Yayınla", "Kaydetme"]],
    ["vi", ["Gửi", "Xóa", "Xoá", "Mua ngay", "Thanh toán", "Đặt hàng", "Đăng", "Xác nhận", "Không lưu"]],
    ["hi", ["भेजें", "हटाएँ", "हटाएं", "खरीदें", "भुगतान करें", "ऑर्डर करें", "प्रकाशित करें", "सबमिट करें", "सहेजें नहीं"]],
    ["ja", ["送信", "削除", "購入する", "支払う", "注文を確定する", "投稿", "振込", "保存しない", "ゴミ箱を空にする"]],
    ["zh", ["发送", "删除", "立即购买", "支付", "提交订单", "发布", "转账", "不存储", "清倒废纸篓"]],
    ["zh-tw", ["傳送", "刪除", "購買", "付款", "下單", "發佈", "轉帳", "不要儲存", "清空垃圾桶"]],
  ])("name a final action in %s", (_, labels) => {
    for (const label of labels) expect(namesFinalAction(label), label).toBe(true);
  });

  it("leave everyday labels alone, in many languages", () => {
    for (const label of ["Inbox", "Sent", "Sender", "Deleted Items", "Drafts", "Open", "Save", "Cancel", "OK", "Settings", "PayPal", "Gesendet", "Speichern",
      "Envoyés", "Enregistrer", "Enviados", "Guardar", "Inviati", "Salva", "Wysłane", "Отправленные", "Сохранить", "Надіслані", "Gönderilenler", "Kaydet",
      "Lưu", "Đăng nhập", "सहेजें", "保存", "受信", "收件箱", "收件匣", "", undefined]) {
      expect(namesFinalAction(label), String(label)).toBe(false);
    }
  });

  it("know a secret field in each language", () => {
    for (const label of ["Password", "Enter your PIN", "One‑time code", "Passwort", "Contraseña", "Mot de passe", "Codice PIN", "Senha", "Hasło", "Пароль", "Пін-код",
      "Şifre", "Mật khẩu", "पासवर्ड", "パスワード", "暗証番号", "密码", "验证码", "密碼"]) {
      expect(namesSecret(label), label).toBe(true);
    }
    for (const label of ["Username", "Email", "Search", "Pinned", "Shopping list", "Benutzername", "Имя пользователя", "Notes", ""]) {
      expect(namesSecret(label), label).toBe(false);
    }
  });

  it("read labels in any case, Unicode form or spacing", () => {
    for (const label of ["DELETE", "  send  ", "ｓｅｎｄ", "Delete…", "Send—now"]) expect(namesFinalAction(label), label).toBe(true);
  });
});
