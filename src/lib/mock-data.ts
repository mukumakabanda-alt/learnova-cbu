export type Material = {
  id: string;
  title: string;
  type: "Notes" | "Past Paper" | "Slides" | "Summary" | "Assignment" | "Outline";
  year: number; // academic year of study
  pages?: number;
  updated: string;
};

export type Course = {
  code: string;
  title: string;
  programme: string;
  programmeCode: string;
  year: number;
  semester: 1 | 2;
  lecturer?: string;
  description: string;
  topics: string[];
  materials: Material[];
};

export type Programme = {
  code: string;
  name: string;
  school: string;
  years: number;
  courses: number;
  accent: "gold" | "copper" | "teal";
};

export const programmes: Programme[] = [
  { code: "BSC-CS", name: "BSc Computer Science", school: "School of Mathematics & Natural Sciences", years: 5, courses: 42, accent: "teal" },
  { code: "BENG-EE", name: "BEng Electrical Engineering", school: "School of Engineering", years: 5, courses: 48, accent: "copper" },
  { code: "BBA", name: "Bachelor of Business Administration", school: "School of Business", years: 4, courses: 36, accent: "gold" },
  { code: "BSC-MIN", name: "BSc Mining Engineering", school: "School of Mines & Mineral Sciences", years: 5, courses: 44, accent: "copper" },
  { code: "BA-ED", name: "BA Education", school: "School of Mathematics & Natural Sciences", years: 4, courses: 32, accent: "gold" },
  { code: "BSC-AR", name: "BSc Architecture", school: "School of Built Environment", years: 5, courses: 38, accent: "teal" },
  { code: "BSC-ACC", name: "BSc Accountancy", school: "School of Business", years: 4, courses: 34, accent: "gold" },
  { code: "BSC-NR", name: "BSc Natural Resources", school: "School of Natural Resources", years: 4, courses: 30, accent: "teal" },
];

