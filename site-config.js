/* =====================================================================
   SUPER AL-AMIN HALAL MARKET — SITE SETTINGS
   ---------------------------------------------------------------------
   This is the ONE file to edit for store details, photos, grocery
   categories, WhatsApp messages, and the announcement banner.
   Save the file and refresh the browser to see changes.
   Keep the quotes and commas exactly as they are.
   ===================================================================== */

window.SITE = {

  /* ---------- Store details (confirmed) ---------- */
  store: {
    name: "Super Al-Amin Halal Market",
    street: "18220 Prairie Ave",
    city: "Torrance",
    state: "CA",
    zip: "90504",

    phoneDisplay: "(310) 538-1188",
    phoneLink: "tel:+13105381188",

    whatsappDisplay: "(424) 527-3540",
    whatsappNumber: "14245273540", // digits only, with country code 1

    directionsLink:
      "https://www.google.com/maps/dir/?api=1&destination=18220+Prairie+Ave%2C+Torrance%2C+CA+90504",

    /* Store hours, shown in the "Visit the Market" section.
       "note" is optional and shows in smaller text under that row. */
    hours: [
      { days: "Monday – Thursday", time: "10:00 AM – 8:00 PM" },
      { days: "Friday", time: "10:00 AM – 8:00 PM", note: "Closed 12:15 – 1:15 PM for Friday prayer" },
      { days: "Saturday – Sunday", time: "10:00 AM – 8:00 PM" }
    ],

    /* The same hours in a format Google reads (24-hour clock).
       Update these too if your hours change. */
    hoursForGoogle: ["Mo-Th 10:00-20:00", "Fr 10:00-12:15", "Fr 13:15-20:00", "Sa-Su 10:00-20:00"],

    footerHours: "Open daily 10 AM – 8 PM"
  },

  /* ---------- Social media ----------
     Paste the full link to each profile. Leave "" to hide one. */
  social: {
    instagram: "https://www.instagram.com/al_aminhalal/",
    tiktok: "",
    facebook: ""
  },

  /* ---------- Prefilled WhatsApp messages (customers can edit before sending) ---------- */
  whatsappMessages: {
    general: "Hi Super Al-Amin!",
    meatCounter: "Hi Super Al-Amin! Which halal meat cuts do you have available today?",
    samosas: "Hi Super Al-Amin! Do you have samosas, patties, or chai available today?",
    signup: "Hi Super Al-Amin! I just signed up for WhatsApp updates."
  },

  /* ---------- Photos ----------
     To use your own photos: put the image file in the "images" folder,
     then change the file name below. JPG, PNG, or WebP all work.
     Always update "alt" to describe what is actually in the photo.   */
  photos: {
    hero: {
      src: "images/hero-market.svg",
      alt: "Fresh produce, spices, and pantry staples on market shelves"
    },
    meat: {
      src: "images/meat-counter.svg",
      alt: "Fresh cuts of halal meat at the butcher counter"
    },
    samosas: {
      src: "images/samosas-patties.svg",
      alt: "Golden samosas and patties with a cup of chai"
    }
  },

  /* ---------- Grocery categories (shown as a grid) ---------- */
  groceryCategories: [
    { name: "Rice & Atta",      image: "images/rice-atta.svg",   alt: "Bags of basmati rice and atta flour" },
    { name: "Lentils & Beans",  image: "images/lentils.svg",     alt: "Bowls of colorful lentils and beans" },
    { name: "Spices & Masalas", image: "images/spices.svg",      alt: "Ground spices and masala blends" },
    { name: "Snacks & Tea",     image: "images/snacks-tea.svg",  alt: "A cup of chai with South Asian snacks" },
    { name: "Fresh Produce",    image: "images/produce.svg",     alt: "Fresh vegetables, chilies, and herbs" }
  ],

  /* ---------- What's New & Deals ---------- */
  dealsSection: {
    show: false   // true = show the Deals section, WhatsApp sign-up, and menu link
  },

  /* 
     EASIEST: post deals from a Google Sheet (no code needed).
     Paste the sheet's "Publish to web" CSV link between the quotes below.
     See README.md, "Posting deals from a Google Sheet".                    */
  dealsSheetUrl: "",

  /* Or, without a Google Sheet: add a deal or new arrival by copying the example below, removing the
     "//" at the start of each line, and filling it in. Newest first.
       title:  short headline (required)
       text:   one or two sentences (optional)
       badge:  small label like "New arrival", "Deal", "Limited time" (optional)
       image:  photo in the images folder, e.g. "images/mangoes.jpg" (optional)
       alt:    describe the photo (needed if you add an image)
       ends:   last day to show it, as "YYYY-MM-DD". It hides itself after
               that date. Leave "" to keep it up until you remove it.
     When the list is empty, the section shows only the WhatsApp sign-up.   */
  deals: [
    // {
    //   title: "Pakistani mangoes are here",
    //   text: "Fresh boxes just arrived. Message us to set one aside.",
    //   badge: "New arrival",
    //   image: "images/mangoes.jpg",
    //   alt: "Boxes of ripe Pakistani mangoes",
    //   ends: "2027-07-31"
    // },
  ],

  /* ---------- Google reviews ----------
     Live reviews need two things from Google (see README.md, "Google reviews"):
       googleApiKey:  a Google Maps Platform API key with "Places API (New)" and
                      "Maps JavaScript API" turned on, restricted to your domain.
       googlePlaceId: your store's Place ID (looks like "ChIJ...").
     Until both are filled in, the section shows a "Read reviews on Google" button.
     Google shares up to 5 reviews and picks which ones. 3 fits the layout best. */
  reviews: {
    show: false,          // true = show the Reviews section and menu link
    googleApiKey: "",
    googlePlaceId: "",
    maxReviews: 3
  },

  /* ---------- Announcement banner ----------
     Set show: true to display it at the top of the page.
     Example messages:
       "Pakistani mangoes have arrived! Ask us on WhatsApp."
       "Now taking Qurbani orders. Message us for details."
       "Ramadan specials are in store. Ramadan Mubarak!"
       "We will be closed on [date] for Eid. Eid Mubarak!"
     linkText/linkTo are optional. linkTo can be "whatsapp", "call",
     "directions", or a full web address. Leave linkText "" for no link. */
  announcement: {
    show: false,
    text: "Pakistani mangoes have arrived! Ask us on WhatsApp.",
    linkText: "Message us",
    linkTo: "whatsapp"
  }
};
