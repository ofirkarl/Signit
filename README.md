# Signit

- `/` — Signit מסמכים (פרטים למטה). כתובת: `https://ofirkarl.github.io/Signit/`
- `/car/` — Signit להסכמי רכב המצלמה: מעטפת להתקנה. כתובת: `https://ofirkarl.github.io/Signit/car/` (פעם ראשונה מדביקים את הקישור הפרטי שנגמר ב־`?k=`, ולהחלפה מוסיפים `#reset`).
- `/docs/` — כתובת ישנה, מעבירה ל־`/` (קישורי חתימה ישנים ממשיכים לעבוד).

שתי האפליקציות נפרדות לגמרי.

## Signit מסמכים

מילוי וחתימה על מסמכי PDF, שליחה לחתימה בקישור, ושמירה ב־Drive. כולל סוכן שמסכם תנאי עבודה.

- `docs/` — האפליקציה (PWA). כתובת: `https://ofirkarl.github.io/Signit/docs/`
- `apps-script/` — השרת (Google Apps Script): שומר ב־Drive, מנהל קישורי חתימה, שולח מייל כשמסמך נחתם, ומעביר בקשות לסוכן.

## הקמת השרת (פעם אחת)
1. script.google.com ← פרויקט חדש בשם "Signit מסמכים".
2. מדביקים את `Code.gs`. ב־Project Settings מסמנים "Show appsscript.json" ומדביקים את `appsscript.json`.
3. מריצים את `setup` ומאשרים הרשאות. ביומן (Execution log) מופיע **מפתח הבעלים**.
4. Deploy ← New deployment ← Web app. Execute as: Me. Who has access: Anyone. מעתיקים את כתובת ה־Web app (מסתיימת ב־`/exec`).
5. באפליקציה: "הפרטים שלי" ← חיבור לשרת ← מדביקים את הכתובת ואת המפתח.
6. לסוכן: יוצרים מפתח ב־console.anthropic.com ← API Keys, ומדביקים באפליקציה תחת "מפתח לסוכן". המפתח נשמר בשרת בלבד.

אחרי שינוי ב־`Code.gs`: Deploy ← Manage deployments ← עריכה ← New version (הכתובת נשארת אותה כתובת).

## התקנה בטלפון
פותחים את הכתובת ב־Chrome ← ⋮ ← "התקנת אפליקציה". אחרי ההתקנה האפליקציה מופיעה ברשימת השיתוף: בוואטסאפ לוחצים על קובץ PDF ← שיתוף ← Signit מסמכים.
