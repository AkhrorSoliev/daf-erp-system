export interface Student {
  id: string; // 6-digit string
  firstName: string;
  lastName: string;
  phone: string;
  extraPhone?: string;
  registeredAt: string; // ISO date
  telegramId?: string;
  teacher: string;
  lessonDate: string; // ISO date

  /**
   * This actually comes from another table.
   * Should be calculated by filtering via studentId
   */
  balance: number;

  /**
   * This actually comes from another table.
   * Should be fetched by studentId
   */
  userComments: StudentComment[];

  /**
   * SMS history (can be moved to separate table later)
   */
  smsHistory: SmsHistoryItem[];

  /**
   * Groups the student belongs to
   */
  groups: { level: string }[];

  avatar: string;

  /**
   * Student status
   */
  status: "ungrouped" | "active" | "frozen";

  gender?: "male" | "female";
  telegram?: string;
  parentPhone?: string;
  parentName?: string;
  placeOfStudy?: string;
  address?: string;
  passportSeries?: string;
  login?: string;
  password?: string;

  /**
   * Future-proof audit info
   * (who added, when added, etc.)
   */
  createdBy?: { by: string; at: string };
}

export interface StudentComment {
  id: string;
  message: string;
  createdAt: string;
  createdBy: string;
}

export interface SmsHistoryItem {
  id: string;
  message: string;
  sentAt: string;
}

