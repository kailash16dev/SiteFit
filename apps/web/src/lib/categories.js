export const CATEGORIES = [
  { id: 'tuition', label: 'Tuition / coaching centre', q: 'coaching centre', driver: 'anchor', anchors: [
    { key: 'primary', query: 'school', label: 'schools', radius: 2000, typeIds: ['school', 'preschool', 'primary_school', 'secondary_school', 'high_school', 'higher_secondary_school', 'general_education_school', 'cbse_school'], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'apartment', label: 'residential places', radius: 2000, typeIds: ['apartment_building', 'apartment_complex', 'condominium_complex'], sparseAt: null, richAt: null }
  ] },
  { id: 'preschool', label: 'Preschool / daycare', q: 'preschool', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: ['apartment_building', 'apartment_complex', 'condominium_complex'], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'corporate office', label: 'corporate offices', radius: 1500, typeIds: ['corporate_office'], sparseAt: null, richAt: null }
  ] },
  { id: 'stationery', label: 'Stationery / bookshop', q: 'stationery shop', driver: 'anchor', anchors: [
    { key: 'primary', query: 'school', label: 'schools', radius: 1500, typeIds: ['school', 'preschool', 'primary_school', 'secondary_school', 'high_school', 'higher_secondary_school', 'general_education_school', 'cbse_school'], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'coaching centre', label: 'coaching centres', radius: 1500, typeIds: ['coaching_center', 'education_center', 'educational_institution'], sparseAt: null, richAt: null }
  ] },
  { id: 'gym', label: 'Gym / fitness centre', q: 'gym', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: ['apartment_building', 'apartment_complex', 'condominium_complex'], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'corporate office', label: 'corporate offices', radius: 1500, typeIds: ['corporate_office'], sparseAt: null, richAt: null }
  ] },
  { id: 'salon', label: 'Salon / beauty parlour', q: 'beauty salon', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: ['apartment_building', 'apartment_complex', 'condominium_complex'], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'corporate office', label: 'corporate offices', radius: 1500, typeIds: ['corporate_office'], sparseAt: null, richAt: null }
  ] },
  { id: 'grocery', label: 'Grocery / supermarket', q: 'supermarket', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1000, typeIds: ['apartment_building', 'apartment_complex', 'condominium_complex'], sparseAt: null, richAt: null }
  ] },
  { id: 'pharmacy', label: 'Pharmacy', q: 'pharmacy', driver: 'anchor', anchors: [
    { key: 'primary', query: 'hospital', label: 'hospitals', radius: 1500, typeIds: ['hospital'], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: ['apartment_building', 'apartment_complex', 'condominium_complex'], sparseAt: null, richAt: null }
  ] },
  { id: 'clinic', label: 'Clinic / general physician', q: 'clinic', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 2000, typeIds: ['apartment_building', 'apartment_complex', 'condominium_complex'], sparseAt: null, richAt: null }
  ] },
  { id: 'cafe', label: 'Coffee shop / cafe', q: 'cafe', driver: 'anchor', anchors: [
    { key: 'primary', query: 'corporate office', label: 'corporate offices', radius: 1000, typeIds: ['corporate_office'], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'college', label: 'colleges', radius: 1500, typeIds: ['college'], sparseAt: null, richAt: null }
  ] },
  { id: 'restaurant', label: 'Restaurant', q: 'restaurant', driver: 'reviews', anchors: [] },
  { id: 'bakery', label: 'Bakery', q: 'bakery', driver: 'reviews', anchors: [] },
  { id: 'repair', label: 'Mobile / electronics repair', q: 'mobile phone repair', driver: 'reviews', anchors: [] }
];
