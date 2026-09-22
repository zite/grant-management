/**
 * The demo organization: Riverbend Community Foundation. Every email address
 * is on a reserved example domain, so nothing seeded can ever reach a real
 * inbox — even if someone releases seeded decisions.
 */

export { DEMO_ORG } from './org';

export type MemberSeed = { key: string; name: string; email: string; role: 'Manager' | 'Reviewer'; title: string; expertise: string; status?: 'Active' | 'Invited'; bias: number };

export const MEMBERS: MemberSeed[] = [
  { key: 'priya', name: 'Priya Raman', email: 'priya.raman@riverbend.example.org', role: 'Manager', title: 'Director of Programs', expertise: 'Arts and culture, residencies', bias: 0.03 },
  { key: 'marcus', name: 'Marcus Chen', email: 'marcus.chen@riverbend.example.org', role: 'Manager', title: 'Grants Manager', expertise: 'Neighborhood grants, compliance', bias: -0.02 },
  { key: 'elena', name: 'Elena Vasquez', email: 'elena.vasquez@riverbend.example.org', role: 'Manager', title: 'Scholarship Program Officer', expertise: 'Education, youth development', bias: 0.01 },
  { key: 'tom', name: 'Tom Okafor', email: 'tom.okafor@riverbend.example.org', role: 'Manager', title: 'Finance Manager', expertise: 'Payments, audits', bias: 0 },
  { key: 'grace', name: 'Grace Liu', email: 'grace.liu@example.net', role: 'Reviewer', title: 'Community panelist', expertise: 'Visual and public art', bias: 0.09 },
  { key: 'samuel', name: 'Samuel Adeyemi', email: 'samuel.adeyemi@example.net', role: 'Reviewer', title: 'Community panelist', expertise: 'Music, festivals', bias: 0.02 },
  { key: 'hannah', name: 'Hannah Brooks', email: 'hannah.brooks@example.net', role: 'Reviewer', title: 'Retired high school teacher', expertise: 'Education, literacy', bias: 0 },
  { key: 'omar', name: 'Omar Haddad', email: 'omar.haddad@example.net', role: 'Reviewer', title: 'Community panelist', expertise: 'Theater, youth programs', bias: -0.13 },
  { key: 'lucia', name: 'Lucia Moreno', email: 'lucia.moreno@example.net', role: 'Reviewer', title: 'Neighborhood organizer', expertise: 'Housing, climate resilience', bias: 0.04 },
  { key: 'ben', name: 'Ben Carter', email: 'ben.carter@example.net', role: 'Reviewer', title: 'Board member', expertise: 'Finance, higher education', bias: -0.05 },
  { key: 'nadia', name: 'Nadia Petrova', email: 'nadia.petrova@example.net', role: 'Reviewer', title: 'Community panelist', expertise: 'Dance', status: 'Invited', bias: 0 },
];

export type ApplicantSeed = { key: string; name: string; email: string; phone: string; organization: string; location: string; website: string };

const A = (key: string, name: string, email: string, organization: string, location: string, website = '', phone = ''): ApplicantSeed => ({
  key,
  name,
  email,
  organization,
  location,
  website,
  phone: phone || `(555) 01${String(key.length).padStart(1, '0')}-${String(1000 + ((name.charCodeAt(0) * 37 + name.length * 91) % 9000))}`,
});