export const courses: Course[] = [
  {
    code: "CS 210",
    title: "Data Structures & Algorithms",
    programme: "BSc Computer Science",
    programmeCode: "BSC-CS",
    year: 2, semester: 1,
    lecturer: "Dr. M. Chanda",
    description: "Foundational data structures, algorithm analysis, and problem-solving techniques used across systems and software engineering.",
    topics: ["Arrays & Linked Lists", "Trees & Graphs", "Sorting", "Hashing", "Dynamic Programming", "Complexity Analysis"],
    materials: [
      { id: "m1", title: "Complete Course Notes 2025", type: "Notes", year: 2, pages: 184, updated: "3 days ago" },
      { id: "m2", title: "Past Paper — 2024 Final", type: "Past Paper", year: 2, pages: 12, updated: "1 week ago" },
      { id: "m3", title: "Trees & Graphs — Slides", type: "Slides", year: 2, pages: 48, updated: "2 weeks ago" },
      { id: "m4", title: "Revision Summary Pack", type: "Summary", year: 2, pages: 28, updated: "5 days ago" },
      { id: "m5", title: "Assignment 2 Brief", type: "Assignment", year: 2, pages: 4, updated: "yesterday" },
    ],
  },
  {
    code: "EE 340",
    title: "Power Systems Analysis",
    programme: "BEng Electrical Engineering",
    programmeCode: "BENG-EE",
    year: 3, semester: 2,
    lecturer: "Prof. J. Mwansa",
    description: "Analysis and design of modern electrical power systems, including load flow, fault studies, and stability.",
    topics: ["Load Flow", "Fault Analysis", "Stability", "Transmission Lines", "Per-Unit System"],
    materials: [
      { id: "m1", title: "Lecture Notes — Full Semester", type: "Notes", year: 3, pages: 156, updated: "1 day ago" },
      { id: "m2", title: "Past Papers 2020–2024", type: "Past Paper", year: 3, pages: 62, updated: "4 days ago" },
      { id: "m3", title: "Load Flow Worked Examples", type: "Summary", year: 3, pages: 22, updated: "1 week ago" },
    ],
  },
  {
    code: "BBA 220",
    title: "Financial Accounting II",
    programme: "Bachelor of Business Administration",
    programmeCode: "BBA",
    year: 2, semester: 1,
    lecturer: "Mrs. C. Phiri",
    description: "Advanced financial reporting standards, consolidated statements, and interpretation of accounts.",
    topics: ["IFRS", "Consolidation", "Cash Flow Statements", "Ratio Analysis"],
    materials: [
      { id: "m1", title: "IFRS Study Notes", type: "Notes", year: 2, pages: 98, updated: "2 days ago" },
      { id: "m2", title: "Past Paper 2024", type: "Past Paper", year: 2, pages: 8, updated: "6 days ago" },
      { id: "m3", title: "Consolidation Cheat Sheet", type: "Summary", year: 2, pages: 6, updated: "3 days ago" },
    ],
  },
  {
    code: "MIN 410",
    title: "Rock Mechanics",
    programme: "BSc Mining Engineering",
    programmeCode: "BSC-MIN",
    year: 4, semester: 1,
    lecturer: "Dr. K. Banda",
    description: "Behaviour of rock masses under stress, applied to underground and open-pit mining.",
    topics: ["Stress & Strain", "Rock Failure Criteria", "Slope Stability", "Support Design"],
    materials: [
      { id: "m1", title: "Complete Notes 2025", type: "Notes", year: 4, pages: 142, updated: "1 week ago" },
      { id: "m2", title: "Past Paper — 2023", type: "Past Paper", year: 4, pages: 10, updated: "2 weeks ago" },
    ],
  },
  {
    code: "CS 110",
    title: "Introduction to Programming",
    programme: "BSc Computer Science",
    programmeCode: "BSC-CS",
    year: 1, semester: 1,
    lecturer: "Mr. T. Zulu",
    description: "First programming course covering Python fundamentals, control flow, functions, and problem decomposition.",
    topics: ["Python Basics", "Control Flow", "Functions", "Lists & Dicts", "Files"],
    materials: [
      { id: "m1", title: "Python Notes — Beginner", type: "Notes", year: 1, pages: 88, updated: "4 days ago" },
      { id: "m2", title: "Lab Exercises Pack", type: "Assignment", year: 1, pages: 20, updated: "yesterday" },
      { id: "m3", title: "Past Papers 2022–2024", type: "Past Paper", year: 1, pages: 34, updated: "1 week ago" },
    ],
  },
  {
    code: "AR 320",
    title: "Structural Design Studio",
    programme: "BSc Architecture",
    programmeCode: "BSC-AR",
    year: 3, semester: 2,
    lecturer: "Ar. L. Musonda",
    description: "Integrated studio combining structural principles with architectural design decisions.",
    topics: ["Load Paths", "Materials", "Detailing", "Sustainability"],
    materials: [
      { id: "m1", title: "Studio Brief 2025", type: "Outline", year: 3, pages: 12, updated: "5 days ago" },
      { id: "m2", title: "Reference Portfolio", type: "Slides", year: 3, pages: 60, updated: "2 weeks ago" },
    ],
  },
];

export const findCourse = (code: string) =>
  courses.find((c) => c.code.toLowerCase().replace(/\s+/g, "-") === code.toLowerCase());

export const courseSlug = (c: Course) => c.code.toLowerCase().replace(/\s+/g, "-");

export const materialTypeMeta: Record<Material["type"], { label: string; hint: string }> = {
  Notes: { label: "Notes", hint: "Full course notes" },
  "Past Paper": { label: "Past Paper", hint: "Exam preparation" },
  Slides: { label: "Slides", hint: "Lecture decks" },
  Summary: { label: "Summary", hint: "Revision-ready" },
  Assignment: { label: "Assignment", hint: "Coursework brief" },
  Outline: { label: "Outline", hint: "Course structure" },
};
