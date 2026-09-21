export const CATEGORIES = [
  { id: 'tuition', label: 'Tuition / coaching centre', q: 'coaching centre', driver: 'anchor', anchors: [
    { key: 'primary', query: 'school', label: 'schools', radius: 2000, typeIds: [], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'apartment', label: 'residential places', radius: 2000, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'preschool', label: 'Preschool / daycare', q: 'preschool', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: [], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'office', label: 'offices', radius: 1500, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'stationery', label: 'Stationery / bookshop', q: 'stationery shop', driver: 'anchor', anchors: [
    { key: 'primary', query: 'school', label: 'schools', radius: 1500, typeIds: [], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'coaching centre', label: 'coaching centres', radius: 1500, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'gym', label: 'Gym / fitness centre', q: 'gym', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: [], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'office', label: 'offices', radius: 1500, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'salon', label: 'Salon / beauty parlour', q: 'beauty salon', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: [], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'office', label: 'offices', radius: 1500, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'grocery', label: 'Grocery / supermarket', q: 'supermarket', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 1000, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'pharmacy', label: 'Pharmacy', q: 'pharmacy', driver: 'anchor', anchors: [
    { key: 'primary', query: 'clinic', label: 'clinics and hospitals', radius: 1500, typeIds: [], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'apartment', label: 'residential places', radius: 1500, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'clinic', label: 'Clinic / general physician', q: 'clinic', driver: 'anchor', anchors: [
    { key: 'primary', query: 'apartment', label: 'residential places', radius: 2000, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'cafe', label: 'Coffee shop / cafe', q: 'coffee shop', driver: 'anchor', anchors: [
    { key: 'primary', query: 'office', label: 'offices', radius: 1000, typeIds: [], sparseAt: null, richAt: null },
    { key: 'secondary', query: 'college', label: 'colleges', radius: 1500, typeIds: [], sparseAt: null, richAt: null }
  ] },
  { id: 'restaurant', label: 'Restaurant', q: 'restaurant', driver: 'reviews', anchors: [] },
  { id: 'bakery', label: 'Bakery', q: 'bakery', driver: 'reviews', anchors: [] },
  { id: 'repair', label: 'Mobile / electronics repair', q: 'mobile phone repair', driver: 'reviews', anchors: [] }
];