export const APPLICANTS: ApplicantSeed[] = [
  // Community Arts Grants
  A('rosa', 'Rosa Delgado', 'rosa.delgado@example.com', '', 'Riverbend', 'https://rosadelgado.example.com'),
  A('kenji', 'Kenji Watanabe', 'kenji@riverlight.example.org', 'Riverlight Collective', 'Riverbend', 'https://riverlight.example.org'),
  A('amara', 'Amara Okonkwo', 'amara.okonkwo@example.com', '', 'Alder County'),
  A('brassroots', 'Denise Holloway', 'denise@brassroots.example.org', 'Brass Roots Music Society', 'Riverbend', 'https://brassroots.example.org'),
  A('theo', 'Theo Lambert', 'theo.lambert@example.com', '', 'Mill District, Riverbend'),
  A('quilters', 'Margaret Ellison', 'margaret@marshquilters.example.org', 'Marsh County Quilters Guild', 'Marsh County'),
  A('framebyframe', 'Andre Wallace', 'andre@framebyframe.example.org', 'Frame by Frame Media', 'Riverbend', 'https://framebyframe.example.org'),
  A('jada', 'Jada Freeman', 'jada.freeman@example.com', '', 'Riverbend'),
  A('libraryfriends', 'Carol Nguyen', 'cnguyen@alderlibraryfriends.example.org', 'Friends of the Alder County Library', 'Alder County'),
  A('miguel', 'Miguel Santos', 'miguel.santos@example.com', '', 'Riverside, Riverbend', 'https://miguelsantos.example.com'),
  A('openhands', 'Rachel Kim', 'rachel@openhandsstudio.example.org', 'Open Hands Studio', 'Riverbend', 'https://openhandsstudio.example.org'),
  A('northgatesingers', 'Walter Briggs', 'walter@northgatesingers.example.org', 'Northgate Community Singers', 'Northgate, Riverbend'),
  A('lila', 'Lila Hart', 'lila.hart@example.com', '', 'Marsh County'),
  A('deafarts', 'Jamie Ortega', 'jamie@deafartsriverbend.example.org', 'Deaf Arts Riverbend', 'Riverbend', 'https://deafartsriverbend.example.org'),
  A('carlos', 'Carlos Ibarra', 'carlos.ibarra@example.com', '', 'Riverside, Riverbend'),
  A('devon', 'Devon Marshall', 'devon.marshall@example.com', '', 'Eastside, Riverbend', 'https://devonmarshall.example.com'),
  A('anna', 'Anna Lindqvist', 'anna.lindqvist@example.com', '', 'Alder County'),
  A('eastsidefood', 'Tasha Greene', 'tasha@eastsidefood.example.org', 'Eastside Food Collective', 'Eastside, Riverbend'),
  A('inkaxle', 'Jordan Pike', 'jordan@inkandaxle.example.com', 'Ink & Axle Print Co.', 'Riverbend'),
  A('svetlana', 'Svetlana Ivanova', 'svetlana.ivanova@example.com', 'Marsh Folk Dancers', 'Marsh County'),
  A('priyanka', 'Priyanka Shah', 'priyanka.shah@example.com', '', 'Riverbend'),
  A('isaac', 'Isaac Moreau', 'isaac.moreau@example.com', '', 'Old Town, Riverbend'),
  A('zines', 'Harper Quinn', 'harper@westendzines.example.org', 'West End Zine Library', 'West End, Riverbend'),
  A('eleanor', 'Eleanor Voss', 'eleanor.voss@example.com', '', 'Alder County'),
  A('chalk', 'Marco Bellini', 'marco@chalkfest.example.org', 'Riverbend Chalk Festival', 'Riverbend'),
  A('opera', 'Grace Adebayo', 'grace.adebayo@example.com', '', 'South Hills, Riverbend'),
  // Scholarship
  A('s_maya', 'Maya Johnson', 'maya.johnson@example.com', '', 'Riverbend'),
  A('s_ethan', 'Ethan Park', 'ethan.park@example.com', '', 'Alder County'),
  A('s_sofia', 'Sofia Hernandez', 'sofia.hernandez@example.com', '', 'Riverbend'),
  A('s_noah', 'Noah Williams', 'noah.williams@example.com', '', 'Marsh County'),
  A('s_aaliyah', 'Aaliyah Brown', 'aaliyah.brown@example.com', '', 'Eastside, Riverbend'),
  A('s_lucas', 'Lucas Nguyen', 'lucas.nguyen@example.com', '', 'Riverbend'),
  A('s_zara', 'Zara Ahmed', 'zara.ahmed@example.com', '', 'Northgate, Riverbend'),
  A('s_diego', 'Diego Ramirez', 'diego.ramirez@example.com', '', 'Riverside, Riverbend'),
  A('s_hana', 'Hana Sato', 'hana.sato@example.com', '', 'Alder County'),
  A('s_isaiah', 'Isaiah Thompson', 'isaiah.thompson@example.com', '', 'Riverbend'),
  A('s_chloe', 'Chloe Martin', 'chloe.martin@example.com', '', 'Marsh County'),
  A('s_amir', 'Amir Karimi', 'amir.karimi@example.com', '', 'West End, Riverbend'),
  A('s_olivia', 'Olivia Chen', 'olivia.chen@example.com', '', 'Riverbend'),
  A('s_jamal', 'Jamal Wright', 'jamal.wright@example.com', '', 'Eastside, Riverbend'),
  A('s_elena', 'Elena Popescu', 'elena.popescu@example.com', '', 'Alder County'),
  A('s_kai', 'Kai Robinson', 'kai.robinson@example.com', '', 'South Hills, Riverbend'),
  A('s_fatima', 'Fatima Diallo', 'fatima.diallo@example.com', '', 'Riverbend'),
  A('s_ryan', "Ryan O'Brien", 'ryan.obrien@example.com', '', 'Marsh County'),
  A('s_mei', 'Mei Lin', 'mei.lin@example.com', '', 'Riverbend'),
  A('s_andre', 'Andre Dubois', 'andre.dubois@example.com', '', 'Old Town, Riverbend'),
  // Neighborhood Resilience Fund
  A('n_toollib', 'Frank Morales', 'frank@eastsidetools.example.org', 'Eastside Tool Library', 'Eastside, Riverbend'),
  A('n_floodkits', 'Linda Park', 'linda@riversideneighbors.example.org', 'Riverside Neighbors Association', 'Riverside, Riverbend'),
  A('n_cooling', 'Ahmed Yusuf', 'ahmed@millcommunity.example.org', 'Mill District Community Council', 'Mill District, Riverbend'),
  A('n_trees', 'Beth Sullivan', 'beth@northgategreen.example.org', 'Northgate Green Team', 'Northgate, Riverbend'),
  A('n_blockparty', 'Oscar Grant', 'oscar@oldtownblock.example.org', 'Old Town 400 Block Club', 'Old Town, Riverbend'),
  A('n_snow', 'Patricia Lowe', 'patricia@southhills.example.org', 'South Hills Neighbors', 'South Hills, Riverbend'),
  A('n_fridge', 'Keisha Barnes', 'keisha@westendfridge.example.org', 'West End Community Fridge', 'West End, Riverbend'),
  A('n_raingardens', 'Victor Chen', 'victor@riversideraingardens.example.org', 'Riverside Rain Garden Crew', 'Riverside, Riverbend'),
  A('n_phonetree', 'Dorothy Hayes', 'dorothy@eastsideseniors.example.org', 'Eastside Seniors Circle', 'Eastside, Riverbend'),
  A('n_pantries', 'Sam Rivera', 'sam@northgatepantries.example.org', 'Northgate PTA', 'Northgate, Riverbend'),
  A('n_bikes', 'Tyrell Jackson', 'tyrell@millbikes.example.org', 'Mill District Bike Kitchen', 'Mill District, Riverbend'),
  A('n_radio', 'Helen Marsh', 'helen@oldtownradio.example.org', 'Old Town Emergency Radio Club', 'Old Town, Riverbend'),
  A('n_chipping', 'Greg Nolan', 'greg@southhillsfire.example.org', 'South Hills Firewise Committee', 'South Hills, Riverbend'),
  A('n_generators', 'Rita Alvarez', 'rita@westendpower.example.org', 'West End Resident Council', 'West End, Riverbend'),
  // Residency
  A('r_jonas', 'Jonas Reyes', 'jonas.reyes@example.com', '', 'Alder County', 'https://jonasreyes.example.com'),
  A('r_mei', 'Mei Tanaka', 'mei.tanaka@example.com', '', 'Riverbend', 'https://meitanaka.example.com'),
  A('r_peter', 'Peter Novak', 'peter.novak@example.com', '', 'Marsh County'),
  A('r_aisha', 'Aisha Bello', 'aisha.bello@example.com', '', 'Riverbend', 'https://aishabello.example.com'),
  A('r_liam', "Liam O'Connor", 'liam.oconnor@example.com', '', 'Alder County'),
  A('r_sofia', 'Sofia Rossi', 'sofia.rossi@example.com', '', 'Riverbend'),
];

