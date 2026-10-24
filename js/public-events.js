// @ts-check
// "Upcoming events" on index.html: a map of approved upcoming events + the next 3.
// Works without logging in (the database only returns approved events).

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("publicEvents", () => ({
    /** @type {VolunteerEvent[]} */
    events: [],
    loading: true,
    error: "",
    formatEventTime,

    async init() {
      try {
        this.events = await listUpcomingPublicEvents();
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
      // Wait for Alpine to show the map box, then draw the pins.
      setTimeout(() => {
        const element = document.getElementById("events-map");
        if (element && !this.error) createEventsMap(element, this.events);
      }, 0);
    },

    get nextThree() {
      return this.events.slice(0, 3);
    },
  }));
});
