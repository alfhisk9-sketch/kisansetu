/**
 * KisanSetu Crop Master Service
 * Authoritative Indian Crop Specifications & Agricultural Attributes
 * Based on ICAR (Indian Council of Agricultural Research) & Ministry of Agriculture classifications.
 */

export const AUTHORITATIVE_CROPS_CATALOG = [
  {
    crop_id: "crop-cotton",
    name: "Cotton",
    local_names: {
      hindi: "कपास (Kapas)",
      marathi: "कापूस (Kapoos)",
      telugu: "ప్రత్తి (Pratti)"
    },
    category: "Fibre",
    common_unit: "quintal",
    season: "Kharif",
    harvest_period: "October - February",
    storage_notes: "Store in dry aerated godowns with moisture below 8% to prevent yellowing and microbial degradation.",
    quality_parameters: {
      staple_length_mm: "28-32 mm (Medium/Long Staple)",
      moisture_max_pct: 8.5,
      trash_max_pct: 3.0,
      grade_standards: "FAQ / CCI Standard"
    },
    active: true
  },
  {
    crop_id: "crop-onion",
    name: "Onion",
    local_names: {
      hindi: "प्याज (Pyaz)",
      marathi: "कांदा (Kanda)",
      telugu: "ఉల్లిపాయ (Ullipaya)"
    },
    category: "Vegetable",
    common_unit: "quintal",
    season: "Rabi & Kharif",
    harvest_period: "December - May",
    storage_notes: "Requires well-ventilated bottom-aerated chawls or temperature-controlled cold storages (0-2°C, 65-70% RH). Avoid plastic bags.",
    quality_parameters: {
      size_mm: "45-60 mm (Medium to Large)",
      moisture_max_pct: 12.0,
      sprouting_pct_max: 1.0,
      grade_standards: "FAQ Grade A/B"
    },
    active: true
  },
  {
    crop_id: "crop-chilli",
    name: "Chilli",
    local_names: {
      hindi: "लाल मिर्च (Lal Mirch)",
      marathi: "लाल मिरची (Mirchi)",
      telugu: "ఎండుమిర్చి (Endu Mirchi)"
    },
    category: "Spices",
    common_unit: "quintal",
    season: "Kharif / Rabi",
    harvest_period: "January - May",
    storage_notes: "Cold storage at 4-6°C and 60-65% RH preserves bright red color and capsaicin content. Protect from direct humidity.",
    quality_parameters: {
      variety_dominant: "Teja / Guntur Sannam / Byadagi",
      moisture_max_pct: 10.0,
      broken_chillies_max_pct: 2.0,
      grade_standards: "Agmark Special / Grade 1"
    },
    active: true
  },
  {
    crop_id: "crop-tomato",
    name: "Tomato",
    local_names: {
      hindi: "टमाटर (Tamatar)",
      marathi: "टोमॅटो (Tomato)",
      telugu: "టమోటా (Tamota)"
    },
    category: "Vegetable",
    common_unit: "quintal",
    season: "All seasons (Kharif, Rabi, Summer)",
    harvest_period: "Round the year",
    storage_notes: "Perishable; store mature green at 12-15°C; ripe at 8-10°C (85-90% RH). Shelf life: 7-14 days without cold chain.",
    quality_parameters: {
      color_stage: "Turning to Light Red",
      damage_max_pct: 3.0,
      firmness_rating: "Firm Hybrid",
      grade_standards: "Grade A / Fresh Market"
    },
    active: true
  },
  {
    crop_id: "crop-wheat",
    name: "Wheat",
    local_names: {
      hindi: "गेहूं (Gehun)",
      marathi: "गहू (Gahu)",
      telugu: "గోధుమలు (Godhumalu)"
    },
    category: "Cereal",
    common_unit: "quintal",
    season: "Rabi",
    harvest_period: "March - May",
    storage_notes: "Store in airtight silos or fumigated warehouses with grain moisture strictly below 12% to prevent weevils and mould.",
    quality_parameters: {
      variety_dominant: "Sharbati / Lokwan / Durum",
      moisture_max_pct: 12.0,
      foreign_matter_max_pct: 1.0,
      grade_standards: "FAQ / FCI Grade 1"
    },
    active: true
  },
  {
    crop_id: "crop-soybean",
    name: "Soybean",
    local_names: {
      hindi: "सोयाबीन (Soyabean)",
      marathi: "सोयाबीन (Soyabean)",
      telugu: "సోయాబీన్ (Soyabean)"
    },
    category: "Oilseed",
    common_unit: "quintal",
    season: "Kharif",
    harvest_period: "September - November",
    storage_notes: "Keep moisture below 10%. Aerate periodically to prevent heating and rancidity of oil content.",
    quality_parameters: {
      oil_content_min_pct: 18.0,
      moisture_max_pct: 10.0,
      damaged_seeds_max_pct: 2.0,
      grade_standards: "FAQ Oil Processing Grade"
    },
    active: true
  },
  {
    crop_id: "crop-maize",
    name: "Maize",
    local_names: {
      hindi: "मक्का (Makka)",
      marathi: "मका (Maka)",
      telugu: "మొక్కజొన్న (Mokkajonna)"
    },
    category: "Cereal",
    common_unit: "quintal",
    season: "Kharif & Rabi",
    harvest_period: "September - October / March - April",
    storage_notes: "Drying to 12% moisture essential before storage to prevent aflatoxin contamination.",
    quality_parameters: {
      grain_type: "Yellow Dent / Flint",
      moisture_max_pct: 12.0,
      aflatoxin_ppb_max: 20,
      grade_standards: "Feed & Starch Industrial Grade"
    },
    active: true
  },
  {
    crop_id: "crop-turmeric",
    name: "Turmeric",
    local_names: {
      hindi: "हल्दी (Haldi)",
      marathi: "हळद (Halad)",
      telugu: "పసుపు (Pasupu)"
    },
    category: "Spices",
    common_unit: "quintal",
    season: "Rabi",
    harvest_period: "January - April",
    storage_notes: "Store finger and bulb rhiozomes in dry dark sheds or cold warehouses. Curcumin degrades with moisture and light.",
    quality_parameters: {
      curcumin_pct_min: 3.5,
      moisture_max_pct: 10.0,
      type: "Polished Finger / Gatta",
      grade_standards: "Duggirala / Nizamabad Special"
    },
    active: true
  },
  {
    crop_id: "crop-grapes",
    name: "Grapes",
    local_names: {
      hindi: "अंगूर (Angoor)",
      marathi: "द्राक्षे (Drakshe)",
      telugu: "ద్రాక్ష (Draksha)"
    },
    category: "Fruit",
    common_unit: "quintal",
    season: "Rabi / Summer",
    harvest_period: "January - April",
    storage_notes: "Pre-cool within 6 hours of harvest. Cold store at -0.5 to 0°C with 90-95% RH with SO2 generator pads.",
    quality_parameters: {
      variety_dominant: "Thompson Seedless / Sonaka",
      brix_min: 16.0,
      berry_size_mm_min: 16,
      grade_standards: "APEDA Export Standard / Table Fresh"
    },
    active: true
  },
  {
    crop_id: "crop-pomegranate",
    name: "Pomegranate",
    local_names: {
      hindi: "अनार (Anaar)",
      marathi: "डाळिंब (Dalimb)",
      telugu: "దానిమ్మ (Danimma)"
    },
    category: "Fruit",
    common_unit: "quintal",
    season: "Mridug Bahar / Hasta Bahar",
    harvest_period: "September - February",
    storage_notes: "Store at 5°C with 90-95% RH. Sensitive to chilling injury below 4°C.",
    quality_parameters: {
      variety_dominant: "Bhagwa",
      fruit_weight_grams: "250-400g",
      aril_color: "Ruby Red",
      grade_standards: "Grade A Export / Domestic Premium"
    },
    active: true
  },
  {
    crop_id: "crop-paddy",
    name: "Paddy (Rice)",
    local_names: {
      hindi: "धान / चावल (Dhan / Chawal)",
      marathi: "भात (Bhaat)",
      telugu: "వరి / ధాన్యం (Vari / Dhanyam)"
    },
    category: "Cereal",
    common_unit: "quintal",
    season: "Kharif & Rabi",
    harvest_period: "November - January / April - May",
    storage_notes: "Sun dry or mechanical dry to 13-14% moisture before storage in covered warehouses or CAP storages.",
    quality_parameters: {
      variety_dominant: "BPT 5204 (Sona Masoori) / MTU 1010",
      moisture_max_pct: 14.0,
      foreign_matter_max_pct: 1.0,
      grade_standards: "Grade A / Common"
    },
    active: true
  },
  {
    crop_id: "crop-groundnut",
    name: "Groundnut",
    local_names: {
      hindi: "मूंगफली (Moongphali)",
      marathi: "भुईमूग (Bhuimug)",
      telugu: "వేరుశెనగ (Verusanaga)"
    },
    category: "Oilseed",
    common_unit: "quintal",
    season: "Kharif & Rabi",
    harvest_period: "October - December / March - April",
    storage_notes: "Store pods in dry ventilated rooms with moisture < 8% to completely eliminate aflatoxin risk.",
    quality_parameters: {
      shelling_pct_min: 70.0,
      oil_content_min_pct: 48.0,
      moisture_max_pct: 8.0,
      grade_standards: "Bold / Java Pods"
    },
    active: true,
    verification_status: "VERIFIED",
    source: "ICAR / Directorate of Economics and Statistics"
  },
  {
    crop_id: "crop-sugarcane",
    name: "Sugarcane",
    scientific_name: "Saccharum officinarum",
    local_names: {
      hindi: "गन्ना (Ganna)",
      marathi: "ऊस (Oos)",
      telugu: "చెరకు (Cheraku)"
    },
    category: "Cash Crop",
    common_unit: "quintal",
    season: "Annual / Adsali",
    harvest_period: "November - April",
    storage_notes: "Highly perishable post-harvest; must be processed within 24-48 hours to prevent sucrose inversion and post-harvest staling.",
    quality_parameters: {
      brix_pct_min: 18.0,
      sucrose_pct_min: 11.5,
      fiber_pct_max: 13.5,
      grade_standards: "Mill Cane Recovery Standard"
    },
    active: true,
    verification_status: "VERIFIED",
    source: "ICAR - Sugarcane Breeding Institute (SBI)"
  },
  {
    crop_id: "crop-bengal-gram",
    name: "Bengal Gram (Chickpea)",
    scientific_name: "Cicer arietinum",
    local_names: {
      hindi: "चना (Chana)",
      marathi: "हरभरा (Harbhara)",
      telugu: "శనగలు (Sanagalu)"
    },
    category: "Pulses",
    common_unit: "quintal",
    season: "Rabi",
    harvest_period: "February - April",
    storage_notes: "Dry to moisture below 9.5% before storage. Store in fumigated hermetic bags or godowns to prevent pulse beetle (Callosobruchus maculatus) damage.",
    quality_parameters: {
      variety_dominant: "Desi / Kabuli (JG 11 / KAK 2)",
      moisture_max_pct: 9.5,
      damaged_grains_max_pct: 2.0,
      foreign_matter_max_pct: 1.0,
      grade_standards: "FAQ / Agmark Standard"
    },
    active: true,
    verification_status: "VERIFIED",
    source: "ICAR - Indian Institute of Pulses Research (IIPR)"
  },
  {
    crop_id: "crop-red-gram",
    name: "Red Gram (Pigeon Pea)",
    scientific_name: "Cajanus cajan",
    local_names: {
      hindi: "अरहर / तुअर (Arhar / Tur)",
      marathi: "तूर (Tur)",
      telugu: "కందులు (Kandulu)"
    },
    category: "Pulses",
    common_unit: "quintal",
    season: "Kharif",
    harvest_period: "December - February",
    storage_notes: "Maintain moisture below 10%. Aerate periodically; avoid damp storage floors.",
    quality_parameters: {
      variety_dominant: "Asha (ICPL 87119) / Maruti",
      moisture_max_pct: 10.0,
      weeviled_grains_max_pct: 1.5,
      foreign_matter_max_pct: 1.0,
      grade_standards: "FAQ Grade 1 / Agmark"
    },
    active: true,
    verification_status: "VERIFIED",
    source: "ICAR - Indian Institute of Pulses Research (IIPR)"
  },
  {
    crop_id: "crop-green-gram",
    name: "Green Gram (Moong)",
    scientific_name: "Vigna radiata",
    local_names: {
      hindi: "मूंग (Moong)",
      marathi: "मूग (Moog)",
      telugu: "పెసలు (Pesalu)"
    },
    category: "Pulses",
    common_unit: "quintal",
    season: "Kharif & Summer",
    harvest_period: "September - October / May - June",
    storage_notes: "Store at moisture level below 9%. High susceptibility to bruchid infestation; use hermetic grain storage bags.",
    quality_parameters: {
      variety_dominant: "IPM 02-03 / Samrat",
      moisture_max_pct: 9.0,
      foreign_matter_max_pct: 1.0,
      grade_standards: "FAQ Agmark Standard"
    },
    active: true,
    verification_status: "VERIFIED",
    source: "ICAR - Indian Institute of Pulses Research (IIPR)"
  },
  {
    crop_id: "crop-black-gram",
    name: "Black Gram (Urad)",
    scientific_name: "Vigna mungo",
    local_names: {
      hindi: "उड़द (Urad)",
      marathi: "उडीद (Udid)",
      telugu: "మినుములు (Minumulu)"
    },
    category: "Pulses",
    common_unit: "quintal",
    season: "Kharif & Rabi",
    harvest_period: "October - November / February - March",
    storage_notes: "Dry thoroughly to under 9.5% moisture. Store in dry, pest-sealed warehousing.",
    quality_parameters: {
      variety_dominant: "LBG 752 / PU 31",
      moisture_max_pct: 9.5,
      foreign_matter_max_pct: 1.0,
      grade_standards: "FAQ Agmark Standard"
    },
    active: true,
    verification_status: "VERIFIED",
    source: "ICAR - Indian Institute of Pulses Research (IIPR)"
  }
];

/**
 * Get enriched crops list
 */
export function getAuthoritativeCrops() {
  return AUTHORITATIVE_CROPS_CATALOG;
}