export const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
export const img = (id: string) => `https://images.unsplash.com/${id}?w=1200&h=800&fit=crop&q=80`;

export type ArtsStage = 'received' | 'screen' | 'panel' | 'final' | 'declined' | 'draft';

export type ArtsSeed = {
  applicant: string;
  type: 'o_individual' | 'o_nonprofit' | 'o_collective' | 'o_business';
  title: string;
  discipline: string;
  amount: number;
  description: string;
  community: string;
  venues: string[];
  bio: string;
  budgetNote?: string;
  quality: number;
  stage: ArtsStage;
  daysAgo: number;
  labels?: string[];
  samples?: string[];
};

export const ARTS: ArtsSeed[] = [
  {
    applicant: 'rosa', type: 'o_individual', title: 'Murals for Maple Street', discipline: 'd_visual', amount: 8500, quality: 0.86, stage: 'panel', daysAgo: 31,
    bio: 'Rosa Delgado is a muralist who has painted eleven public walls across the river valley, most recently the Riverside Library children’s wing. She teaches drawing at the community college.',
    description: 'Maple Street has lost four businesses in three years, and its blank storefronts have become the first thing visitors see. I will work with the remaining merchants and residents to design and paint five murals on donated walls, each telling a story collected from someone who has lived on the street for decades.\n\nEach mural will be painted over two weekends with open painting days, so neighbors can pick up a brush on the parts that are safe for beginners.',
    community: 'Maple Street is walking distance from two elementary schools and the Eastside senior center. I will hold story-collecting sessions at the senior center and a design night at Garfield Elementary, and the open painting days will be announced through the merchants’ association and the Eastside newsletter.',
    venues: ['v_outdoor', 'v_center'], budgetNote: 'Most of the budget is paint and anti-graffiti coating ($3,900) and artist fees for me and two assistants. The merchants are donating wall prep and lift rental.',
    labels: ['Board interest'], samples: ['photo-1499781350541-7783f6c6a0c8', 'photo-1561059488-916d69792237'],
  },
  {
    applicant: 'kenji', type: 'o_collective', title: 'Lanterns on the Levee', discipline: 'd_multi', amount: 10000, quality: 0.91, stage: 'received', daysAgo: 0.2,
    bio: 'Riverlight Collective is six artists and educators who have organized the Riverbend winter lantern walk since 2021. Last year 1,400 people joined the walk.',
    description: 'We will run twelve free lantern-making workshops in libraries and community centers from October to December, culminating in a lantern procession along the levee trail on the longest night of the year.\n\nThis year we are adding a sound component with the Northgate Community Singers, and building lanterns large enough to be carried by wheelchair users on the accessible section of the trail.',
    community: 'Workshops rotate through all seven neighborhoods and are scheduled in the early evening so working families can attend. We provide all materials, childcare at every session and ASL interpretation at the procession.',
    venues: ['v_outdoor', 'v_library', 'v_center'], budgetNote: 'Materials for 600 lanterns, artist fees for twelve workshops, interpreters, childcare and event insurance for the procession.',
    labels: ['Youth-focused'], samples: ['photo-1512389142860-9c449e58a543'],
  },
  {
    applicant: 'amara', type: 'o_individual', title: 'The Kitchen Table Stories', discipline: 'd_literary', amount: 4200, quality: 0.78, stage: 'panel', daysAgo: 27,
    bio: 'Amara Okonkwo is a poet and oral historian. Her chapbook “Where the River Bends” was a finalist for the Great Lakes Book Award.',
    description: 'Over six months I will record conversations with twenty elders around their own kitchen tables and shape those conversations into a chapbook of prose poems. Each participant will receive printed copies, and the recordings will be donated to the county historical society.',
    community: 'Participants will come from the Alder County senior meal program. I will hold two public readings at the Alder County Library where elders can read their own pieces if they wish.',
    venues: ['v_library', 'v_center'], labels: ['First-time applicant'],
  },
  {
    applicant: 'brassroots', type: 'o_nonprofit', title: 'Second Line Sundays', discipline: 'd_music', amount: 9000, quality: 0.83, stage: 'panel', daysAgo: 29,
    bio: 'Brass Roots Music Society has taught brass instruments to more than 300 young people since 2016 and fields a 25-piece community band.',
    description: 'Second Line Sundays brings free brass band performances to a different neighborhood park on the first Sunday of every month from May to October. Before each performance, our youth band leads a one-hour instrument petting zoo and lesson for kids.',
    community: 'We choose parks in neighborhoods with the fewest arts events, based on the city’s cultural asset map. Families learn about events through the parks department, school backpack flyers and our partners at three churches.',
    venues: ['v_outdoor'], budgetNote: 'Musician stipends ($4,800), instrument repair, portable sound and permits.',
    labels: ['Youth-focused'],
  },
  {
    applicant: 'theo', type: 'o_individual', title: 'Shadow Puppets of the Mill District', discipline: 'd_theater', amount: 3800, quality: 0.62, stage: 'panel', daysAgo: 22,
    bio: 'Theo Lambert is a puppeteer who performed with a touring shadow theater company for eight years before moving to the Mill District.',
    description: 'A shadow puppet play about the 1937 mill strike, performed in the old boiler room of the Mill Street Lofts. Neighbors will help build puppets in four workshops, and the final show will run for two weekends.',
    community: 'The Mill District Community Council will promote the workshops. Tickets will be pay-what-you-can.',
    venues: ['v_gallery'], budgetNote: 'Materials, projector, and venue insurance.',
  },
  {
    applicant: 'quilters', type: 'o_collective', title: 'Quilting the Watershed', discipline: 'd_folk', amount: 2500, quality: 0.72, stage: 'panel', daysAgo: 25,
    bio: 'The Marsh County Quilters Guild has met every Tuesday since 1982. Our 40 members range in age from 19 to 91.',
    description: 'A 12-foot story quilt mapping the Marsh River watershed, made from fabric donated by residents who live along it. The finished quilt will tour five small-town libraries in the county before hanging permanently at the county courthouse.',
    community: 'Anyone can donate fabric or join our Tuesday sewing sessions. We will host a “bring your scraps” day in each of the five towns.',
    venues: ['v_library'], labels: ['Rural'],
  },
  {
    applicant: 'framebyframe', type: 'o_nonprofit', title: 'Youth Film Lab', discipline: 'd_film', amount: 10000, quality: 0.8, stage: 'panel', daysAgo: 30,
    bio: 'Frame by Frame Media teaches documentary filmmaking to teenagers. Our students’ films have screened at eight festivals.',
    description: 'A twelve-week summer lab where 16 teenagers from Riverbend high schools make short documentaries about people who keep their neighborhoods running — crossing guards, bus drivers, corner store owners. The lab ends with a public screening at the Riverfront Theater.',
    community: 'We recruit through school counselors and prioritize students who have never had access to media programs. Students receive a $600 stipend so they can take part instead of working a summer job.',
    venues: ['v_gallery', 'v_online'], budgetNote: 'Student stipends are the largest line. Equipment is already owned.',
    labels: ['Youth-focused', 'Budget question'],
  },
  {
    applicant: 'jada', type: 'o_individual', title: 'Poetry on the Bus', discipline: 'd_literary', amount: 1800, quality: 0.69, stage: 'panel', daysAgo: 19,
    bio: 'Jada Freeman is a spoken-word poet and Riverbend’s 2025 youth poet laureate runner-up.',
    description: 'Poems by riders, printed on placards in 60 Riverbend Transit buses for six months. I will collect poems at bus stops with a pop-up typewriter table and through an online form.',
    community: 'Riverbend Transit carries 18,000 riders a day. The typewriter table will visit the six busiest stops.',
    venues: ['v_outdoor', 'v_online'],
  },
  {
    applicant: 'libraryfriends', type: 'o_nonprofit', title: 'Dance in the Stacks', discipline: 'd_dance', amount: 6000, quality: 0.75, stage: 'panel', daysAgo: 24,
    bio: 'Friends of the Alder County Library supports programs at the county’s seven branch libraries.',
    description: 'Site-specific dance performances in three rural library branches, created with local dancers and choreographer Mira Solano. Each branch hosts a free movement workshop for all ages before its performance.',
    community: 'Our branches are often the only public gathering spaces in their towns. We will partner with each branch’s existing story-time and senior programs.',
    venues: ['v_library'], labels: ['Rural'],
  },
  {
    applicant: 'miguel', type: 'o_individual', title: 'Sounds of the Riverfront', discipline: 'd_music', amount: 5500, quality: 0.55, stage: 'panel', daysAgo: 20,
    bio: 'Miguel Santos is a composer and sound designer.',
    description: 'A sound walk along the riverfront trail with compositions triggered by location on listeners’ phones.',
    community: 'The app will be free to download. I will post about it online.',
    venues: ['v_outdoor', 'v_online'], budgetNote: 'App development is most of the cost.',
  },
  {
    applicant: 'openhands', type: 'o_nonprofit', title: 'Ceramics for Recovery', discipline: 'd_visual', amount: 7200, quality: 0.88, stage: 'final', daysAgo: 36,
    bio: 'Open Hands Studio is a nonprofit ceramics studio offering free classes to people in recovery from addiction.',
    description: 'A year of weekly wheel-throwing classes for residents of two local recovery houses, ending in a public exhibition and sale where artists keep 100% of proceeds. Participants who complete the program can become studio assistants.',
    community: 'Classes are referred through Hope House and Riverside Recovery. The exhibition will be at the Riverbend Arts Center, with a reception open to families.',
    venues: ['v_gallery', 'v_center'], budgetNote: 'Clay, glaze and kiln firing ($2,400), instructor fees and transportation passes.',
    labels: ['Board interest'],
  },
  {
    applicant: 'northgatesingers', type: 'o_collective', title: 'Northgate Community Choir Festival', discipline: 'd_music', amount: 4000, quality: 0.82, stage: 'final', daysAgo: 34,
    bio: 'Northgate Community Singers is an unauditioned choir of 60 neighbors.',
    description: 'A one-day festival bringing together eight community choirs — church, school, workplace and immigrant community choirs — for performances and a mass sing in Northgate Park.',
    community: 'Every participating choir brings its own audience. The festival is free, and we are partnering with two food trucks owned by Northgate residents.',
    venues: ['v_outdoor'],
  },
  {
    applicant: 'lila', type: 'o_individual', title: 'Paper Boats', discipline: 'd_visual', amount: 1200, quality: 0.52, stage: 'screen', daysAgo: 9,
    bio: 'Lila Hart is an emerging artist.',
    description: 'An installation of 1,000 paper boats folded by residents, floated on the town pond for one evening.',
    community: 'I will hand out paper at the farmers market.',
    venues: ['v_outdoor'], labels: ['First-time applicant', 'Rural'],
  },
  {
    applicant: 'deafarts', type: 'o_nonprofit', title: 'Stories in Sign', discipline: 'd_theater', amount: 8000, quality: 0.87, stage: 'screen', daysAgo: 8,
    bio: 'Deaf Arts Riverbend produces theater by and for Deaf and hard-of-hearing artists.',
    description: 'An original play in American Sign Language with spoken-English voicing, developed with Deaf elders who attended the state school for the Deaf. Four public performances at the Riverfront Theater, with a post-show conversation each night.',
    community: 'Performances are fully accessible to Deaf and hearing audiences alike. We will offer an introductory sign workshop before each show.',
    venues: ['v_gallery'],
  },
  {
    applicant: 'carlos', type: 'o_individual', title: 'Mosaic Benches at Riverside Park', discipline: 'd_visual', amount: 6800, quality: 0.7, stage: 'screen', daysAgo: 7,
    bio: 'Carlos Ibarra is a tile setter and mosaic artist.',
    description: 'Four concrete benches in Riverside Park covered in mosaics designed from drawings by kids at the park’s summer camp.',
    community: 'The parks department has approved the benches. Campers and their families will help set tiles over two Saturdays.',
    venues: ['v_outdoor'],
  },
  {
    applicant: 'devon', type: 'o_individual', title: 'Hip-Hop Heritage Archive', discipline: 'd_multi', amount: 9500, quality: 0.77, stage: 'screen', daysAgo: 6,
    bio: 'Devon Marshall is a DJ, producer and archivist.',
    description: 'Digitizing 400 cassette mixtapes, flyers and photos from Riverbend’s hip-hop scene of the 1990s, and presenting them in a pop-up listening room and online archive.',
    community: 'Artists from the era will host listening nights. The online archive will be free and searchable.',
    venues: ['v_gallery', 'v_online'],
  },
  {
    applicant: 'anna', type: 'o_individual', title: 'The Ferry Songs', discipline: 'd_music', amount: 3000, quality: 0.6, stage: 'received', daysAgo: 3,
    bio: 'Anna Lindqvist is a folk singer and fiddler.',
    description: 'An album of songs about the last river ferry, recorded with former ferry workers telling their stories between tracks.',
    community: 'Release concerts at two county libraries and free streaming.',
    venues: ['v_library', 'v_online'],
  },
  {
    applicant: 'eastsidefood', type: 'o_collective', title: 'Painting the Pantry', discipline: 'd_visual', amount: 2200, quality: 0.66, stage: 'received', daysAgo: 2,
    bio: 'Eastside Food Collective runs a volunteer food pantry serving 250 families a week.',
    description: 'Transforming the pantry’s waiting area with murals and hand-painted shelving made with the families we serve, so the space feels welcoming rather than institutional.',
    community: 'Painting sessions will happen during pantry hours, with materials for kids.',
    venues: ['v_center'],
  },
  {
    applicant: 'inkaxle', type: 'o_collective', title: 'Big Sky Printmaking Van', discipline: 'd_visual', amount: 9800, quality: 0.6, stage: 'declined', daysAgo: 18,
    bio: 'Ink & Axle is a mobile printmaking studio.',
    description: 'A converted van that brings letterpress printing to small-town festivals.',
    community: 'We will bring the van to county fairs.',
    venues: ['v_outdoor'],
  },
  {
    applicant: 'svetlana', type: 'o_collective', title: 'Marsh County Folk Dance Revival', discipline: 'd_folk', amount: 5000, quality: 0.74, stage: 'received', daysAgo: 1,
    bio: 'Marsh Folk Dancers teach Eastern European folk dance to families.',
    description: 'Monthly dance nights with live musicians in three Grange halls, teaching dances brought to the county by immigrant families a century ago.',
    community: 'Grange halls are at the heart of these towns. Everyone is welcome, no experience or partner needed.',
    venues: ['v_center'], labels: ['Rural'],
  },
  // Drafts — started, not submitted.
  { applicant: 'priyanka', type: 'o_individual', title: 'Light Garden', discipline: 'd_visual', amount: 7000, quality: 0.7, stage: 'draft', daysAgo: 5, bio: '', description: 'An installation of solar lanterns in the community garden, designed with', community: '', venues: [] },
  { applicant: 'isaac', type: 'o_individual', title: '', discipline: 'd_film', amount: 0, quality: 0.5, stage: 'draft', daysAgo: 12, bio: 'Documentary filmmaker.', description: '', community: '', venues: [] },
  { applicant: 'zines', type: 'o_collective', title: 'Community Zine Library', discipline: 'd_literary', amount: 3000, quality: 0.6, stage: 'draft', daysAgo: 2, bio: 'We run a volunteer zine library in the West End.', description: 'We want to expand our zine library into two new neighborhoods and host monthly zine-making nights.', community: 'Zine nights at the West End community center.', venues: ['v_center'] },
  { applicant: 'eleanor', type: 'o_individual', title: 'Cello at the Care Home', discipline: 'd_music', amount: 2000, quality: 0.6, stage: 'draft', daysAgo: 8, bio: '', description: '', community: '', venues: [] },
  { applicant: 'chalk', type: 'o_nonprofit', title: 'Riverbend Chalk Festival', discipline: 'd_visual', amount: 10000, quality: 0.6, stage: 'draft', daysAgo: 1, bio: 'The chalk festival has run for six years.', description: 'Our seventh annual chalk festival, with 80 artists on the courthouse square.', community: '', venues: ['v_outdoor'] },
  { applicant: 'opera', type: 'o_individual', title: 'Neighborhood Opera', discipline: 'd_music', amount: 6500, quality: 0.6, stage: 'draft', daysAgo: 15, bio: 'Grace Adebayo is a soprano.', description: 'A short opera sung from front porches on one South Hills street.', community: 'Neighbors host singers on their porches.', venues: ['v_outdoor'] },
];

