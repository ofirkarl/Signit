/**
 * Signit מסמכים — שרת (Google Apps Script)
 * שומר מסמכים ב-Drive, מנהל קישורי חתימה, שולח מייל כשמסמך נחתם,
 * ומעביר בקשות לסוכן (Anthropic API) בלי לחשוף את המפתח.
 *
 * הפעלה ראשונה: להריץ את setup() מהעורך, לאשר הרשאות,
 * ואז Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */

const PROPS = PropertiesService.getScriptProperties();
const ROOT_NAME = 'Signit - מסמכים';
const MODEL = 'claude-sonnet-5-5';

/* ---------- הגדרה ---------- */
function setup() {
  let k = PROPS.getProperty('OWNER_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, ''); PROPS.setProperty('OWNER_KEY', k); }
  folders_();
  Logger.log('מפתח הבעלים שלך (להדביק באפליקציה): ' + k);
  return k;
}

/* ---------- נקודות כניסה ---------- */
function doGet() {
  return json_({ ok: true, app: 'Signit Docs' });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const fn = API[req.fn];
    if (!fn) throw new Error('פעולה לא מוכרת');
    out = { ok: true, result: fn.apply(null, req.args || []) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return json_(out);
}

const API = {
  ping: ping, getSettings: getSettings, saveSettings: saveSettings, setApiKey: setApiKey,
  createSend: createSend, getDoc: getDoc, submitSigned: submitSigned,
  saveSigned: saveSigned, listDocs: listDocs, getPdf: getPdf, ask: ask
};

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function checkKey_(k) {
  if (!k || k !== PROPS.getProperty('OWNER_KEY')) throw new Error('אין הרשאה');
}

/* ---------- תיקיות ונתונים ---------- */
function folders_() {
  let root;
  try { root = DriveApp.getFolderById(PROPS.getProperty('ROOT_ID')); } catch (err) { root = null; }
  if (!root) { root = DriveApp.createFolder(ROOT_NAME); PROPS.setProperty('ROOT_ID', root.getId()); }
  const sub = (prop, name) => {
    try { const id = PROPS.getProperty(prop); if (id) return DriveApp.getFolderById(id); } catch (err) {}
    const f = root.createFolder(name); PROPS.setProperty(prop, f.getId()); return f;
  };
  return { root: root, data: sub('DATA_ID', 'נתוני מערכת (לא לגעת)'), docs: sub('DOCS_ID', 'מסמכים') };
}
function readJson_(folder, name) {
  const it = folder.getFilesByName(name);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) : null;
}
function writeJson_(folder, name, obj) {
  const it = folder.getFilesByName(name), body = JSON.stringify(obj);
  if (it.hasNext()) it.next().setContent(body); else folder.createFile(name, body, 'application/json');
}
function safe_(v) { return String(v || 'מסמך').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 80); }
function pdfBlob_(b64, name) { return Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', safe_(name) + '.pdf'); }
function stamp_() { return Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd'); }
function loadRec_(id) {
  const f = folders_(), rec = readJson_(f.data, 'd_' + id + '.json');
  if (!rec) throw new Error('המסמך לא נמצא');
  return { f: f, rec: rec };
}
function newRec_(name, status) {
  const f = folders_();
  const rec = {
    id: Utilities.getUuid().slice(0, 8), token: Utilities.getUuid().replace(/-/g, ''),
    name: safe_(name), status: status, createdAt: new Date().toISOString()
  };
  rec.folderId = f.docs.createFolder(stamp_() + ' - ' + rec.name).getId();
  return { f: f, rec: rec };
}

/* ---------- בעלים ---------- */
function ping(k) {
  checkKey_(k);
  return { hasApiKey: !!PROPS.getProperty('ANTHROPIC_KEY'), email: Session.getEffectiveUser().getEmail() };
}
function getSettings(k) { checkKey_(k); return readJson_(folders_().data, 'settings.json') || {}; }
function saveSettings(k, s) {
  checkKey_(k);
  const f = folders_(), cur = readJson_(f.data, 'settings.json') || {};
  Object.keys(s || {}).forEach(key => { cur[key] = s[key]; });
  writeJson_(f.data, 'settings.json', cur);
  return true;
}
function setApiKey(k, key) {
  checkKey_(k);
  key = String(key || '').trim();
  if (key) PROPS.setProperty('ANTHROPIC_KEY', key); else PROPS.deleteProperty('ANTHROPIC_KEY');
  return !!key;
}

/** שליחה לחתימה: המסמך (עם השדות שלי כבר בפנים) + השדות של החותם */
function createSend(k, d) {
  checkKey_(k);
  const x = newRec_(d.name, 'pending');
  const folder = DriveApp.getFolderById(x.rec.folderId);
  x.rec.srcId = folder.createFile(pdfBlob_(d.pdf, 'לחתימה - ' + x.rec.name)).getId();
  x.rec.fields = d.fields || [];
  x.rec.note = String(d.note || '').slice(0, 500);
  x.rec.to = String(d.to || '').slice(0, 80);
  writeJson_(x.f.data, 'd_' + x.rec.id + '.json', x.rec);
  return { id: x.rec.id, token: x.rec.token };
}

/** מסמך שחתמתי עליו בעצמי, לשמירה ב-Drive */
function saveSigned(k, d) {
  checkKey_(k);
  const x = newRec_(d.name, 'self');
  const folder = DriveApp.getFolderById(x.rec.folderId);
  x.rec.signedId = folder.createFile(pdfBlob_(d.pdf, 'חתום - ' + x.rec.name)).getId();
  x.rec.signedAt = x.rec.createdAt;
  if (d.summary) x.rec.summary = d.summary;
  writeJson_(x.f.data, 'd_' + x.rec.id + '.json', x.rec);
  return { id: x.rec.id, folderUrl: folder.getUrl() };
}

function listDocs(k) {
  checkKey_(k);
  const out = [], it = folders_().data.getFiles();
  while (it.hasNext()) {
    const file = it.next(), n = file.getName();
    if (!/^d_.+\.json$/.test(n)) continue;
    try {
      const r = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
      out.push({ id: r.id, token: r.token, name: r.name, status: r.status, to: r.to || '', signer: r.signerName || '',
        createdAt: r.createdAt, signedAt: r.signedAt || '', folderUrl: 'https://drive.google.com/drive/folders/' + r.folderId });
    } catch (err) {}
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function getPdf(k, id) {
  checkKey_(k);
  const rec = loadRec_(id).rec, fid = rec.signedId || rec.srcId;
  return { name: rec.name, signed: !!rec.signedId, pdf: Utilities.base64Encode(DriveApp.getFileById(fid).getBlob().getBytes()) };
}

/* ---------- החותם (גישה לפי קישור) ---------- */
function getDoc(id, t) {
  const rec = loadRec_(id).rec;
  if (!t || t !== rec.token) throw new Error('הקישור לא תקין');
  if (rec.status === 'signed') return { name: rec.name, status: 'signed', signedAt: rec.signedAt };
  return { name: rec.name, status: rec.status, note: rec.note || '', fields: rec.fields || [],
    pdf: Utilities.base64Encode(DriveApp.getFileById(rec.srcId).getBlob().getBytes()) };
}

function submitSigned(id, t, d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const x = loadRec_(id), rec = x.rec;
    if (!t || t !== rec.token) throw new Error('הקישור לא תקין');
    if (rec.status === 'signed') throw new Error('המסמך כבר נחתם');
    const folder = DriveApp.getFolderById(rec.folderId);
    const blob = pdfBlob_(d.pdf, 'חתום - ' + rec.name);
    rec.signedId = folder.createFile(blob).getId();
    rec.status = 'signed';
    rec.signedAt = new Date().toISOString();
    rec.signerName = String(d.signer || '').slice(0, 80);
    writeJson_(x.f.data, 'd_' + rec.id + '.json', rec);
    try {
      MailApp.sendEmail({
        to: Session.getEffectiveUser().getEmail(),
        subject: 'נחתם: ' + rec.name + (rec.signerName ? ' (' + rec.signerName + ')' : ''),
        htmlBody: '<div dir="rtl">המסמך <b>' + rec.name + '</b> נחתם' + (rec.signerName ? ' על ידי ' + rec.signerName : '') +
          '.<br>העותק החתום מצורף, והוא שמור גם ב-Drive: <a href="' + folder.getUrl() + '">לתיקייה</a></div>',
        attachments: [blob]
      });
    } catch (err) {}
    return true;
  } finally { lock.releaseLock(); }
}

/* ---------- סוכן ---------- */
function ask(k, a) {
  checkKey_(k);
  const key = PROPS.getProperty('ANTHROPIC_KEY');
  if (!key) throw new Error('NO_API_KEY');
  const imgs = (a.images || []).slice(0, 10);
  const messages = (a.messages || []).map((m, i) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: i === 0 && imgs.length
      ? imgs.map(b => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } })).concat([{ type: 'text', text: m.content }])
      : String(m.content)
  }));
  // החשיבה של המודל נספרת בתוך max_tokens, לכן משאירים מקום גם לחשיבה וגם לתשובה
  const out = Math.min(Number(a.max_tokens) || 4000, 8000);
  const body = { model: MODEL, max_tokens: out + 8000, messages: messages, output_config: { effort: 'low' } };
  let r = callClaude_(key, body);
  if (r.code === 400 && /output_config|effort/i.test(r.msg)) { delete body.output_config; r = callClaude_(key, body); }
  if (r.code !== 200) throw new Error(r.msg || ('API ' + r.code));
  const text = (r.j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  if (!text) throw new Error('הסוכן לא החזיר טקסט (stop_reason: ' + r.j.stop_reason + '). נסו שוב.');
  return text;
}

function callClaude_(key, body) {
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body)
  });
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (err) {}
  return { code: res.getResponseCode(), j: j, msg: j.error && j.error.message };
}
