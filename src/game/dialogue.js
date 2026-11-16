// NPC names, moods and lines. Plain data so it is easy to grow (or later move
// to JSON files, or generate with an LLM).

export const FIRST_NAMES = [
  'Mara', 'Teo', 'Ines', 'Dov', 'Hana', 'Rui', 'Petra', 'Kofi', 'Lena', 'Omar', 'Yuki', 'Sasha',
  'Bram', 'Noor', 'Iggy', 'Celia', 'Tomas', 'Wren', 'Dario', 'Juno', 'Ottilie', 'Ravi', 'Mei', 'Sol',
  'Agnes', 'Felix', 'Zara', 'Hugo', 'Lupe', 'Marek', 'Nia', 'Pim', 'Rosa', 'Elio', 'Tess', 'Vik',
];
export const LAST_NAMES = [
  'Okafor', 'Brandt', 'Varga', 'Lindqvist', 'Moreau', 'Achterberg', 'Sato', 'Delgado', 'Kowal', 'Nkemelu',
  'Haddad', 'Ferreira', 'Quist', 'Ivanova', 'Park', 'Mbeki', 'Castell', 'Duval', 'Rinaldi', 'Holm',
];
export const MOODS = ['cheerful', 'tired', 'dreamy', 'busy', 'grumpy'];

const GREET = {
  cheerful: ['Oh, hi there!', 'Lovely evening, isn\'t it?', 'Hey! Haven\'t seen you around before.'],
  tired: ['Mm. Hey.', 'Long day. Long, long day.', 'Sorry, I\'m half asleep.'],
  dreamy: ['Do you ever just... listen to the streetlights hum?', 'Oh! You startled me. I was miles away.', 'Hello, stranger.'],
  busy: ['Can\'t stop long, I\'m late.', 'Quick, what is it?', 'Hi — walking and talking, sorry.'],
  grumpy: ['What.', 'If you\'re selling something, no.', 'Hmph. Yes?'],
};

const CHAT = {
  stranger: [
    'I moved here for work. Still getting lost every other day.',
    'The noodle bar on the corner stays open till 3. Life saver.',
    'Rent went up again. Of course it did.',
    'My cousin drives a cab. Says this city never really sleeps.',
    'You new? You have that look. Map-in-your-head look.',
  ],
  friendly: [
    'Good to see you again! How\'s life treating you?',
    'You know, you\'re alright. Most people don\'t stop to talk.',
    'I\'ve been thinking of taking up a night class. Maybe pottery.',
    'If you ever need a job, the shops downtown are always hiring.',
  ],
  close: [
    'Honestly? You\'re one of my favourite people in this city.',
    'We should get coffee sometime. My treat. Probably.',
    'I\'ll tell you a secret: I talk to the lanterns sometimes. They listen.',
  ],
};

const CITY_TALK = [
  'Downtown\'s all glass and money. Old Market\'s where the real people live.',
  'Kiln Heights used to be all factories. Now it\'s all coffee.',
  'Greenway Park has a fountain. People throw coins in. I fish them out. Kidding! ...Mostly.',
  'The buses run on time. That\'s the strangest thing about this place.',
  'Ember Row? Go at night. You\'ll see what I mean.',
];

const LANTERN_TALK = [
  'Have you seen the Lantern Quarter? Southeast of downtown. The lanterns there... float. Nobody knows why.',
  'They say the old tree in the Lantern Quarter was here before the city. Before the roads, even.',
  'My gran said if you stand under the big tree at midnight you can hear it breathing.',
  'Sometimes the fog turns violet near Ember Row. City says it\'s "light pollution". Sure.',
  'There\'s an old keeper who tends the lanterns. Never seen them leave the square.',
];

export const KEEPER_LINES = [
  'Ah. Another who followed the light. Welcome, little moth.',
  'The lanterns rise when someone in the city makes a wish they don\'t say out loud.',
  'This tree remembers the river that used to run here. Put your hand on the bark sometime.',
  'Come back when the moon is high. The square has more to show you then.',
  'Work, money, a bed, a name on a door... the city gives many things. The quarter gives one: a moment.',
];

export function relTier(rel) {
  return rel >= 60 ? 'close' : rel >= 20 ? 'friendly' : 'stranger';
}

export function greeting(mood, rng) {
  return rng.pick(GREET[mood] || GREET.cheerful);
}
export function chatLine(rel, rng) {
  return rng.pick(CHAT[relTier(rel)]);
}
export function cityLine(rng) {
  return rng.chance(0.45) ? rng.pick(LANTERN_TALK) : rng.pick(CITY_TALK);
}
