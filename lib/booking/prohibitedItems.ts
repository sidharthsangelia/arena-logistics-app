// ---------------------------------------------------------------------------
// Prohibited items (air cargo).
//
// The carriers we hand shipments to (FedEx, UPS, DHL and the rest) publish
// near-identical restricted lists running to ~56 individual entries. Shown raw
// that list is unreadable at booking time, so it is folded here into twelve
// themes: every original entry still appears, but as an example under the rule
// that actually explains it. The booking step renders this both as the consent
// the customer ticks and as the dialog they check their packing list against.
//
// Nothing here is enforced in code. It exists so a customer recognises their
// own goods before the parcel is stopped at the hub or by customs.
// ---------------------------------------------------------------------------

export interface ProhibitedGroup {
  /** Short rule the customer can match their goods against. */
  title: string;
  /** One line on why it is refused, or the narrow case that is allowed. */
  note: string;
  /** The underlying carrier list entries covered by this rule. */
  examples: string[];
}

export const PROHIBITED_GROUPS: ProhibitedGroup[] = [
  {
    title: "Flammable, corrosive and hazardous goods",
    note: "Anything that can burn, leak, corrode, build pressure or give off radiation is refused on passenger and cargo aircraft alike.",
    examples: [
      "Dangerous goods and hazardous material of any class",
      "Acids (hydrochloric, nitric, sulphuric)",
      "Caustic soda, aluminium chloride",
      "Corrosive cleaning fluids, rust removers and paint or nail polish removers",
      "Other harmful chemicals",
      "Radioactive material",
      "Asbestos",
      "Fire extinguishers and pressurised cylinders",
      "Dry ice",
      "Anything that ignites or combusts",
    ],
  },
  {
    title: "Batteries, magnets and powered electronics",
    note: "Loose cells and strong magnets are an in-flight fire and instrument risk. One battery installed inside its device is usually fine; spares are not.",
    examples: [
      "Lithium batteries and power banks",
      "More than one battery, or loose mobile and IEC electronic components",
      "Samsung Galaxy Note 7",
      "Hoverboards and self-balancing boards",
      "Drones",
      "Magnets",
      "Speakers",
    ],
  },
  {
    title: "Alcohol, tobacco and drugs",
    note: "Refused as cargo and separately restricted by Indian export rules and by the destination country.",
    examples: [
      "Alcohol of any kind",
      "Tobacco and cigarettes",
      "Electronic cigarettes and vapes",
      "Drugs, narcotics and contraband",
      "Poisonous goods",
    ],
  },
  {
    title: "Medicines and health products",
    note: "Personal medicine travels only in small quantities with a prescription. Traditional formulations are refused outright by most carriers.",
    examples: [
      "Medicine beyond a three month personal quantity",
      "Homeopathic medicine",
      "Ayurvedic medicine",
    ],
  },
  {
    title: "Cosmetics, perfumes and toiletries",
    note: "Most are alcohol based or classed as liquids, so they fail the same air rules as flammables.",
    examples: ["Perfume and deodorant", "Cosmetics", "Soaps"],
  },
  {
    title: "Biological and human material",
    note: "Needs a specialist medical courier with its own licences, packaging and paperwork. It cannot move on a normal shipment.",
    examples: [
      "Biological Substance, Category B",
      "Bacteria and virus samples",
      "Blood samples",
      "Skin samples",
      "DNA samples",
      "Corpses and human ashes",
    ],
  },
  {
    title: "Food, plants and agricultural produce",
    note: "Perishables spoil in transit and nearly every destination applies quarantine controls on plant and food imports.",
    examples: [
      "Fruits and vegetables",
      "Food that needs refrigeration",
      "Edible oils, de-oiled groundnut cake, fodder and rice bran",
      "Red chilli",
      "Seeds",
      "Plant cells and cuttings",
    ],
  },
  {
    title: "Animals and animal products",
    note: "Live animals and untreated animal material are refused, and CITES rules apply on top.",
    examples: [
      "Live animals and livestock",
      "Raw skins and furs, and articles made from them",
    ],
  },
  {
    title: "Money, documents and valuables",
    note: "Uninsurable in ordinary cargo. High value goods need a declared valuables service booked through our team.",
    examples: [
      "Currency and negotiable instruments",
      "Bullion and precious metals",
      "Expensive jewellery, precious and semi-precious stones",
      "Antiques",
      "Credit and debit cards",
      "Original passports",
    ],
  },
  {
    title: "Weapons and sharp objects",
    note: "Includes anything that looks like a weapon, whether or not it can fire.",
    examples: [
      "Arms and ammunition",
      "Air guns, replica and imitation firearms",
      "Knives",
      "Needles",
    ],
  },
  {
    title: "Illegal, counterfeit and government restricted goods",
    note: "Blocked by law rather than by the carrier. Shipping these can mean seizure and prosecution, not just a returned parcel.",
    examples: [
      "Counterfeit and fake designer goods",
      "Pornographic material",
      "Lottery tickets and gambling devices",
      "Activated SIM cards",
      "Government restricted commodities (PPE kits, N95 masks)",
    ],
  },
  {
    title: "Other items carriers refuse",
    note: "Refused on handling grounds: too fragile, too bulky, or hollow enough to hide contraband.",
    examples: [
      "Desktop PCs",
      "LED and LCD panels and televisions",
      "Hollow musical instruments (tabla, harmonium)",
    ],
  },
];

/** How many individual carrier list entries the groups above cover. */
export const PROHIBITED_ITEM_COUNT = PROHIBITED_GROUPS.reduce(
  (n, g) => n + g.examples.length,
  0,
);
