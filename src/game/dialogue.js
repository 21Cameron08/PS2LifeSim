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

// ---------------------------------------------------------------- SUBSTATION
// Shouted over the music. Keyed by where they are, then by how well you know them.
export const CLUB_GREET = {
  floor: ['WHAT? Oh! Hi!', 'This DJ is UNREAL.', 'Are you dancing or just standing there?', 'Hey! Love that you came out!'],
  bar: ['They take forever here. Worth it.', "Hi! I've been trying to get served for ten minutes.", 'Evening! Escaping the floor for a bit?', 'Cash only. Who carries cash anymore?'],
  booth: ['Come sit, we saved nobody a seat.', 'My feet are DONE. Hi.', 'Good spot this, you can see everyone.', 'Hey! Pull up some velvet.'],
  vip: ['Oh, another wristband. Hello.', "The view's better from up here. So are the chairs.", 'Darling, have you met the DJ? No? Neither have I.', 'Welcome to the balcony. Mind the glass.'],
  roof: ['Finally, I can hear myself think.', 'Look at that tree glowing over there. Every night.', 'Nice up here, right? The lanterns are going up.', 'Getting some air. You?'],
};
export const CLUB_CHAT = {
  stranger: [
    "I come here most Saturdays. Well. Most Saturdays I remember.",
    'Someone told me this place used to power half of Ember Row. Now it powers my bad decisions.',
    "Have you tried the Live Wire? Don't. Actually, do.",
    'The bouncer looked at my shoes for a full ten seconds. A full ten.',
    'They play the same track every night and I lose it every time the drop hits.',
    "Saturdays are OVERLOAD. Bring earplugs and a spare shirt. You'll see.",
  ],
  friendly: [
    "Oh hey, it's you again! The usual crowd's here.",
    'You dance better than you think you do. Trust me.',
    "We should get fries from Ray's cart after. It's the law.",
    'The DJ winked at me. Or had something in their eye. Both count.',
    "They say if you're in the hall at 3:33 the coil hums. I've never stayed that late.",
    'Nadia behind the bar is always hiring. She also scares me. Both things are true.',
  ],
  close: [
    "Honestly, it's not a proper night until you show up.",
    'You, me, the floor, the drop. That is the plan. That has always been the plan.',
    "If they ever open that door behind the big coil, we're going in together. 3:33, someone said. Exactly then.",
    "Some nights I think the music down here and the lanterns over the road are the same song.",
  ],
};
export const DRINK_THANKS = ['You legend!', "Aw, you didn't have to! Cheers!", 'Okay, you are officially my favourite person here.', 'Next one is on me. Probably.'];
