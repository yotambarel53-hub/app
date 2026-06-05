# Marketplace App

A minimal TypeScript project scaffold.

## Scripts

- `npm install` - install dependencies
- `npm run build` - compile TypeScript to `dist`
- `npm start` - run the app directly with `ts-node`
- `npm run dev` - run the TypeScript compiler in watch mode

## Local marketplace server

אחרי `npm install`, פתח את הדפדפן בכתובת:

- `http://localhost:3000`

בחנות המקומית תוכל:

- להירשם ולקבל 100 מטבעות וירטואליות
- להתחבר עם שם משתמש וסיסמה
- להעלות מוצר למכירה
- לקנות מוצרים של משתמשים אחרים
- לצפות במטבעות שלך ובסטטוס המוצרים

## Structure

- `src/index.ts` - קוד השרת של חנות המקוונת
- `public/index.html` - דף ה־HTML של החנות
- `public/style.css` - עיצוב הטפסים והמוצרים
- `public/app.js` - לוגיקת הלקוחות וקריאות ה־API
- `tsconfig.json` - TypeScript compiler configuration
