// ══════════════════════════════════════════════════════════════
//  ThunderStudy Flashcard Preset Database
//  HOW TO ADD A NEW TOPIC:
//  1. Find the right category (or add a new one at the bottom)
//  2. Add an object to its `topics` array:
//     {
//       title: "Topic Name",          // shown on the card
//       desc:  "Short description",   // 1 line shown below title
//       cards: 10,                    // number of cards in the deck
//       file:  "decks/filename.html"  // path to the pre-made HTML file
//     }
//  3. Save. Done. No other file needs to change.
// ══════════════════════════════════════════════════════════════

const PRESET_DB = [
  {
    id: "cuet",
    label: "CUET",
    color: "#6699FB",       // accent for this section header
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
    topics: [
      { title: "Business Studies Ch 1", desc: "Nature & Significance of Management", cards: 15, file: "decks/cuet-bs-ch1.html" },
      { title: "Business Studies Ch 2", desc: "Principles of Management", cards: 15, file: "decks/cuet-bs-ch2.html" },
      { title: "Accountancy — Partnership", desc: "Fundamentals of Partnership Firms", cards: 12, file: "decks/cuet-acc-partnership.html" },
      { title: "Economics — Micro", desc: "Demand, Supply & Market Equilibrium", cards: 15, file: "decks/cuet-eco-micro.html" },
      { title: "English — Reading", desc: "Comprehension & Vocabulary", cards: 10, file: "decks/cuet-eng-reading.html" },
    ]
  },
  {
    id: "cbse12",
    label: "Class 12 CBSE",
    color: "#22c55e",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    topics: [
      { title: "Physics — Electrostatics", desc: "Coulomb's Law, Field & Potential", cards: 15, file: "decks/cbse12-phy-electrostatics.html" },
      { title: "Physics — Current Electricity", desc: "Ohm's Law, Cells, Kirchhoff's Laws", cards: 12, file: "decks/cbse12-phy-current.html" },
      { title: "Chemistry — Solutions", desc: "Concentration, Colligative Properties", cards: 12, file: "decks/cbse12-chem-solutions.html" },
      { title: "Chemistry — Electrochemistry", desc: "Galvanic Cells, EMF, Electrolysis", cards: 10, file: "decks/cbse12-chem-electro.html" },
      { title: "Maths — Integration", desc: "Methods, Standard Integrals, Areas", cards: 15, file: "decks/cbse12-math-integration.html" },
      { title: "Biology — Reproduction", desc: "Sexual & Asexual, Human Reproduction", cards: 12, file: "decks/cbse12-bio-reproduction.html" },
    ]
  },
  {
    id: "neet",
    label: "NEET",
    color: "#f59e0b",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    topics: [
      { title: "Biology — Cell Biology", desc: "Cell Structure, Division, Transport", cards: 20, file: "decks/neet-bio-cell.html" },
      { title: "Biology — Genetics", desc: "Mendelian Genetics, Chromosomes, DNA", cards: 20, file: "decks/neet-bio-genetics.html" },
      { title: "Biology — Plant Physiology", desc: "Photosynthesis, Respiration, Transport", cards: 15, file: "decks/neet-bio-plant.html" },
      { title: "Chemistry — Organic Basics", desc: "IUPAC, Isomerism, Reactions", cards: 15, file: "decks/neet-chem-organic.html" },
      { title: "Physics — Laws of Motion", desc: "Newton's Laws, Friction, Circular Motion", cards: 12, file: "decks/neet-phy-motion.html" },
    ]
  },
  {
    id: "jee",
    label: "JEE",
    color: "#8b5cf6",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    topics: [
      { title: "Physics — Mechanics", desc: "Kinematics, Dynamics, Work & Energy", cards: 20, file: "decks/jee-phy-mechanics.html" },
      { title: "Physics — Waves & SHM", desc: "Wave Properties, Sound, Oscillations", cards: 15, file: "decks/jee-phy-waves.html" },
      { title: "Maths — Coordinate Geometry", desc: "Straight Lines, Circles, Conics", cards: 15, file: "decks/jee-math-coord.html" },
      { title: "Maths — Calculus", desc: "Limits, Derivatives, Integration", cards: 20, file: "decks/jee-math-calculus.html" },
      { title: "Chemistry — Chemical Bonding", desc: "Lewis Structure, VSEPR, Hybridisation", cards: 15, file: "decks/jee-chem-bonding.html" },
      { title: "Chemistry — Thermodynamics", desc: "Laws, Enthalpy, Entropy, Gibbs Free Energy", cards: 12, file: "decks/jee-chem-thermo.html" },
    ]
  },
  {
    id: "ssc",
    label: "SSC",
    color: "#ec4899",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`,
    topics: [
      { title: "General Awareness — History", desc: "Ancient, Medieval & Modern India", cards: 20, file: "decks/ssc-ga-history.html" },
      { title: "General Awareness — Polity", desc: "Constitution, Parliament, Judiciary", cards: 15, file: "decks/ssc-ga-polity.html" },
      { title: "General Awareness — Geography", desc: "Physical, Economic & World Geography", cards: 15, file: "decks/ssc-ga-geo.html" },
      { title: "Quantitative Aptitude", desc: "Percentage, Ratio, Time & Work, DI", cards: 15, file: "decks/ssc-quant.html" },
      { title: "English — Grammar", desc: "Tenses, Voice, Narration, Error Spotting", cards: 12, file: "decks/ssc-eng-grammar.html" },
      { title: "Reasoning — Non-Verbal", desc: "Series, Analogy, Classification, Matrices", cards: 12, file: "decks/ssc-reasoning.html" },
    ]
  },
  {
    id: "banking",
    label: "Banking",
    color: "#14b8a6",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    topics: [
      { title: "Banking Awareness", desc: "RBI, Types of Banks, Credit Policy", cards: 20, file: "decks/bank-awareness.html" },
      { title: "Current Affairs — Finance", desc: "Budget, GST, Economic Survey Key Points", cards: 15, file: "decks/bank-finance-ca.html" },
      { title: "Quantitative Aptitude", desc: "SI, CI, Profit/Loss, Averages, Mixtures", cards: 15, file: "decks/bank-quant.html" },
      { title: "English — Vocabulary", desc: "Synonyms, Antonyms, Fill in the Blanks", cards: 15, file: "decks/bank-eng-vocab.html" },
      { title: "Computer Awareness", desc: "Basics, MS Office, Networking, Security", cards: 12, file: "decks/bank-computer.html" },
    ]
  },
  {
    id: "nta",
    label: "NTA / UGC NET",
    color: "#f97316",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    topics: [
      { title: "Paper 1 — Teaching Aptitude", desc: "Teaching Methods, Classroom Management", cards: 15, file: "decks/nta-paper1-teaching.html" },
      { title: "Paper 1 — Research Methods", desc: "Types, Tools, Hypothesis, Ethics", cards: 12, file: "decks/nta-paper1-research.html" },
      { title: "Paper 1 — Communication", desc: "Types, Barriers, Mass Media", cards: 10, file: "decks/nta-paper1-comm.html" },
      { title: "Paper 1 — ICT", desc: "Computer Basics, Internet, e-Learning", cards: 10, file: "decks/nta-paper1-ict.html" },
      { title: "Commerce — Management", desc: "Principles, Functions, HRM, Marketing", cards: 20, file: "decks/nta-commerce-mgmt.html" },
    ]
  },
];

// Export for use in index.html
// (No ES module syntax needed — loaded via <script src="db.js"> as a global)
