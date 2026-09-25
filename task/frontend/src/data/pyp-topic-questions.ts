/**
 * Client-side CBSE/NCERT practice MCQs keyed by topic name.
 * These supplement PYP video solutions with interactive practice.
 * Source: standard CBSE board syllabus — not AI-generated.
 *
 * Migration path: eventually move to backend via
 *   GET /v1/content/practice-questions?topic={name}
 * and remove this file.
 */

export interface QuizQ {
  id: string;
  text: string;
  options: string[];
  correct: number; // 0-indexed
  explanation: string;
}

export const TOPIC_QUESTIONS: Record<string, QuizQ[]> = {
  Electricity: [
    { id: "el1", text: "What is the SI unit of electric current?", options: ["Volt", "Ampere", "Ohm", "Watt"], correct: 1, explanation: "Ampere (A) is the SI unit of electric current as defined by the SI system." },
    { id: "el2", text: "Ohm's Law is expressed as:", options: ["V = IR", "I = VR", "R = VI", "P = IV²"], correct: 0, explanation: "Ohm's Law states V = IR where V is voltage, I is current, and R is resistance." },
    { id: "el3", text: "When resistors are connected in series, the total resistance is:", options: ["Less than the smallest", "Sum of all resistances", "Product of resistances", "Equal to the largest"], correct: 1, explanation: "In series, R_total = R₁ + R₂ + R₃ + ... (sum of all individual resistances)." },
    { id: "el4", text: "Which device is used to measure potential difference?", options: ["Ammeter", "Galvanometer", "Voltmeter", "Rheostat"], correct: 2, explanation: "A Voltmeter measures potential difference (voltage) and is connected in parallel." },
  ],
  Magnetism: [
    { id: "mg1", text: "Magnetic field lines always run from:", options: ["South to North outside magnet", "North to South outside magnet", "North to North", "South to South"], correct: 1, explanation: "Outside the magnet, field lines go from North pole to South pole." },
    { id: "mg2", text: "Which rule gives the direction of force on a current-carrying conductor in a magnetic field?", options: ["Ampere's rule", "Fleming's Left Hand Rule", "Lenz's Law", "Faraday's Rule"], correct: 1, explanation: "Fleming's Left Hand Rule: thumb = force, index = field, middle = current direction." },
    { id: "mg3", text: "Electromagnetic induction was discovered by:", options: ["Volta", "Oersted", "Faraday", "Maxwell"], correct: 2, explanation: "Michael Faraday discovered electromagnetic induction in 1831." },
  ],
  Light: [
    { id: "lt1", text: "The angle of incidence equals the angle of reflection. This is:", options: ["Snell's Law", "Law of Reflection", "Law of Refraction", "Total Internal Reflection"], correct: 1, explanation: "The Law of Reflection states angle of incidence = angle of reflection." },
    { id: "lt2", text: "A concave mirror has focal length 10 cm. Its radius of curvature is:", options: ["5 cm", "10 cm", "20 cm", "40 cm"], correct: 2, explanation: "Radius of curvature = 2 × focal length = 2 × 10 = 20 cm." },
    { id: "lt3", text: "Light travels fastest in:", options: ["Water", "Glass", "Diamond", "Vacuum"], correct: 3, explanation: "Light travels at its maximum speed (3 × 10⁸ m/s) in vacuum." },
    { id: "lt4", text: "A convex lens forms a real image when the object is placed:", options: ["At focus", "Between focus and lens", "Beyond focus", "At infinity only"], correct: 2, explanation: "A convex lens forms a real, inverted image when object is beyond the focal point." },
  ],
  "Real Numbers": [
    { id: "rn1", text: "Every composite number can be expressed as a product of primes. This is:", options: ["Euclid's Division Lemma", "Fundamental Theorem of Arithmetic", "HCF Theorem", "LCM Property"], correct: 1, explanation: "The Fundamental Theorem of Arithmetic states every composite number has a unique prime factorisation." },
    { id: "rn2", text: "HCF × LCM = ?", options: ["Sum of two numbers", "Difference of two numbers", "Product of two numbers", "Square of numbers"], correct: 2, explanation: "For any two positive integers a and b: HCF(a,b) × LCM(a,b) = a × b." },
    { id: "rn3", text: "√2 is:", options: ["Rational", "Irrational", "Natural Number", "Integer"], correct: 1, explanation: "√2 is irrational — it cannot be expressed as p/q where p and q are integers." },
  ],
  Trigonometry: [
    { id: "tg1", text: "sin²θ + cos²θ = ?", options: ["0", "2", "1", "sinθ × cosθ"], correct: 2, explanation: "This is the Pythagorean identity: sin²θ + cos²θ = 1 for all values of θ." },
    { id: "tg2", text: "What is the value of tan 45°?", options: ["0", "1", "√3", "1/√2"], correct: 1, explanation: "tan 45° = sin 45° / cos 45° = (1/√2) / (1/√2) = 1." },
    { id: "tg3", text: "sec θ is defined as:", options: ["1/sinθ", "1/cosθ", "sinθ/cosθ", "cosθ/sinθ"], correct: 1, explanation: "sec θ = 1/cos θ (secant is the reciprocal of cosine)." },
  ],
  Geometry: [
    { id: "gm1", text: "If two triangles are similar, their corresponding sides are:", options: ["Equal", "Proportional", "Parallel", "Perpendicular"], correct: 1, explanation: "Similar triangles have proportional corresponding sides and equal corresponding angles." },
    { id: "gm2", text: "The tangent to a circle at any point is perpendicular to:", options: ["Chord", "Diameter", "Radius at that point", "Another tangent"], correct: 2, explanation: "A tangent to a circle is perpendicular to the radius drawn to the point of tangency." },
    { id: "gm3", text: "Area of a triangle with base b and height h:", options: ["b × h", "2bh", "bh/2", "b² + h²"], correct: 2, explanation: "Area = (1/2) × base × height = bh/2." },
  ],
  Algebra: [
    { id: "al1", text: "The discriminant of ax² + bx + c = 0 is:", options: ["b² - 4ac", "b² + 4ac", "4ac - b²", "√(b² - 4ac)"], correct: 0, explanation: "Discriminant D = b² - 4ac determines the nature of roots of a quadratic equation." },
    { id: "al2", text: "Sum of n terms of an AP: Sₙ = ?", options: ["n(a + l)/2", "n/2 × [2a + (n-1)d]", "Both A and B", "na + nd"], correct: 2, explanation: "Both formulas are equivalent: Sₙ = n(a+l)/2 = n/2 × [2a+(n-1)d]." },
    { id: "al3", text: "Roots of x² - 5x + 6 = 0 are:", options: ["2, 3", "1, 6", "-2, -3", "5, 1"], correct: 0, explanation: "x² - 5x + 6 = (x-2)(x-3) = 0, so roots are x = 2 and x = 3." },
  ],
  "Chemical Reactions": [
    { id: "cr1", text: "A reaction in which a compound breaks into simpler substances is called:", options: ["Combination", "Decomposition", "Displacement", "Redox"], correct: 1, explanation: "Decomposition reaction: AB → A + B (one reactant breaks into two or more products)." },
    { id: "cr2", text: "Rusting of iron is a:", options: ["Physical change", "Decomposition", "Oxidation reaction", "Neutralisation"], correct: 2, explanation: "Rusting is an oxidation reaction: 4Fe + 3O₂ + 6H₂O → 4Fe(OH)₃." },
    { id: "cr3", text: "In a balanced chemical equation, what is conserved?", options: ["Only mass", "Only charge", "Both mass and charge", "Volume"], correct: 2, explanation: "Both mass (Law of Conservation of Mass) and charge are conserved in chemical reactions." },
  ],
  "Acids & Bases": [
    { id: "ab1", text: "pH of a neutral solution at 25°C is:", options: ["0", "7", "14", "10"], correct: 1, explanation: "Pure water and neutral solutions have pH = 7 at 25°C." },
    { id: "ab2", text: "Litmus paper turns red in:", options: ["Base", "Neutral solution", "Acid", "Salt solution"], correct: 2, explanation: "Acids turn blue litmus paper red (and bases turn red litmus blue)." },
    { id: "ab3", text: "Which is a strong acid?", options: ["Acetic acid", "Carbonic acid", "Hydrochloric acid", "Citric acid"], correct: 2, explanation: "HCl (Hydrochloric acid) is a strong acid — it completely dissociates in water." },
  ],
  Carbon: [
    { id: "cb1", text: "Carbon has atomic number:", options: ["4", "6", "8", "12"], correct: 1, explanation: "Carbon has atomic number 6 (6 protons) and is in Group 14 of the periodic table." },
    { id: "cb2", text: "Carbon forms covalent bonds because:", options: ["It has 4 valence electrons", "It is a metal", "It has 6 neutrons", "It is very reactive"], correct: 0, explanation: "With 4 valence electrons, carbon can form 4 covalent bonds by sharing electrons." },
    { id: "cb3", text: "The property of carbon to form long chains is called:", options: ["Isomerism", "Catenation", "Allotropy", "Polymerism"], correct: 1, explanation: "Catenation is the ability of carbon to form bonds with other carbon atoms to make long chains." },
  ],
  "Life Processes": [
    { id: "lp1", text: "Which organ produces bile in the human body?", options: ["Pancreas", "Stomach", "Liver", "Kidney"], correct: 2, explanation: "The liver produces bile which is stored in the gall bladder and helps digest fats." },
    { id: "lp2", text: "The main function of xylem in plants is to:", options: ["Carry food", "Carry water and minerals", "Produce oxygen", "Store starch"], correct: 1, explanation: "Xylem transports water and dissolved minerals from roots to leaves (upward transport)." },
    { id: "lp3", text: "Photosynthesis occurs in the:", options: ["Mitochondria", "Ribosome", "Chloroplast", "Nucleus"], correct: 2, explanation: "Photosynthesis takes place in chloroplasts which contain the pigment chlorophyll." },
  ],
  Control: [
    { id: "cn1", text: "The basic structural and functional unit of the nervous system is:", options: ["Organ", "Synapse", "Neuron", "Brain"], correct: 2, explanation: "The neuron (nerve cell) is the basic unit of the nervous system." },
    { id: "cn2", text: "Reflex actions are controlled by:", options: ["Brain", "Spinal cord", "Cerebrum", "Cerebellum"], correct: 1, explanation: "Reflex actions are involuntary and are controlled by the spinal cord, not the brain." },
    { id: "cn3", text: "Which hormone is called the 'emergency hormone'?", options: ["Insulin", "Thyroxine", "Oestrogen", "Adrenaline"], correct: 3, explanation: "Adrenaline (epinephrine) is the emergency hormone released during fight-or-flight response." },
  ],
  Reproduction: [
    { id: "rp1", text: "Binary fission is a type of:", options: ["Sexual reproduction", "Asexual reproduction", "Vegetative propagation", "Fertilisation"], correct: 1, explanation: "Binary fission is asexual reproduction where a single organism divides into two daughter cells." },
    { id: "rp2", text: "Fertilisation in humans occurs in the:", options: ["Uterus", "Ovary", "Fallopian tube", "Vagina"], correct: 2, explanation: "Fertilisation (fusion of egg and sperm) occurs in the fallopian tube (oviduct)." },
    { id: "rp3", text: "Pollination is the transfer of pollen from:", options: ["Stigma to anther", "Anther to stigma", "Root to leaf", "Stem to flower"], correct: 1, explanation: "Pollination is the transfer of pollen grains from the anther (male) to the stigma (female)." },
  ],
  Polynomials: [
    { id: "pl1", text: "If p(x) = x² - 5, then p(√5) = ?", options: ["0", "5", "-5", "√5"], correct: 0, explanation: "p(√5) = (√5)² - 5 = 5 - 5 = 0. So √5 is a zero of p(x)." },
    { id: "pl2", text: "A quadratic polynomial has at most how many zeroes?", options: ["1", "2", "3", "4"], correct: 1, explanation: "A quadratic polynomial (degree 2) has at most 2 zeroes." },
    { id: "pl3", text: "The sum of zeroes of ax² + bx + c is:", options: ["-b/a", "b/a", "c/a", "-c/a"], correct: 0, explanation: "For ax² + bx + c, sum of zeroes α + β = -b/a." },
  ],
  Circles: [
    { id: "ci1", text: "How many tangents can be drawn from an external point to a circle?", options: ["1", "2", "3", "Infinite"], correct: 1, explanation: "Exactly 2 tangents can be drawn from any external point to a circle." },
    { id: "ci2", text: "The length of two tangents drawn from an external point are:", options: ["Different", "Equal", "Proportional to radius", "Double the radius"], correct: 1, explanation: "Tangent segments from an external point to a circle are equal in length." },
  ],
  Statistics: [
    { id: "st1", text: "The middle value of a data set arranged in order is:", options: ["Mean", "Mode", "Median", "Range"], correct: 2, explanation: "Median is the middle value of a data set when arranged in ascending/descending order." },
    { id: "st2", text: "The most frequently occurring value in a data set is:", options: ["Mean", "Mode", "Median", "Average"], correct: 1, explanation: "Mode is the value that appears most frequently in a data set." },
    { id: "st3", text: "Mean = Sum of observations / Number of observations. This is the:", options: ["Weighted mean", "Arithmetic mean", "Geometric mean", "Harmonic mean"], correct: 1, explanation: "This is the formula for Arithmetic Mean, the most common measure of central tendency." },
  ],
  History: [
    { id: "hs1", text: "The concept of 'Swaraj' was given by:", options: ["Nehru", "Tilak", "Gandhi", "Ambedkar"], correct: 2, explanation: "Mahatma Gandhi popularised the concept of Swaraj (self-rule) in the Indian national movement." },
    { id: "hs2", text: "The French Revolution began in:", options: ["1776", "1789", "1804", "1815"], correct: 1, explanation: "The French Revolution started in 1789 with the storming of the Bastille." },
  ],
  Geography: [
    { id: "gg1", text: "Which is India's most important mineral for energy production?", options: ["Iron ore", "Coal", "Bauxite", "Mica"], correct: 1, explanation: "Coal is the most important mineral for energy production in India (used in thermal power plants)." },
    { id: "gg2", text: "The largest river basin in India is:", options: ["Deccan", "Ganga", "Brahmaputra", "Indus"], correct: 1, explanation: "The Ganga river basin is the largest river basin in India." },
  ],
  Civics: [
    { id: "cv1", text: "Power sharing between the central and state governments is called:", options: ["Democracy", "Federalism", "Secularism", "Socialism"], correct: 1, explanation: "Federalism is the system where power is shared between central (union) and state governments." },
    { id: "cv2", text: "India follows which type of democracy?", options: ["Direct", "Representative", "Presidential", "Monarchical"], correct: 1, explanation: "India follows representative (indirect) democracy where citizens elect representatives." },
  ],
  Economics: [
    { id: "ec1", text: "Which sector includes agriculture and mining?", options: ["Primary", "Secondary", "Tertiary", "Quaternary"], correct: 0, explanation: "The Primary sector includes activities related to natural resources (agriculture, fishing, mining)." },
    { id: "ec2", text: "Money is used as a medium of exchange to overcome the problems of:", options: ["Inflation", "Barter system", "Taxation", "Unemployment"], correct: 1, explanation: "Money was introduced to overcome the limitations of the barter system (double coincidence of wants)." },
  ],
  Force: [
    { id: "fr1", text: "Newton's Second Law of Motion states that F = ?", options: ["mv", "ma", "m/a", "v/t"], correct: 1, explanation: "Newton's Second Law: F = ma (Force = mass × acceleration)." },
    { id: "fr2", text: "A lever of the second order has the load:", options: ["Between effort and fulcrum", "Between fulcrum and effort", "At fulcrum", "Above the effort"], correct: 0, explanation: "In a second-order lever, the load is between the effort and the fulcrum (e.g., wheelbarrow)." },
  ],
  Optics: [
    { id: "op1", text: "The critical angle is the angle of incidence for which the angle of refraction is:", options: ["0°", "45°", "90°", "180°"], correct: 2, explanation: "At the critical angle, the refracted ray travels along the surface (angle of refraction = 90°)." },
    { id: "op2", text: "Convex mirrors are used as rear-view mirrors because they:", options: ["Magnify objects", "Provide a wide field of view", "Show real images", "Focus light"], correct: 1, explanation: "Convex mirrors diverge light and provide a wide field of view, making them ideal as rear-view mirrors." },
  ],
  Mensuration: [
    { id: "mn1", text: "The volume of a sphere with radius r is:", options: ["4πr²", "4/3 πr³", "2/3 πr³", "πr³"], correct: 1, explanation: "Volume of sphere = (4/3)πr³." },
    { id: "mn2", text: "Curved surface area of a cylinder (radius r, height h):", options: ["2πr²", "2πrh", "πr²h", "2πr(r+h)"], correct: 1, explanation: "Curved Surface Area of cylinder = 2πrh (excludes the two circular ends)." },
  ],
  Probability: [
    { id: "pb1", text: "Probability of a certain event is:", options: ["0", "0.5", "1", "Between 0 and 1"], correct: 2, explanation: "Probability of a certain (sure) event = 1." },
    { id: "pb2", text: "A card is drawn from a pack of 52. Probability of getting a king is:", options: ["1/13", "1/52", "4/52", "1/26"], correct: 0, explanation: "There are 4 kings in 52 cards. P(king) = 4/52 = 1/13." },
    { id: "pb3", text: "Sum of probabilities of all possible outcomes of an experiment is:", options: ["0", "0.5", "Greater than 1", "1"], correct: 3, explanation: "The sum of probabilities of all outcomes in a sample space always equals 1." },
  ],
};
