// @ts-check
// Public event page (event.html?id=<event id>). Works without logging in.
// Only approved events are returned by the database; anything else shows "isn't available".

document.addEventListener("alpine:init", () => {
  const Alpine = /** @type {any} */ (window).Alpine;
  Alpine.data("eventPage", () => ({
    /** @type {VolunteerEvent | null} */
    event: null,
    loading: true,
    notFound: false,
    error: "",
    formatEventTime,

    async init() {
      const id = new URLSearchParams(location.search).get("id") ?? "";
      // Event ids are UUIDs; anything else can't be an event.
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        this.notFound = true;
        this.loading = false;
        return;
      }
      try {
        this.event = await getPublicEvent(id);
        this.notFound = !this.event;
      } catch (error) {
        this.error = friendlyError(error);
      } finally {
        this.loading = false;
      }
      if (this.event) {
        const event = this.event;
        document.title = `${event.title} · KampongShare`;
        setTimeout(() => {
          const element = document.getElementById("event-map");
          if (element) createPinMap(element, { lat: event.latitude, lng: event.longitude, label: event.title });
        }, 0);
      }
    },

    get isOver() {
      return this.event ? !isNotOver(this.event) || this.event.status === "completed" || this.event.status === "cancelled" : false;
    },
  }));
});
