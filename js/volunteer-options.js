// @ts-check
// Volunteer choices shared by the sign-up form and the profile page.
// Days and times must match the values the database accepts (profiles checks).

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIME_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

const INTEREST_OPTIONS = [
  { value: "food distribution", label: "Food distribution" },
  { value: "elderly care", label: "Elderly care" },
  { value: "children and education", label: "Children & education" },
  { value: "packing and sorting", label: "Packing & sorting" },
  { value: "environment", label: "Environment" },
  { value: "events and outreach", label: "Events & outreach" },
];

const SKILL_OPTIONS = [
  { value: "driving", label: "Driving" },
  { value: "first aid", label: "First aid" },
  { value: "cooking", label: "Cooking" },
  { value: "tutoring", label: "Tutoring" },
  { value: "languages", label: "Languages" },
  { value: "lifting and moving", label: "Lifting & moving" },
  { value: "photography", label: "Photography" },
  { value: "it support", label: "IT support" },
];
