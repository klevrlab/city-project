/**
 * System to manage the tour events and their state.
 */
AFRAME.registerSystem('event-system', {
  init: function () {
    // Approved SJ26 March Activations copy — avoid "Super Bowl", "March Madness", and
    // NCAA branding per PR guidance. Highlight the SJSU + City of San José + SAP Center
    // + San Jose Sports Authority partnership instead.
    this.dummyEvents = [
      {
        title: "Minis & Trophy – Arena Green West",
        date: "March 26 & 28, 2026",
        time: "1:00 PM – 10:00 PM",
        location: "Arena Green West, San Jose",
        description: "Portable interactive light sculptures by SJSU Professor Esteban Garcia Bravo with the CADRE Media Lab, Digital Media Art, and Spatial Art programs. Trophy is on display alongside the college basketball tournament at SAP Center.",
        sharkeyMessage: "Six-foot illuminated cubes you can walk around and interact with — built by SJSU students and faculty as part of Immersion 2026.",
        icon: "./assets/SharkLogo.png"
      },
      {
        title: "International Football – Watch Together",
        date: "June – July 2026",
        time: "Match times vary",
        location: "San Pedro Square Market",
        description: "Watch the world's biggest football matches in the heart of downtown San José with neighbors and visitors from around the world.",
        sharkeyMessage: "San Pedro Square Market has been a downtown gathering place since 1863 — a great spot to share a meal while you watch the matches.",
        icon: "./assets/SharkLogo.png"
      }
    ];
    this.currentEventIndex = 0;
  },

  getCurrentEvent: function () {
    return this.dummyEvents[this.currentEventIndex];
  },

  getNextEvent: function () {
    this.currentEventIndex = (this.currentEventIndex + 1) % this.dummyEvents.length;
    return this.dummyEvents[this.currentEventIndex];
  }
});