export type ScholarshipStage = 'committee' | 'interviews' | 'accepted' | 'waitlisted' | 'declined' | 'ineligible' | 'withdrawn';

export type ScholarshipSeed = {
  applicant: string;
  field: string;
  school: string;
  level: string;
  gpa: number;
  goals: string;
  leadership: string;
  need?: string;
  firstGen: boolean;
  quality: number;
  stage: ScholarshipStage;
  daysAgo: number;
  labels?: string[];
};

export const SCHOLARSHIP: ScholarshipSeed[] = [
  { applicant: 's_maya', field: 'Environmental Engineering', school: 'State University', level: 'l_first', gpa: 3.9, firstGen: true, quality: 0.92, stage: 'accepted', daysAgo: 16,
    goals: 'I want to design water systems for towns like mine, where the treatment plant is sixty years old and every spring flood turns the tap water brown. I plan to study environmental engineering and return to work for the county utility.',
    leadership: 'When our high school’s recycling program was cut, I organized twenty students to run it ourselves. We diverted four tons of cardboard in a year and convinced the district to restore a paid coordinator.',
    need: 'My mom works two jobs. This scholarship would mean I can take a lab assistant position instead of a second job.' },
  { applicant: 's_ethan', field: 'Nursing', school: 'Alder Community College', level: 'l_second', gpa: 3.6, firstGen: false, quality: 0.84, stage: 'accepted', daysAgo: 20,
    goals: 'I became a certified nursing assistant at 17 and have worked nights at a care home ever since. I want to become a registered nurse specializing in geriatric care.',
    leadership: 'I started a pen-pal program between residents at my care home and a fourth-grade class. It has run for two years.' },
  { applicant: 's_sofia', field: 'Education', school: 'Riverbend State College', level: 'l_first', gpa: 3.7, firstGen: true, quality: 0.88, stage: 'accepted', daysAgo: 12,
    goals: 'I want to be a bilingual elementary teacher. I translated for my parents at every parent-teacher conference growing up, and I want families like mine to feel at home in their child’s school.',
    leadership: 'I tutor English learners at the library every Saturday and trained six other volunteers to do the same.' },
  { applicant: 's_noah', field: 'Agricultural Science', school: 'State University', level: 'l_first', gpa: 3.4, firstGen: false, quality: 0.74, stage: 'waitlisted', daysAgo: 25,
    goals: 'My family farms 300 acres in Marsh County. I want to study soil science and help farms like ours adapt to wetter springs and drier summers.',
    leadership: 'I lead our 4-H chapter’s community garden, which donates vegetables to the county food shelf.' },
  { applicant: 's_aaliyah', field: 'Computer Science', school: 'Riverbend State College', level: 'l_third', gpa: 3.2, firstGen: true, quality: 0.58, stage: 'declined', daysAgo: 11,
    goals: 'I want to work in software.',
    leadership: 'I help at my church.' },
  { applicant: 's_lucas', field: 'Social Work', school: 'State University', level: 'l_fourth', gpa: 3.5, firstGen: false, quality: 0.8, stage: 'interviews', daysAgo: 22,
    goals: 'I spent three years in foster care. I want to become a social worker who helps teenagers age out of the system with a plan and a network.',
    leadership: 'I co-founded a peer mentoring group for foster youth at my high school that now has chapters at two other schools.' },
  { applicant: 's_zara', field: 'Public Health', school: 'Riverbend State College', level: 'l_second', gpa: 3.8, firstGen: true, quality: 0.86, stage: 'interviews', daysAgo: 18,
    goals: 'I want to study public health to understand why asthma rates in Northgate are twice the county average, and what we can do about it.',
    leadership: 'I organized free asthma screenings at my mosque with a local clinic. We screened 140 people in one weekend.' },
  { applicant: 's_diego', field: 'Mechanical Engineering Technology', school: 'Alder Community College', level: 'l_first', gpa: 3.3, firstGen: true, quality: 0.79, stage: 'interviews', daysAgo: 17,
    goals: 'I rebuild small engines in my uncle’s shop. I want to earn my associate degree and become a maintenance technician at the wind farm.',
    leadership: 'I teach free bike repair clinics for kids in Riverside every summer.' },
  { applicant: 's_hana', field: 'Music Education', school: 'State University', level: 'l_third', gpa: 3.9, firstGen: false, quality: 0.83, stage: 'interviews', daysAgo: 14,
    goals: 'I want to teach music in rural schools, where programs are the first thing cut.',
    leadership: 'I started a free summer strings camp in Alder County that taught 30 kids to play violin.' },
  { applicant: 's_isaiah', field: 'Criminal Justice', school: 'Riverbend State College', level: 'l_second', gpa: 3.1, firstGen: true, quality: 0.71, stage: 'interviews', daysAgo: 21,
    goals: 'I want to become a public defender.',
    leadership: 'I volunteer at a youth court program that gives teens an alternative to juvenile court.' },
  { applicant: 's_chloe', field: 'Veterinary Technology', school: 'Alder Community College', level: 'l_first', gpa: 3.6, firstGen: false, quality: 0.76, stage: 'committee', daysAgo: 13,
    goals: 'I want to become a veterinary technician and eventually open a low-cost clinic in Marsh County.',
    leadership: 'I foster kittens for the county shelter and have placed over 60 in homes.' },
  { applicant: 's_amir', field: 'Architecture', school: 'State University', level: 'l_first', gpa: 3.8, firstGen: true, quality: 0.81, stage: 'committee', daysAgo: 15,
    goals: 'I want to design affordable housing that people are proud to live in.',
    leadership: 'I led a team that built a wheelchair ramp for a neighbor through our youth group.' },
  { applicant: 's_olivia', field: 'Biology', school: 'Riverbend State College', level: 'l_second', gpa: 3.95, firstGen: false, quality: 0.69, stage: 'committee', daysAgo: 19,
    goals: 'I plan to go to medical school.',
    leadership: 'I am president of the science club.' },
  { applicant: 's_jamal', field: 'Business Administration', school: 'Riverbend State College', level: 'l_third', gpa: 3.4, firstGen: true, quality: 0.77, stage: 'committee', daysAgo: 23,
    goals: 'I want to help small businesses on the Eastside get access to capital. I run the books for my dad’s barbershop.',
    leadership: 'I started a free financial literacy workshop for teenagers at the Eastside community center.' },
  { applicant: 's_elena', field: 'Linguistics', school: 'State University', level: 'l_grad', gpa: 3.7, firstGen: false, quality: 0.73, stage: 'committee', daysAgo: 10,
    goals: 'I study language revitalization and want to work with communities documenting endangered languages.',
    leadership: 'I volunteer as a Romanian interpreter at the county hospital.' },
  { applicant: 's_kai', field: 'Graphic Design', school: 'Alder Community College', level: 'l_first', gpa: 3.2, firstGen: false, quality: 0.64, stage: 'committee', daysAgo: 9,
    goals: 'I want to be a designer.',
    leadership: 'I made posters for our school play.' },
  { applicant: 's_fatima', field: 'Pharmacy', school: 'State University', level: 'l_fourth', gpa: 3.85, firstGen: true, quality: 0.89, stage: 'committee', daysAgo: 24,
    goals: 'My neighborhood pharmacy closed and elders now take two buses for prescriptions. I want to become a pharmacist and open a community pharmacy on the Eastside.',
    leadership: 'I coordinate a prescription pickup service run by volunteers from my college’s pre-health society.' },
  { applicant: 's_ryan', field: 'Electrical Lineworker Program', school: 'Alder Community College', level: 'l_first', gpa: 2.9, firstGen: true, quality: 0.7, stage: 'committee', daysAgo: 12,
    goals: 'I want to become a lineworker and keep the power on for rural towns during storms.',
    leadership: 'I volunteered with the fire department during last spring’s floods, filling sandbags for three days.' },
  { applicant: 's_mei', field: 'Nursing', school: 'State University', level: 'l_second', gpa: 3.6, firstGen: false, quality: 0.6, stage: 'ineligible', daysAgo: 30,
    goals: 'I want to become a nurse.', leadership: 'I volunteer at a hospital.' },
  { applicant: 's_andre', field: 'History', school: 'Riverbend State College', level: 'l_second', gpa: 3.5, firstGen: false, quality: 0.7, stage: 'withdrawn', daysAgo: 28,
    goals: 'I want to teach history.', leadership: 'I lead tours at the county museum.' },
];

