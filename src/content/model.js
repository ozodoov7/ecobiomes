// Central content model: drives API validation, admin forms, lists, filters and previews.
// Field types: text, textarea, paragraphs, richtext, number, date, select, checkbox,
//              image, file, url, email, list, tags, repeater, ref, relation, slug

const STATUS = { name: 'status', label: 'Holat', type: 'select', options: [['published', 'Published'], ['draft', 'Draft']] };

const f = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });

const COLLECTIONS = {
  menu_items: {
    label: 'Menyu punktlari', table: 'menu_items', titleField: 'label', adminOnly: true, preview: () => '/',
    fields: [
      f('location', 'Joylashuv', 'select', { required: true, options: [['header', 'Header menyu'], ['header_button', 'Header tugmasi (o\'ngda)'], ['footer_1', 'Footer — 1-ustun'], ['footer_2', 'Footer — 2-ustun']] }),
      f('label', 'Nomi', 'text', { required: true, max: 80 }),
      f('url', 'Havola', 'url', { required: true, help: 'Masalan: /people.html, /research.html#facilities, #contact' }),
      f('parent_id', 'Ota punkt (submenyu uchun)', 'ref', { collection: 'menu_items', valueField: 'id', labelField: 'label', where: { location: 'header', parent_id: null }, help: 'Faqat header menyu uchun' }),
    ],
    list: ['label', 'url', 'location'],
    filters: ['location'],
  },
  hero_slides: {
    label: 'Hero slaydlar', table: 'hero_slides', titleField: 'title', preview: () => '/',
    fields: [
      f('image', 'Rasm', 'image', { required: true, altField: 'alt' }),
      f('alt', 'Rasm alt matni', 'text', { max: 200 }),
      f('focus', 'Rasm fokusi (object-position)', 'text', { max: 40, help: 'Masalan: center 55%' }),
      f('eyebrow', 'Eyebrow', 'text', { max: 160 }),
      f('title', 'Sarlavha', 'text', { required: true, max: 160 }),
      f('btn1_label', '1-tugma matni', 'text', { max: 60, help: 'Bo\'sh qoldirilsa — umumiy hero tugmalari ishlatiladi' }),
      f('btn1_url', '1-tugma havolasi', 'url'),
      f('btn2_label', '2-tugma matni', 'text', { max: 60 }),
      f('btn2_url', '2-tugma havolasi', 'url'),
    ],
    list: ['image', 'title', 'eyebrow'],
  },
  explore_cards: {
    label: 'Explore kartalar', table: 'explore_cards', titleField: 'title', preview: () => '/#explore',
    fields: [
      f('title', 'Sarlavha', 'text', { required: true, max: 120 }),
      f('text', 'Bir qatorlik tavsif', 'text', { max: 240 }),
      f('url', 'Havola', 'url', { required: true }),
      f('link_label', 'Havola matni', 'text', { max: 40 }),
    ],
    list: ['title', 'url'],
  },
  research_areas: {
    label: 'Tadqiqot yo\'nalishlari', table: 'research_areas', titleField: 'title', preview: () => '/research.html#research-areas',
    fields: [
      f('title', 'Nomi', 'text', { required: true, max: 160 }),
      f('summary', 'Qisqa tavsif', 'textarea', { max: 2000 }),
      f('questions', 'Tadqiqot savollari', 'list', { help: 'Har bir savol alohida qatorda' }),
      f('methods', 'Methods', 'textarea', { max: 1000 }),
      f('current_focus', 'Current focus', 'textarea', { max: 1000 }),
      f('related_projects', 'Related projects', 'text', { max: 400 }),
      f('link_label', 'Havola matni', 'text', { max: 40 }),
      f('link_url', 'Havola', 'url'),
    ],
    list: ['title', 'current_focus'],
  },
  facilities: {
    label: 'Facilities', table: 'facilities', titleField: 'title', preview: () => '/research.html#facilities',
    fields: [
      f('icon', 'Ikonka (matn/raqam)', 'text', { max: 8, help: 'Doira ichidagi belgi, masalan 01' }),
      f('title', 'Nomi', 'text', { required: true, max: 160 }),
      f('description', 'Tavsif', 'textarea', { max: 2000 }),
      f('specs', 'Texnik xususiyatlar', 'repeater', { fields: [f('label', 'Nomi', 'text', { max: 60 }), f('value', 'Qiymati', 'text', { max: 400 })] }),
    ],
    list: ['icon', 'title'],
  },
  collab_types: {
    label: 'Hamkorlik turlari', table: 'collab_types', titleField: 'title', preview: () => '/research.html#collaboration',
    fields: [f('title', 'Nomi', 'text', { required: true, max: 120 }), f('text', 'Tavsif', 'textarea', { max: 1000 })],
    list: ['title', 'text'],
  },
  collab_locations: {
    label: 'Xaritadagi joylar', table: 'collab_locations', titleField: 'country', preview: () => '/research.html#collaboration',
    fields: [
      f('country', 'Davlat', 'text', { required: true, max: 80 }),
      f('description', 'Tavsif', 'text', { max: 200 }),
      f('lat', 'Kenglik (lat)', 'number', { help: 'Ixtiyoriy — interaktiv xarita uchun' }),
      f('lng', 'Uzunlik (lng)', 'number'),
    ],
    list: ['country', 'description'],
  },
  collab_timeline: {
    label: 'Timeline yozuvlari', table: 'collab_timeline', titleField: 'title', preview: () => '/research.html#collaboration',
    fields: [f('year', 'Yil', 'text', { required: true, max: 20 }), f('title', 'Sarlavha', 'text', { required: true, max: 200 }), f('text', 'Matn', 'textarea', { max: 2000 })],
    list: ['year', 'title'],
    filters: ['year'],
  },
  people: {
    label: 'Xodimlar', table: 'people', titleField: 'name', preview: () => '/people.html',
    fields: [
      f('name', 'Ism', 'text', { required: true, max: 120 }),
      f('slug', 'Slug', 'slug', { from: 'name' }),
      f('grp', 'Guruh', 'select', { required: true, options: [['pi', 'PI / Leadership'], ['core', 'Core team'], ['doctoral', 'Doctoral'], ['technical', 'Technical']] }),
      f('role_title', 'Lavozim', 'text', { max: 120 }),
      f('photo', 'Rasm', 'image', { altField: 'photo_alt', help: 'Bo\'sh bo\'lsa — bosh harflar ko\'rsatiladi' }),
      f('photo_alt', 'Rasm alt matni', 'text', { max: 200 }),
      f('initials', 'Bosh harflar', 'text', { max: 4 }),
      f('bio', 'Bio', 'textarea', { max: 3000 }),
      f('tags', 'Teglar', 'tags'),
      f('email', 'Email', 'email'),
      f('links', 'Profil havolalari', 'repeater', {
        help: 'Xohlagancha havola qo\'shing: ORCID, Google Scholar, Scopus, ResearchGate, LinkedIn va h.k. Saytda shu tartibda chiqadi.',
        fields: [
          f('label', 'Nomi', 'text', { max: 40, placeholder: 'Nomi, masalan: Scopus' }),
          f('url', 'Havola', 'url', { placeholder: 'https://…' }),
        ],
      }),
    ],
    list: ['photo', 'name', 'role_title', 'grp'],
    filters: ['grp'],
  },
  projects: {
    label: 'Loyihalar', table: 'projects', titleField: 'title', preview: () => '/projects.html',
    fields: [
      f('title', 'Nomi', 'text', { required: true, max: 200 }),
      f('slug', 'Slug', 'slug', { from: 'title' }),
      f('state', 'Holati', 'select', { required: true, options: [['active', 'Active'], ['completed', 'Completed']] }),
      f('badge', 'Belgi matni', 'text', { max: 80, help: 'Masalan: Ongoing, Ongoing — Flagship' }),
      f('year_start', 'Boshlangan yil', 'number', { integer: true }),
      f('year_end', 'Tugagan yil', 'number', { integer: true }),
      f('overview', 'Overview', 'textarea', { max: 3000 }),
      f('question', 'Research question', 'textarea', { max: 1000 }),
      f('objectives', 'Objectives', 'textarea', { max: 1000 }),
      f('methods', 'Methods', 'textarea', { max: 1000 }),
      f('study_system', 'Study system', 'textarea', { max: 1000 }),
      f('outcomes', 'Expected outcomes', 'textarea', { max: 1000 }),
      f('related_label', 'Related yorlig\'i', 'text', { max: 120 }),
      f('tags', 'Teglar', 'tags'),
      f('image', 'Rasm', 'image', { altField: 'image_alt' }),
      f('image_alt', 'Rasm alt matni', 'text', { max: 200 }),
      f('people', 'Mas\'ul xodimlar', 'relation', { collection: 'people', labelField: 'name', joinTable: 'project_people', localKey: 'project_id', foreignKey: 'person_id' }),
      f('link_label', 'Havola matni', 'text', { max: 60 }),
      f('link_url', 'Havola', 'url'),
    ],
    list: ['title', 'state', 'badge'],
    filters: ['state'],
  },
  pub_categories: {
    label: 'Maqola kategoriyalari', table: 'pub_categories', titleField: 'label', preview: () => '/publications.html',
    fields: [f('label', 'Nomi', 'text', { required: true, max: 120 }), f('key', 'Kalit', 'slug', { from: 'label', help: 'Filtr uchun ichki kalit' })],
    list: ['label', 'key'],
  },
  publications: {
    label: 'Maqolalar', table: 'publications', titleField: 'title', preview: () => '/publications.html', defaultOrder: 'year DESC, sort',
    fields: [
      f('title', 'Sarlavha', 'text', { required: true, max: 400 }),
      f('authors', 'Mualliflar', 'text', { max: 600 }),
      f('year', 'Yil', 'number', { required: true, integer: true }),
      f('journal', 'Jurnal', 'text', { max: 200 }),
      f('volume', 'Jild', 'text', { max: 20 }),
      f('issue', 'Son', 'text', { max: 20 }),
      f('pages', 'Sahifalar', 'text', { max: 40 }),
      f('doi', 'DOI', 'text', { max: 120 }),
      f('category', 'Kategoriya', 'ref', { collection: 'pub_categories', valueField: 'key', labelField: 'label' }),
      f('pdf', 'PDF fayl', 'file', { accept: 'application/pdf' }),
      f('url', 'Tashqi havola', 'url', { help: 'PDF bo\'lmasa shu havola ishlatiladi' }),
    ],
    list: ['title', 'year', 'category'],
    filters: ['year', 'category'],
  },
  news: {
    label: 'Yangiliklar', table: 'news', titleField: 'title', preview: r => `/news/${r.slug}.html`, defaultOrder: 'date DESC, sort',
    fields: [
      f('title', 'Sarlavha', 'text', { required: true, max: 250 }),
      f('slug', 'Slug (URL)', 'slug', { from: 'title' }),
      f('date', 'Sana', 'date', { required: true }),
      f('kind', 'Turi', 'select', { required: true, options: [['news', 'News'], ['event', 'Event']] }),
      f('label', 'Yorliq', 'text', { max: 60, help: 'Masalan: Fieldwork, Publication, Workshop' }),
      f('context', 'Kontekst (maqola sarlavhasi ostida)', 'text', { max: 200 }),
      f('excerpt', 'Qisqa matn', 'textarea', { max: 1000 }),
      f('body', 'To\'liq matn', 'richtext'),
      f('cover', 'Muqova rasmi', 'image', { altField: 'cover_alt' }),
      f('cover_alt', 'Muqova alt matni', 'text', { max: 200 }),
      f('seo_title', 'SEO title', 'text', { max: 200 }),
      f('seo_description', 'SEO description', 'textarea', { max: 400 }),
      f('og_title', 'og:title', 'text', { max: 200 }),
      f('og_description', 'og:description', 'textarea', { max: 400 }),
    ],
    list: ['cover', 'title', 'date', 'kind'],
    filters: ['kind', 'label'],
  },
  services: {
    label: 'Xizmatlar', table: 'services', titleField: 'title', preview: () => '/services.html',
    fields: [
      f('title', 'Nomi', 'text', { required: true, max: 160 }),
      f('tag_label', 'Yorliq', 'text', { max: 40 }),
      f('description', 'Tavsif', 'textarea', { max: 2000 }),
      f('methodology', 'Methodology', 'textarea', { max: 1000 }),
      f('applications', 'Typical applications', 'textarea', { max: 1000 }),
      f('request_label', 'So\'rov havolasi matni', 'text', { max: 80 }),
      f('request_url', 'So\'rov havolasi', 'url'),
      f('tags', 'Teglar', 'tags'),
    ],
    list: ['title', 'tag_label'],
  },
};
for (const c of Object.values(COLLECTIONS)) c.fields.push(STATUS);

