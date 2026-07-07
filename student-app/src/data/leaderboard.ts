/** Shared DUMMY leaderboard data (used by the home card + the /leaderboard screen). */

export type LeaderPlayer = { name: string; xp: number; avatar?: string; me?: boolean };

/** Dummy avatar (picsum: id/<id>/<w>/<h>). */
export const pic = (id: number) => `https://picsum.photos/id/${id}/100/100`;

/** 1st gold · 2nd silver · 3rd bronze. */
export const MEDAL = ['#F5B301', '#B8C0CC', '#D08B4E'];

export const ME_XP = 208;
export const ME_RANK = 2; // 1-based — "me" sits 2nd

/** Other players in descending-XP (rank) order; "me" is spliced in at ME_RANK. */
export const OTHERS: LeaderPlayer[] = [
  { name: 'Sevinch Tanieva', xp: 342, avatar: pic(1027) },
  { name: 'Doston Alimov', xp: 176, avatar: pic(1005) },
  { name: 'Kamola Yusupova', xp: 154, avatar: pic(64) },
  { name: 'Jasur Karimov', xp: 132, avatar: pic(91) },
  { name: 'Malika Tosheva', xp: 118, avatar: pic(177) },
  { name: 'Bekzod Rasulov', xp: 97, avatar: pic(1011) },
  { name: 'Nigora Saidova', xp: 85, avatar: pic(338) },
  { name: 'Aziz Rahimov', xp: 73, avatar: pic(433) },
  { name: 'Dilnoza Umarova', xp: 61, avatar: pic(1012) },
];

export function inits(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Full ranked list with "me" inserted at ME_RANK. */
export function buildLeaderboard(me: { name: string; avatar?: string }): LeaderPlayer[] {
  const list = [...OTHERS];
  list.splice(ME_RANK - 1, 0, { ...me, me: true, xp: ME_XP });
  return list;
}