export type NrfStage = 'new' | 'review' | 'accepted_active' | 'accepted_complete' | 'declined';

export type NrfSeed = {
  applicant: string;
  group: string;
  title: string;
  neighborhood: string;
  amount: number;
  award?: number;
  description: string;
  volunteers: number;
  quality: number;
  stage: NrfStage;
  daysAgo: number;
  labels?: string[];
};

export const NRF: NrfSeed[] = [
  { applicant: 'n_toollib', group: 'g_nonprofit', title: 'Storm Cleanup Tool Kits', neighborhood: 'n_eastside', amount: 2500, award: 2500, volunteers: 18, quality: 0.85, stage: 'accepted_complete', daysAgo: 170,
    description: 'We will buy chainsaws, pumps, tarps and safety gear that neighbors can borrow for free after storms, and train 40 residents to use them safely.' },
  { applicant: 'n_floodkits', group: 'g_association', title: 'Riverside Flood Go-Bags', neighborhood: 'n_riverside', amount: 2000, award: 2000, volunteers: 25, quality: 0.83, stage: 'accepted_complete', daysAgo: 150,
    description: 'Two hundred go-bags for households in the floodplain, assembled at a neighborhood packing party and delivered door to door with a printed evacuation map.' },
  { applicant: 'n_cooling', group: 'g_association', title: 'Mill District Cooling Volunteers', neighborhood: 'n_mill', amount: 1800, award: 1500, volunteers: 30, quality: 0.8, stage: 'accepted_active', daysAgo: 95,
    description: 'Volunteers who check on elderly neighbors during heat waves, with fans, water and a phone list connecting everyone on the six hottest blocks.' },
  { applicant: 'n_trees', group: 'g_resident', title: 'Northgate Shade Trees', neighborhood: 'n_northgate', amount: 2500, award: 2500, volunteers: 45, quality: 0.87, stage: 'accepted_active', daysAgo: 80,
    description: 'Planting 60 shade trees along Northgate Avenue, where summer pavement temperatures are the highest in the city, with a watering schedule adopted by the households on each block.' },
  { applicant: 'n_blockparty', group: 'g_resident', title: 'Old Town Preparedness Block Party', neighborhood: 'n_oldtown', amount: 1200, award: 1000, volunteers: 12, quality: 0.72, stage: 'accepted_active', daysAgo: 60,
    description: 'A block party with a preparedness fair: CPR demos, a smoke detector giveaway and a sign-up sheet for a block phone tree.' },
  { applicant: 'n_fridge', group: 'g_nonprofit', title: 'West End Community Fridge Backup Power', neighborhood: 'n_westend', amount: 2400, award: 2200, volunteers: 20, quality: 0.84, stage: 'accepted_active', daysAgo: 45,
    description: 'A battery backup and solar panel so the community fridge keeps food safe during outages, which happened nine times last year.' },
  { applicant: 'n_snow', group: 'g_association', title: 'South Hills Snow Buddies', neighborhood: 'n_southhills', amount: 900, volunteers: 15, quality: 0.5, stage: 'declined', daysAgo: 110,
    description: 'Matching teenagers with elderly neighbors to shovel sidewalks.' },
  { applicant: 'n_bikes', group: 'g_nonprofit', title: 'Bike Repair Pop-ups', neighborhood: 'n_mill', amount: 2500, volunteers: 6, quality: 0.46, stage: 'declined', daysAgo: 70,
    description: 'Free bike repair at the farmers market.' },
  { applicant: 'n_generators', group: 'g_association', title: 'Shared Generator Co-op', neighborhood: 'n_westend', amount: 2500, volunteers: 4, quality: 0.42, stage: 'declined', daysAgo: 40,
    description: 'Buying a generator that members can share.' },
  { applicant: 'n_raingardens', group: 'g_resident', title: 'Riverside Rain Gardens', neighborhood: 'n_riverside', amount: 1600, volunteers: 22, quality: 0.78, stage: 'review', daysAgo: 12,
    description: 'Ten rain gardens in front yards on the streets that flood first, built at weekend work parties with plants from the county conservation district.', labels: ['Needs follow-up'] },
  { applicant: 'n_phonetree', group: 'g_resident', title: 'Eastside Seniors Phone Tree', neighborhood: 'n_eastside', amount: 600, volunteers: 14, quality: 0.8, stage: 'review', daysAgo: 9,
    description: 'Printed directories, a volunteer caller network and a quarterly drill so no senior on the Eastside goes a day without a check-in during an emergency.' },
  { applicant: 'n_pantries', group: 'g_school', title: 'Little Free Pantries at Northgate Elementary', neighborhood: 'n_northgate', amount: 1400, volunteers: 30, quality: 0.74, stage: 'review', daysAgo: 6,
    description: 'Three weatherproof pantry boxes near the school, stocked weekly by PTA families.' },
  { applicant: 'n_radio', group: 'g_nonprofit', title: 'Emergency Radio Training', neighborhood: 'n_oldtown', amount: 2100, volunteers: 10, quality: 0.76, stage: 'new', daysAgo: 2,
    description: 'Training and licensing 20 residents as amateur radio operators, so Old Town can communicate when cell networks fail.' },
  { applicant: 'n_chipping', group: 'g_association', title: 'Wildfire Chipping Day', neighborhood: 'n_southhills', amount: 1900, volunteers: 35, quality: 0.8, stage: 'new', daysAgo: 1,
    description: 'Renting a chipper for two weekends so residents can clear brush from around their homes before fire season.' },
];

