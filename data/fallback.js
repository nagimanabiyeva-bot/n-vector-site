/*
  Резервные данные сайта. Используются, пока Google Таблица не подключена
  (пустой API_URL в js/main.js) или недоступна.
  Записи со словом «Образец»/«Пример» в названии — заглушки, замените их реальными.
  Ключевой проект SeedMaster Systems оформлен отдельным блоком в index.html и projects.html,
  поэтому здесь в projects — только дополнительные проекты (пока их нет).
  Переводы: поле с суффиксом _en или _kz (например, bio_en) показывается на этом языке;
  если его нет — выводится основное (русское) поле. Те же столбцы можно добавить в Google Таблицу.
  Формат в .js (а не .json), чтобы сайт работал и при открытии index.html двойным щелчком.
*/
window.NV_FALLBACK = {
  team: [
    {
      id: 't1',
      name: 'Набиева Нагима Булатовна',
      name_en: 'Nagima Nabiyeva',
      role: 'CEO · Генеральный директор',
      role_en: 'CEO · Chief Executive Officer',
      role_kz: 'CEO · Бас директор',
      bio: 'Руководит стратегическим развитием компании, управлением проектами и взаимодействием с партнёрами. Соавтор патента №10734.',
      bio_en: "Leads the company's strategic development, project management and partner relations. Co-author of patent No. 10734.",
      bio_kz: 'Компанияның стратегиялық дамуына, жобаларды басқаруға және серіктестермен өзара іс-қимылға басшылық етеді. №10734 патенттің тең авторы.',
      tags: 'Управление проектами, Автоматизация, Агроинновации',
      tags_en: 'Project management, Automation, Agri-innovation',
      tags_kz: 'Жобаларды басқару, Автоматтандыру, Агроинновациялар',
      photo: 'img/team/nagima-nabiyeva.jpg',
      email: '',
      status: 'published',
    },
    {
      id: 't2',
      name: 'Набиев Наби Козыевич',
      name_en: 'Nabi Nabiyev',
      role: 'CTO · Технический директор',
      role_en: 'CTO · Chief Technology Officer',
      role_kz: 'CTO · Техникалық директор',
      bio: 'Отвечает за техническую архитектуру продуктов, разработку встраиваемых систем и патентование. Автор программного кода (свид. №52050), соавтор патента №10734.',
      bio_en: 'Responsible for product technical architecture, embedded systems development and patenting. Author of the software code (certificate No. 52050), co-author of patent No. 10734.',
      bio_kz: 'Өнімдердің техникалық архитектурасына, кіріктірілген жүйелерді әзірлеуге және патенттеуге жауапты. Бағдарламалық кодтың авторы (№52050 куәлік), №10734 патенттің тең авторы.',
      tags: 'Встраиваемые системы, Прошивки, IoT',
      tags_en: 'Embedded systems, Firmware, IoT',
      tags_kz: 'Кіріктірілген жүйелер, Микробағдарламалар, IoT',
      photo: '',
      email: '',
      status: 'published',
    },
  ],

  projects: [],

  events: [
    {
      id: 'e1',
      title: 'Образец: название мероприятия',
      title_en: 'Sample: event name',
      title_kz: 'Үлгі: іс-шара атауы',
      date: '2026-01-01',
      location: 'Город, площадка',
      location_en: 'City, venue',
      location_kz: 'Қала, алаң',
      description: 'Пример записи. Опишите участие компании и замените эту заглушку реальными данными.',
      description_en: "Sample entry. Describe the company's participation and replace this placeholder with real data.",
      description_kz: 'Үлгі жазба. Компанияның қатысуын сипаттап, бұл толтырғышты нақты деректермен ауыстырыңыз.',
      link: '',
      status: 'published',
    },
  ],

  programs: [
    {
      id: 'g1',
      type: 'Финансирование',
      name: 'QazInnovations',
      description: 'Национальное агентство технологического развития Республики Казахстан: гранты на коммерциализацию технологий и поддержку инновационных проектов.',
      description_en: 'National Agency for Technological Development of the Republic of Kazakhstan: grants for technology commercialisation and support for innovative projects.',
      description_kz: 'Қазақстан Республикасының Ұлттық технологиялық даму агенттігі: технологияларды коммерцияландыруға және инновациялық жобаларды қолдауға арналған гранттар.',
      deadline: '',
      link: 'https://qazinnovations.gov.kz/',
      status: 'published',
    },
    {
      id: 'g2',
      type: 'Инкубация-Акселерация',
      name: 'Astana Hub',
      description: 'Международный технопарк IT-стартапов: инкубационные и акселерационные программы, обучение и налоговые льготы для участников.',
      description_en: 'International technology park for IT startups: incubation and acceleration programmes, training and tax benefits for participants.',
      description_kz: 'IT-стартаптардың халықаралық технопаркі: инкубациялық және акселерациялық бағдарламалар, оқыту және қатысушыларға салықтық жеңілдіктер.',
      deadline: '',
      link: 'https://astanahub.com/',
      status: 'published',
    },
  ],
};