export const students: Student[] = [
  {
    id: "102394",
    firstName: "Ali",
    lastName: "Valiyev",
    phone: "+998901234567",
    extraPhone: "+998931112233",
    registeredAt: "2025-01-12T10:00:00Z",
    telegramId: "@ali_dev",
    teacher: "Hans Müller",
    lessonDate: "2025-04-01T09:00:00Z",
    balance: 150000,
    avatar: "https://picsum.photos/200?random=1",
    groups: [{ level: "A1" }, { level: "A2" }],
    userComments: [
      {
        id: "c1",
        message: "Student is active and punctual",
        createdAt: "2025-01-15T12:00:00Z",
        createdBy: "admin",
      },
      {
        id: "c2",
        message: "Good progress in German grammar",
        createdAt: "2025-01-20T14:00:00Z",
        createdBy: "teacher",
      },
    ],
    smsHistory: [
      {
        id: "s1",
        message: "Welcome to course!",
        sentAt: "2025-01-12T10:05:00Z",
      },
    ],
    status: "active",
    gender: "male",
    telegram: "@ali_dev",
    parentPhone: "+998901112200",
    parentName: "Karim Valiyev",
    placeOfStudy: "Toshkent Axborot Texnologiyalari Universiteti",
    address: "Toshkent sh., Chilonzor tumani, 7-mavze",
    passportSeries: "AB1234567",
    login: "ali_valiyev",
    password: "student123",
    createdBy: { by: "admin", at: "2025-01-12T10:00:00Z" },
  },
  {
    id: "847362",
    firstName: "Sardor",
    lastName: "Rahimov",
    phone: "+998911112233",
    registeredAt: "2025-02-01T09:30:00Z",
    telegramId: "@dev_sardor",
    teacher: "Klara Schmidt",
    lessonDate: "2025-04-02T11:00:00Z",
    balance: -50000,
    avatar: "https://picsum.photos/200?random=2",
    groups: [{ level: "B1" }],
    userComments: [
      {
        id: "c3",
        message: "Needs more practice in speaking",
        createdAt: "2025-02-05T10:00:00Z",
        createdBy: "teacher",
      },
    ],
    smsHistory: [],
    status: "active",
    gender: "male",
    telegram: "@dev_sardor",
    login: "sardor_rahimov",
    password: "sardor2025",
    createdBy: { by: "manager", at: "2025-02-01T09:30:00Z" },
  },
  {
    id: "556721",
    firstName: "Madina",
    lastName: "Karimova",
    phone: "+998935556677",
    extraPhone: "+998907778899",
    registeredAt: "2025-02-10T14:20:00Z",
    teacher: "Hans Müller",
    lessonDate: "2025-04-03T14:00:00Z",
    balance: 75000,
    avatar: "https://picsum.photos/200?random=3",
    groups: [{ level: "A2" }],
    userComments: [],
    smsHistory: [],
    status: "frozen",
    gender: "female",
    parentPhone: "+998935001122",
    parentName: "Anvar Karimov",
    placeOfStudy: "65-maktab",
    createdBy: { by: "admin", at: "2025-02-10T14:20:00Z" },
  },
  {
    id: "663920",
    firstName: "Jasur",
    lastName: "Toshmatov",
    phone: "+998901998877",
    registeredAt: "2025-03-01T11:15:00Z",
    telegramId: "@frontend_master",
    teacher: "Anna Weber",
    lessonDate: "2025-04-04T10:00:00Z",
    balance: -25000,
    avatar: "https://picsum.photos/200?random=4",
    groups: [{ level: "B2" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    gender: "male",
    telegram: "@frontend_master",
    address: "Toshkent sh., Yunusobod tumani, 4-mavze",
    passportSeries: "AC9876543",
    login: "jasur_toshmatov",
    password: "jasur777",
    createdBy: { by: "teacher", at: "2025-03-01T11:15:00Z" },
  },
  {
    id: "778201",
    firstName: "Nilufar",
    lastName: "Abdullayeva",
    phone: "+998933334455",
    registeredAt: "2025-03-05T08:45:00Z",
    teacher: "Klara Schmidt",
    lessonDate: "2025-04-05T15:00:00Z",
    balance: 300000,
    avatar: "https://picsum.photos/200?random=5",
    groups: [{ level: "C1" }],
    userComments: [],
    smsHistory: [],
    status: "ungrouped",
    createdBy: { by: "admin", at: "2025-03-05T08:45:00Z" },
  },
  {
    id: "990112",
    firstName: "Bekzod",
    lastName: "Mirzayev",
    phone: "+998945551122",
    extraPhone: "+998907001122",
    registeredAt: "2025-01-25T16:00:00Z",
    teacher: "Hans Müller",
    lessonDate: "2025-04-01T11:00:00Z",
    balance: -100000,
    avatar: "https://picsum.photos/200?random=6",
    groups: [{ level: "A1" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "manager", at: "2025-01-25T16:00:00Z" },
  },
  {
    id: "331245",
    firstName: "Shaxzod",
    lastName: "Usmonov",
    phone: "+998977889900",
    registeredAt: "2025-02-18T13:10:00Z",
    telegramId: "@node_guru",
    teacher: "Anna Weber",
    lessonDate: "2025-04-02T09:00:00Z",
    balance: 50000,
    avatar: "https://picsum.photos/200?random=7",
    groups: [{ level: "B1" }],
    userComments: [],
    smsHistory: [],
    status: "frozen",
    createdBy: { by: "teacher", at: "2025-02-18T13:10:00Z" },
  },
  {
    id: "112908",
    firstName: "Dildora",
    lastName: "Nazarova",
    phone: "+998909876543",
    registeredAt: "2025-03-10T17:25:00Z",
    teacher: "Klara Schmidt",
    lessonDate: "2025-04-03T10:00:00Z",
    balance: -75000,
    avatar: "https://picsum.photos/200?random=8",
    groups: [{ level: "C1" }],
    userComments: [
      {
        id: "c4",
        message: "Excellent vocabulary knowledge",
        createdAt: "2025-03-12T09:00:00Z",
        createdBy: "teacher",
      },
    ],
    smsHistory: [],
    status: "active",
    createdBy: { by: "admin", at: "2025-03-10T17:25:00Z" },
  },
  {
    id: "445566",
    firstName: "Azizbek",
    lastName: "Xolmatov",
    phone: "+998933221144",
    registeredAt: "2025-03-12T10:50:00Z",
    telegramId: "@ux_designer",
    teacher: "Hans Müller",
    lessonDate: "2025-04-04T14:00:00Z",
    balance: 200000,
    avatar: "https://picsum.photos/200?random=9",
    groups: [{ level: "A2" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "manager", at: "2025-03-12T10:50:00Z" },
  },
  {
    id: "778899",
    firstName: "Kamola",
    lastName: "Saidova",
    phone: "+998912345678",
    registeredAt: "2025-03-15T09:00:00Z",
    teacher: "Anna Weber",
    lessonDate: "2025-04-05T11:00:00Z",
    balance: -150000,
    avatar: "https://picsum.photos/200?random=10",
    groups: [{ level: "B2" }],
    userComments: [],
    smsHistory: [],
    status: "frozen",
    createdBy: { by: "admin", at: "2025-03-15T09:00:00Z" },
  },
  {
    id: "203847",
    firstName: "Otabek",
    lastName: "Qodirov",
    phone: "+998901122334",
    registeredAt: "2025-01-20T08:00:00Z",
    telegramId: "@otabek_q",
    teacher: "Klara Schmidt",
    lessonDate: "2025-04-01T14:00:00Z",
    balance: 420000,
    avatar: "https://picsum.photos/200?random=11",
    groups: [{ level: "A1" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "admin", at: "2025-01-20T08:00:00Z" },
  },
  {
    id: "394021",
    firstName: "Zulfiya",
    lastName: "Ergasheva",
    phone: "+998935544332",
    extraPhone: "+998901239988",
    registeredAt: "2025-02-05T12:30:00Z",
    teacher: "Hans Müller",
    lessonDate: "2025-04-02T15:00:00Z",
    balance: -30000,
    avatar: "https://picsum.photos/200?random=12",
    groups: [{ level: "B1" }, { level: "B2" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "teacher", at: "2025-02-05T12:30:00Z" },
  },
  {
    id: "501738",
    firstName: "Humoyun",
    lastName: "Alimov",
    phone: "+998947766554",
    registeredAt: "2025-02-22T09:15:00Z",
    teacher: "Anna Weber",
    lessonDate: "2025-04-03T09:00:00Z",
    balance: 180000,
    avatar: "https://picsum.photos/200?random=13",
    groups: [{ level: "A2" }],
    userComments: [],
    smsHistory: [],
    status: "ungrouped",
    createdBy: { by: "manager", at: "2025-02-22T09:15:00Z" },
  },
  {
    id: "619284",
    firstName: "Sevinch",
    lastName: "Tursunova",
    phone: "+998911234567",
    registeredAt: "2025-03-08T16:40:00Z",
    telegramId: "@sevinch_t",
    teacher: "Klara Schmidt",
    lessonDate: "2025-04-04T11:00:00Z",
    balance: -200000,
    avatar: "https://picsum.photos/200?random=14",
    groups: [{ level: "C1" }],
    userComments: [],
    smsHistory: [],
    status: "frozen",
    createdBy: { by: "admin", at: "2025-03-08T16:40:00Z" },
  },
  {
    id: "728394",
    firstName: "Farrux",
    lastName: "Botirov",
    phone: "+998909988776",
    extraPhone: "+998937654321",
    registeredAt: "2025-01-30T10:20:00Z",
    teacher: "Hans Müller",
    lessonDate: "2025-04-05T09:00:00Z",
    balance: 95000,
    avatar: "https://picsum.photos/200?random=15",
    groups: [{ level: "B2" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "teacher", at: "2025-01-30T10:20:00Z" },
  },
  {
    id: "837261",
    firstName: "Gulnora",
    lastName: "Mahmudova",
    phone: "+998933456789",
    registeredAt: "2025-03-18T13:00:00Z",
    teacher: "Anna Weber",
    lessonDate: "2025-04-01T15:00:00Z",
    balance: -60000,
    avatar: "https://picsum.photos/200?random=16",
    groups: [{ level: "A1" }, { level: "A2" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "manager", at: "2025-03-18T13:00:00Z" },
  },
  {
    id: "946102",
    firstName: "Islom",
    lastName: "Haydarov",
    phone: "+998945678901",
    registeredAt: "2025-02-14T11:45:00Z",
    telegramId: "@islom_h",
    teacher: "Klara Schmidt",
    lessonDate: "2025-04-02T14:00:00Z",
    balance: 350000,
    avatar: "https://picsum.photos/200?random=17",
    groups: [{ level: "B1" }],
    userComments: [],
    smsHistory: [],
    status: "ungrouped",
    createdBy: { by: "admin", at: "2025-02-14T11:45:00Z" },
  },
  {
    id: "105573",
    firstName: "Mohira",
    lastName: "Rustamova",
    phone: "+998977654321",
    registeredAt: "2025-03-20T07:30:00Z",
    teacher: "Hans Müller",
    lessonDate: "2025-04-03T11:00:00Z",
    balance: -120000,
    avatar: "https://picsum.photos/200?random=18",
    groups: [{ level: "A2" }],
    userComments: [],
    smsHistory: [],
    status: "frozen",
    createdBy: { by: "teacher", at: "2025-03-20T07:30:00Z" },
  },
  {
    id: "284619",
    firstName: "Jamshid",
    lastName: "Normatov",
    phone: "+998901357924",
    extraPhone: "+998939876543",
    registeredAt: "2025-01-18T14:55:00Z",
    telegramId: "@jamshid_n",
    teacher: "Anna Weber",
    lessonDate: "2025-04-04T09:00:00Z",
    balance: 500000,
    avatar: "https://picsum.photos/200?random=19",
    groups: [{ level: "C1" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "admin", at: "2025-01-18T14:55:00Z" },
  },
  {
    id: "372910",
    firstName: "Laylo",
    lastName: "Jumayeva",
    phone: "+998912468013",
    registeredAt: "2025-03-25T10:10:00Z",
    teacher: "Klara Schmidt",
    lessonDate: "2025-04-05T14:00:00Z",
    balance: -10000,
    avatar: "https://picsum.photos/200?random=20",
    groups: [{ level: "B2" }],
    userComments: [],
    smsHistory: [],
    status: "active",
    createdBy: { by: "manager", at: "2025-03-25T10:10:00Z" },
  },
];