export type ResidencySeed = { applicant: string; title: string; discipline: string; bio: string; proposal: string; session: string; quality: number; accepted: boolean };

export const RESIDENCY: ResidencySeed[] = [
  { applicant: 'amara', title: 'Tidelines', discipline: 'd_writing', session: 'p_summer', quality: 0.9, accepted: true,
    bio: 'Amara Okonkwo is a poet and oral historian from Alder County.',
    proposal: 'A book-length sequence of poems written at the river’s edge each morning for eight weeks, in conversation with the ferry logs held at the historical society.' },
  { applicant: 'r_jonas', title: 'Field Recordings of the Oxbow', discipline: 'd_music', session: 'p_spring', quality: 0.87, accepted: true,
    bio: 'Jonas Reyes is a sound artist whose installations have been shown in six countries.',
    proposal: 'Recording the oxbow lake from dawn to dusk across the spring migration and composing a 40-minute piece for the county’s outdoor amphitheater.' },
  { applicant: 'r_mei', title: 'Salt and Silt', discipline: 'd_visual', session: 'p_fall', quality: 0.85, accepted: true,
    bio: 'Mei Tanaka is a painter who makes pigments from the places she paints.',
    proposal: 'A series of large paintings made with pigments gathered from river sediment, documenting how the riverbank changes after the fall floods.' },
  { applicant: 'rosa', title: 'River Portraits', discipline: 'd_visual', session: 'p_summer', quality: 0.66, accepted: false,
    bio: 'Rosa Delgado is a muralist.', proposal: 'Portraits of people who work on the river.' },
  { applicant: 'r_peter', title: 'The Heron Cycle', discipline: 'd_writing', session: 'p_spring', quality: 0.62, accepted: false,
    bio: 'Peter Novak writes fiction.', proposal: 'Finishing a novel.' },
  { applicant: 'r_aisha', title: 'Floodplain Choreographies', discipline: 'd_performance', session: 'p_fall', quality: 0.72, accepted: false,
    bio: 'Aisha Bello is a choreographer.', proposal: 'A dance piece performed in the floodplain meadow with local dancers.' },
  { applicant: 'r_liam', title: 'Current', discipline: 'd_media', session: 'p_summer', quality: 0.58, accepted: false,
    bio: 'Liam O’Connor is a filmmaker.', proposal: 'A short film about the river.' },
  { applicant: 'r_sofia', title: 'Driftwood Suite', discipline: 'd_music', session: 'p_spring', quality: 0.55, accepted: false,
    bio: 'Sofia Rossi is a cellist.', proposal: 'Composing a suite for cello.' },
];

