import * as dotenv from 'dotenv';
dotenv.config();

const now = new Date();
console.log(`Server now (ISO UTC):       ${now.toISOString()}`);
console.log(`Server local string:        ${now.toString()}`);
console.log(`Server TZ env:              ${process.env.TZ ?? '<unset>'}`);
console.log(`getHours() (local):         ${now.getHours()}`);
console.log(`getUTCHours():              ${now.getUTCHours()}`);
console.log(`getTimezoneOffset() (min):  ${now.getTimezoneOffset()}`);
console.log(
  `Tashkent (Asia/Tashkent):   ${now.toLocaleString('en-US', { timeZone: 'Asia/Tashkent' })}`,
);