const BLOCKS = {
  home_hero: { page: 'home', label: 'Hero umumiy tugmalari', preview: '/', fields: [
    f('aria_label', 'Slayder aria-label', 'text'), f('btn1_label', '1-tugma matni'), f('btn1_url', '1-tugma havolasi', 'url'),
    f('btn2_label', '2-tugma matni'), f('btn2_url', '2-tugma havolasi', 'url')] },
  home_info: { page: 'home', label: 'Info + Mission', preview: '/#info', fields: [
    f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha'), f('lede', 'Kirish matni', 'textarea'),
    f('mission_eyebrow', 'Mission eyebrow'), f('mission_title', 'Mission sarlavhasi'),
    f('mission_body', 'Mission matni', 'paragraphs', { help: 'Paragraflar orasida bo\'sh qator qoldiring' })] },
  home_about: { page: 'home', label: 'About us', preview: '/#about', fields: [
    f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha'),
    f('vision_eyebrow', 'Vision eyebrow'), f('vision_title', 'Vision sarlavhasi'), f('vision_text', 'Vision matni', 'paragraphs'),
    f('history_eyebrow', 'History eyebrow'), f('history_title', 'History sarlavhasi'), f('history_text', 'History & philosophy matni', 'paragraphs'),
    f('quote', 'PI iqtibosi', 'textarea'), f('quote_author', 'Iqtibos muallifi')] },
  home_explore: { page: 'home', label: 'Explore sarlavhasi', preview: '/#explore', fields: [f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha')] },
  home_contact: { page: 'home', label: 'Contact forma bo\'limi', preview: '/#contact-us', help: 'Bo\'lim Sozlamalar → "Contact formani ko\'rsatish" yoqilganda chiqadi.', fields: [
    f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha'), f('lede', 'Kirish matni', 'textarea'),
    f('form_title', 'Forma sarlavhasi'), f('info_title', 'Ma\'lumot bloki sarlavhasi'),
    f('subjects', 'Mavzu variantlari', 'list'), f('button_label', 'Tugma matni'), f('success_text', 'Yuborilgandan keyingi xabar', 'textarea'),
    f('map_title', 'Xarita sarlavhasi'), f('map_placeholder', 'Xarita yo\'q bo\'lganda matn')] },
  research_tabs: { page: 'research', label: 'Tab nomlari', preview: '/research.html', fields: [
    f('tab_areas', 'Research areas tabi'), f('tab_facilities', 'Facilities tabi'), f('tab_collab', 'Collaboration tabi')] },
  research_facilities: { page: 'research', label: 'Facilities sarlavhasi', preview: '/research.html#facilities', fields: [f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha'), f('lede', 'Kirish matni', 'textarea')] },
  research_facility_practice: { page: 'research', label: 'Facility in practice', preview: '/research.html#facilities', fields: [
    f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha'), f('text', 'Matn', 'paragraphs'),
    f('image', 'Rasm', 'image', { altField: 'image_alt' }), f('image_alt', 'Rasm alt matni'), f('caption', 'Rasm izohi')] },
  research_collab: { page: 'research', label: 'Collaboration sarlavhasi', preview: '/research.html#collaboration', fields: [
    f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha'), f('lede', 'Kirish matni', 'textarea'), f('sub_eyebrow', 'Hamkorlik turlari ustidagi yorliq')] },
  research_network: { page: 'research', label: 'Partner tarmog\'i bloki', preview: '/research.html#collaboration', fields: [
    f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha'), f('lede', 'Kirish matni', 'textarea'), f('note', 'Izoh (demo-note)', 'textarea')] },
  research_timeline: { page: 'research', label: 'Timeline sarlavhasi', preview: '/research.html#collaboration', fields: [f('eyebrow', 'Eyebrow'), f('title', 'Sarlavha')] },
  people_intro: { page: 'people', label: 'Izoh va guruh sarlavhalari', preview: '/people.html', fields: [
    f('note', 'Izoh (demo-note)', 'textarea'),
    f('pi_eyebrow', 'PI — eyebrow'), f('pi_title', 'PI — sarlavha'),
    f('core_eyebrow', 'Core team — eyebrow'), f('core_title', 'Core team — sarlavha'),
    f('doctoral_eyebrow', 'Doctoral — eyebrow'), f('doctoral_title', 'Doctoral — sarlavha'),
    f('technical_eyebrow', 'Technical — eyebrow'), f('technical_title', 'Technical — sarlavha')] },
  projects_intro: { page: 'projects', label: 'Loyiha kartasi sozlamasi', preview: '/projects.html', fields: [f('number_prefix', 'Raqam oldidagi so\'z', 'text', { help: '"Project 01 · Ongoing" dagi "Project"' })] },
  publications_intro: { page: 'publications', label: 'Izoh, qidiruv va tugmalar', preview: '/publications.html', fields: [
    f('note', 'Izoh (demo-note)', 'textarea'), f('search_placeholder', 'Qidiruv placeholder'), f('search_aria', 'Qidiruv aria-label'),
    f('count_text', 'Soni matni', 'text', { help: '{n} — ko\'rsatilgan, {total} — jami' }),
    f('all_years_label', '"Barcha yillar" matni'), f('all_areas_label', '"Barcha yo\'nalishlar" matni'), f('button_label', 'Tugma matni')] },
  search_intro: { page: 'search', label: 'Qidiruv matnlari', preview: '/search.html?q=oak', fields: [
    f('placeholder', 'Qidiruv maydoni placeholder'), f('button_label', 'Tugma matni'), f('header_aria', 'Header\'dagi belgi (aria-label)'),
    f('count_text', 'Natijalar soni matni', 'text', { help: '{n} — soni, {q} — qidirilgan so\'z' }),
    f('empty_text', 'Hech narsa topilmaganda', 'textarea'), f('start_text', 'Qidiruv boshlanmaganda', 'textarea'), f('open_label', 'Natija tugmasi matni'),
    f('type_news', 'Turi: yangilik'), f('type_publication', 'Turi: maqola'), f('type_person', 'Turi: xodim'), f('type_project', 'Turi: loyiha'),
    f('type_research', 'Turi: tadqiqot yo\'nalishi'), f('type_facility', 'Turi: facility'), f('type_collaboration', 'Turi: hamkorlik'),
    f('type_service', 'Turi: xizmat'), f('type_page', 'Turi: sahifa')] },
  news_intro: { page: 'news', label: 'Yangilik yorliqlari', preview: '/news.html', fields: [
    f('read_more_label', '"Read more" matni'), f('back_label', '"Back to all news" matni'), f('article_crumb', 'Maqola breadcrumb matni')] },
};

const PAGES = {
  home: { label: 'Home', url: '/' },
  research: { label: 'Research', url: '/research.html' },
  people: { label: 'People', url: '/people.html' },
  projects: { label: 'Projects', url: '/projects.html' },
  publications: { label: 'Publications', url: '/publications.html' },
  news: { label: 'News & Events', url: '/news.html' },
  services: { label: 'Services', url: '/services.html' },
  search: { label: 'Search', url: '/search.html' },
};
const PAGE_FIELDS = [
  f('breadcrumb', 'Breadcrumb', 'text', { group: 'Page hero' }), f('hero_title', 'Hero sarlavhasi', 'text', { group: 'Page hero' }),
  f('hero_lede', 'Hero kirish matni', 'textarea', { group: 'Page hero' }),
  f('seo_title', 'SEO title', 'text', { group: 'SEO' }), f('seo_description', 'SEO description', 'textarea', { group: 'SEO', max: 400 }),
  f('og_title', 'og:title', 'text', { group: 'SEO' }), f('og_description', 'og:description', 'textarea', { group: 'SEO', max: 400 }),
  f('og_image', 'og:image', 'image', { group: 'SEO' }),
  f('cta_enabled', 'CTA blokini ko\'rsatish', 'checkbox', { group: 'CTA (sahifa oxiri)' }),
  f('cta_eyebrow', 'CTA eyebrow', 'text', { group: 'CTA (sahifa oxiri)' }), f('cta_title', 'CTA sarlavhasi', 'text', { group: 'CTA (sahifa oxiri)' }),
  f('cta_label', 'CTA tugma matni', 'text', { group: 'CTA (sahifa oxiri)' }), f('cta_url', 'CTA tugma havolasi', 'url', { group: 'CTA (sahifa oxiri)' }),
];

const SETTINGS_FIELDS = [
  f('site_name', 'Sayt nomi', 'text', { group: 'Sayt', required: true }),
  f('brand_name', 'Header\'dagi nom', 'text', { group: 'Sayt' }),
  f('brand_tagline', 'Header\'dagi shior', 'text', { group: 'Sayt' }),
  f('logo', 'Logo', 'image', { group: 'Sayt', altField: 'logo_alt' }),
  f('logo_alt', 'Logo alt matni', 'text', { group: 'Sayt' }),
  f('favicon', 'Favicon', 'image', { group: 'Sayt' }),
  f('slide_interval', 'Hero slayd almashish vaqti (ms)', 'number', { group: 'Sayt', integer: true, min: 300, help: '1000 ms = 1 soniya' }),
  f('show_contact_form', 'Home sahifada contact formani ko\'rsatish', 'checkbox', { group: 'Sayt' }),
  f('show_search', 'Header\'da qidiruv belgisini ko\'rsatish', 'checkbox', { group: 'Sayt' }),
  f('show_hero_logo', 'Hero slayderda logoni ko\'rsatish', 'checkbox', { group: 'Sayt' }),
  f('email', 'Email', 'email', { group: 'Kontakt' }),
  f('phone', 'Telefon', 'text', { group: 'Kontakt' }),
  f('address_short', 'Manzil (footer)', 'textarea', { group: 'Kontakt', help: 'Har bir qator alohida chiqadi' }),
  f('address_full', 'To\'liq manzil (contact bo\'limi)', 'textarea', { group: 'Kontakt' }),
  f('office_hours', 'Ish vaqti', 'text', { group: 'Kontakt' }),
  f('research_email', 'Research inquiries email', 'email', { group: 'Kontakt' }),
  f('collab_email', 'Collaboration inquiries email', 'email', { group: 'Kontakt' }),
  f('map_url', 'Xarita embed havolasi (https)', 'url', { group: 'Kontakt', help: 'Google Maps → Share → Embed a map → src ichidagi havola' }),
  f('socials', 'Ijtimoiy tarmoqlar', 'repeater', { group: 'Footer', fields: [f('label', 'Qisqa belgi', 'text', { max: 4 }), f('aria', 'Nomi (aria-label)'), f('url', 'Havola', 'url')] }),
  f('footer_about', 'Footer matni', 'textarea', { group: 'Footer' }),
  f('footer_col1_title', '1-ustun sarlavhasi', 'text', { group: 'Footer' }),
  f('footer_col2_title', '2-ustun sarlavhasi', 'text', { group: 'Footer' }),
  f('footer_col3_title', 'Kontakt ustuni sarlavhasi', 'text', { group: 'Footer' }),
  f('copyright_text', 'Copyright matni', 'text', { group: 'Footer' }),
  f('privacy_label', 'Privacy havolasi matni', 'text', { group: 'Footer' }), f('privacy_url', 'Privacy havolasi', 'url', { group: 'Footer' }),
  f('terms_label', 'Terms havolasi matni', 'text', { group: 'Footer' }), f('terms_url', 'Terms havolasi', 'url', { group: 'Footer' }),
];

// Admin sidebar structure
const NAV = [
  { label: 'Umumiy', items: [['dashboard', 'Bosh panel'], ['settings', 'Sozlamalar', { adminOnly: true }], ['c:menu_items', 'Menyu', { adminOnly: true }]] },
  { label: 'Home', items: [['p:home', 'Sahifa: SEO'], ['c:hero_slides', 'Hero slaydlar'], ['b:home_hero', 'Hero tugmalari'], ['b:home_info', 'Info + Mission'], ['b:home_about', 'About us'], ['b:home_explore', 'Explore sarlavhasi'], ['c:explore_cards', 'Explore kartalar'], ['b:home_contact', 'Contact forma']] },
  { label: 'Research', items: [['p:research', 'Sahifa: hero, SEO, CTA'], ['b:research_tabs', 'Tab nomlari'], ['c:research_areas', 'Yo\'nalishlar'], ['b:research_facilities', 'Facilities sarlavhasi'], ['c:facilities', 'Facilities'], ['b:research_facility_practice', 'Facility in practice'], ['b:research_collab', 'Collaboration sarlavhasi'], ['c:collab_types', 'Hamkorlik turlari'], ['b:research_network', 'Partner tarmog\'i'], ['c:collab_locations', 'Xaritadagi joylar'], ['b:research_timeline', 'Timeline sarlavhasi'], ['c:collab_timeline', 'Timeline']] },
  { label: 'People', items: [['p:people', 'Sahifa: hero, SEO, CTA'], ['b:people_intro', 'Guruh sarlavhalari'], ['c:people', 'Xodimlar']] },
  { label: 'Projects', items: [['p:projects', 'Sahifa: hero, SEO, CTA'], ['b:projects_intro', 'Karta sozlamasi'], ['c:projects', 'Loyihalar']] },
  { label: 'Publications', items: [['p:publications', 'Sahifa: hero, SEO, CTA'], ['b:publications_intro', 'Izoh va filtrlar'], ['c:pub_categories', 'Kategoriyalar'], ['c:publications', 'Maqolalar']] },
  { label: 'News & Events', items: [['p:news', 'Sahifa: hero, SEO, CTA'], ['b:news_intro', 'Yorliqlar'], ['c:news', 'Yangiliklar']] },
  { label: 'Services', items: [['p:services', 'Sahifa: hero, SEO, CTA'], ['c:services', 'Xizmatlar']] },
  { label: 'Qidiruv', items: [['p:search', 'Sahifa: hero, SEO'], ['b:search_intro', 'Qidiruv matnlari']] },
  { label: 'Tizim', items: [['messages', 'Xabarlar'], ['media', 'Media kutubxona'], ['history', 'O\'zgarishlar tarixi'], ['users', 'Foydalanuvchilar', { adminOnly: true }], ['backup', 'Backup', { adminOnly: true }], ['profile', 'Profil']] },
];

// Serializable version for the admin client (functions → preview templates)
function clientModel() {
  const cols = {};
  for (const [k, c] of Object.entries(COLLECTIONS)) {
    cols[k] = { label: c.label, titleField: c.titleField, fields: c.fields, list: c.list, filters: c.filters || [], adminOnly: !!c.adminOnly,
      preview: k === 'news' ? '/news/{slug}.html' : c.preview({}) };
  }
  return { collections: cols, blocks: BLOCKS, pages: PAGES, pageFields: PAGE_FIELDS, settingsFields: SETTINGS_FIELDS, nav: NAV };
}

module.exports = { COLLECTIONS, BLOCKS, PAGES, PAGE_FIELDS, SETTINGS_FIELDS, NAV, clientModel };