export const LABELS = [
  { key: 'Board interest', color: '#8b5cf6', description: 'A board member asked to follow this one' },
  { key: 'Needs follow-up', color: '#f59e0b', description: 'Waiting on something from the applicant' },
  { key: 'First-time applicant', color: '#0ea5e9', description: 'Has never applied before' },
  { key: 'Rural', color: '#10b981', description: 'Serves a rural community' },
  { key: 'Youth-focused', color: '#ec4899', description: 'Primarily serves young people' },
  { key: 'Budget question', color: '#ef4444', description: 'Something in the budget needs clarifying' },
];

export const TEMPLATES = [
  {
    name: 'Submission received', trigger: 'Submission received', enabled: true,
    subject: 'We received your application — {{reference}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for applying to {{program_name}}. We received your application "{{submission_title}}" and your reference number is {{reference}}.\n\nYou can check on your application, read messages from our team and download a copy of what you submitted from the applicant portal at any time.\n\nWarmly,\nThe {{organization_name}} grants team',
  },
  {
    name: 'Congratulations', trigger: 'Accepted', enabled: true,
    subject: 'Good news about your application to {{program_name}}',
    body: 'Hi {{applicant_first_name}},\n\nCongratulations — we are delighted to tell you that "{{submission_title}}" has been selected for {{program_name}}, with an award of {{award_amount}}.\n\nOver the next few days you will receive a short request in the portal to confirm your details so we can release funds. If you have any questions in the meantime, just reply to this email.\n\nWith gratitude,\nThe {{organization_name}} team',
  },
  {
    name: 'Not selected', trigger: 'Declined', enabled: true,
    subject: 'An update on your application to {{program_name}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for applying to {{program_name}}. This year we received many more strong applications than we are able to fund, and we are sorry to say that "{{submission_title}}" was not selected.\n\nThis decision is not a judgment of the value of your work. We hope you will apply again, and we are happy to talk through the review panel’s feedback if that would be helpful.\n\nWarmly,\nThe {{organization_name}} team',
  },
  {
    name: 'Waitlist', trigger: 'Waitlisted', enabled: true,
    subject: 'Your application to {{program_name}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for your application to {{program_name}}. The committee was impressed by "{{submission_title}}", and we have placed it on our waitlist.\n\nIf additional funds become available, we will contact you before the end of the month. You don’t need to do anything in the meantime.\n\nWarmly,\nThe {{organization_name}} team',
  },
  {
    name: 'New request', trigger: 'Task requested', enabled: true,
    subject: 'Action needed: {{task_title}}',
    body: 'Hi {{applicant_first_name}},\n\nWe need one more thing from you for {{program_name}}: {{task_title}}. Please complete it in the applicant portal by {{task_due_date}}.\n\nThank you,\nThe {{organization_name}} team',
  },
  {
    name: 'Finish your application', trigger: 'Draft reminder', enabled: true,
    subject: 'Your {{program_name}} application is due {{program_deadline}}',
    body: 'Hi {{applicant_first_name}},\n\nThis is a friendly reminder that your application to {{program_name}} hasn’t been submitted yet. The deadline is {{program_deadline}}.\n\nEverything you have written so far is saved, so you can pick up right where you left off.\n\nThe {{organization_name}} team',
  },
  {
    name: 'Request more information', trigger: 'Manual', enabled: false,
    subject: 'A question about your application {{reference}}',
    body: 'Hi {{applicant_first_name}},\n\nThank you for your application to {{program_name}}. As we review "{{submission_title}}", we have a question:\n\n[Your question]\n\nYou can reply to this email or answer in the applicant portal.\n\nThank you,\nThe {{organization_name}} team',
  },
  {
    name: 'Interview invitation', trigger: 'Manual', enabled: false, program: 'SCHOL',
    subject: 'Interview invitation — {{program_name}}',
    body: 'Hi {{applicant_first_name}},\n\nCongratulations on being selected for an interview for the {{program_name}}. Interviews are 20 minutes, held over video, and led by two members of our committee.\n\nPlease reply with two or three times that work for you next week.\n\nWe look forward to meeting you,\nThe {{organization_name}} scholarship committee',
  },
];
