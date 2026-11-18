// Notion pages and databases the app reads and writes.
// IDs come from the "Coach – Fitness & Nutrition" hub in Notion.
// If Coach (or you) ever recreates one of these pages, update the ID here.
export const PEOPLE = {
  amir: {
    id: 'amir',
    name: 'Amir',
    emoji: '💪',
    // Value written to the "Agent" select on new rows (must be an existing option, or null).
    agent: 'Amir',
    pages: {
      overview: '41ad0dc2637981eb948ae759242af607', // Amir page (profile, targets, weekly table)
      routine: '41ad0dc26379811a877ccd8b38c2635e', // Current Routine
      diet: '41ad0dc26379818fb0e9ebd49662217d', // Diet Plan
    },
    dbs: {
      workouts: '41ad0dc263798132be70eb4654b069ca', // Amir – Workout Log
      weighins: '41ad0dc2637981d49519fa7531071fa2', // Amir – Weigh-ins
      diet: '41ad0dc2637981aeace0eb1bc2d6789b', // Amir – Diet Log
    },
  },
  rozhin: {
    id: 'rozhin',
    name: 'Rozhin',
    emoji: '🏃',
    agent: null, // her databases have no "Rozhin" option; leave Agent empty
    pages: {
      overview: '41ad0dc26379817499e2fd6a5712e12a',
      routine: '41ad0dc26379810d99d2dd1bef9739db',
      diet: '41ad0dc2637981708319d7481bb22d8d',
    },
    dbs: {
      workouts: '41ad0dc263798118b0d8c96ead45d8dd',
      weighins: '41ad0dc26379816096f1fccf6f1fcd31',
      diet: '41ad0dc2637981c982b6f65788502bef',
    },
  },
};

export const ROUTINE_BLOCK_OPTIONS = ['Block 1', 'Block 2', 'Block 3', 'Other'];
