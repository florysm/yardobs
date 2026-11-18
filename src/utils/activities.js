export const ACTIVITIES = [
  { id: 'bbq',     label: 'BBQ & Smoking',     short: 'BBQ',      icon: '🔥' },
  { id: 'garden',  label: 'Gardening',          short: 'Gardening', icon: '🌱' },
  { id: 'sports',  label: 'Sports & Rec',       short: 'Sports',   icon: '⚽' },
  { id: 'leisure', label: 'Outdoor Leisure',    short: 'Leisure',  icon: '🌿' },
  { id: 'dogwalk', label: 'Dog Walk',           short: 'Dog Walk', icon: '🐾' },
];

// The activity shown until the user picks a default in Settings.
export const DEFAULT_ACTIVITY_ID = ACTIVITIES[0].id;
