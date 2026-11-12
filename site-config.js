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

    /* Store hours. Shown under the top buttons, in "Visit the Market",
       and in the footer. Change the wording here and it updates everywhere. */
    hoursSummary: "Open daily 10 AM–8 PM",
    fridayNote: "Closed Fridays 12:15–1:15 PM for prayer",

    /* The same hours in a format Google reads (24-hour clock).
       Update these too if your hours change. */
    hoursForGoogle: ["Mo-Th 10:00-20:00", "Fr 10:00-12:15", "Fr 13:15-20:00", "Sa-Su 10:00-20:00"]
  },

  /* ---------- Social media ----------
     Paste the full link to each profile. Leave "" to hide one. */
  social: {
    instagram: "https://www.instagram.com/al_aminhalal/",
    tiktok: "https://www.tiktok.com/@super.al.amin.hal",
    facebook: "https://www.facebook.com/alaminhalalmarket/"
  },

  /* ---------- Prefilled WhatsApp messages (customers can edit before sending) ---------- */
  whatsappMessages: {
    general: "Hi Super Al-Amin!",
    meatCounter: "Hi Super Al-Amin! Which halal meat cuts do you have available today?",
    samosas: "Hi Super Al-Amin! Do you have samosas, patties, or chai available today?",
    signup: "Hi Super Al-Amin! I just signed up for WhatsApp updates.",
    grocery: "Hi Super Al-Amin! Do you have ___ in stock today?"
  },

  /* ---------- Photos ----------
     To use your own photos: put the image file in the "images" folder,
     then change the file name below. JPG, PNG, or WebP all work.
     Always update "alt" to describe what is actually in the photo.   */
  photos: {
    hero: {
      src: "images/hero-goat-chops.jpg",
      alt: "Freshly cut baby goat chops at the Super Al-Amin meat counter"
    },
    meat: {
      src: "images/meat-bandsaw-chops.jpg",
      alt: "Baby goat chops being cut on the band saw at the meat counter"
    },
    produceCase: {
      src: "images/store-produce-shelf.jpg",
      alt: "Fresh vegetables and herbs in red baskets at Super Al-Amin's produce case"
    },
    samosas: {
      src: "images/samosas-poster.jpg",
      video: "videos/samosas.mp4",   // leave "" to show only the photo
      alt: "Trays of fresh samosas made at Super Al-Amin"
    }
  },

  /* ---------- Grocery categories (shown as a grid) ---------- */
  groceryCategories: [
    { name: "Rice & Atta",      image: "images/rice-atta.svg",          alt: "Bags of basmati rice and atta flour" },
    { name: "Lentils & Beans",  image: "images/lentils.svg",            alt: "Bowls of colorful lentils and beans" },
    { name: "Spices & Masalas", image: "images/spices-photo.jpg",       alt: "Shelves of Sri Lankan curry powders, masalas, and pickles at Super Al-Amin" },
    { name: "Snacks & Tea",     image: "images/snacks-tea-photo.jpg",   alt: "A bag of Nimco's Mix Nimco snack" },
    { name: "Fresh Produce",    image: "images/produce-photo.jpg",      alt: "A box of fresh pomegranates" }
  ],

  /* ---------- "From our shelves" photo galleries (Groceries section) ----------
     Each gallery has a title, a short line of text, and a list of items.
     To add a product: put the photo in the images folder and copy one line.
     "featured" = how many items show before the "See all" button (leave it
     out to show everything). "seeAllLabel" is the button text.
     A gallery can also have a "video" (and "poster" image) instead of items. */
  showcases: [
    {
      title: "Fresh fruit & vegetables",
      text: "Seasonal favorites arrive throughout the year. Ask us what's in this week.",
      featured: 5,
      seeAllLabel: "See all produce",
      items: [
        { name: "Pomegranates",           image: "images/produce/pomegranates.jpg",    alt: "A box of fresh pomegranates" },
        { name: "Mangoes",                image: "images/produce/mangoes.jpg",         alt: "Boxes of ripe mangoes" },
        { name: "Fresh dates",            image: "images/produce/fresh-dates.jpg",     alt: "A bunch of fresh yellow dates" },
        { name: "Figs",                   image: "images/produce/figs.jpg",            alt: "A tray of fresh figs" },
        { name: "Guava",                  image: "images/produce/guava.jpg",           alt: "A box of fresh guavas" },
        { name: "Young coconut",          image: "images/produce/young-coconut.jpg",   alt: "A wrapped young coconut" },
        { name: "Karela (bitter gourd)",  image: "images/produce/karela.jpg",          alt: "A basket of karela" },
        { name: "Green chickpeas",        image: "images/produce/green-chickpeas.jpg", alt: "A tray of fresh green chickpeas" },
        { name: "Betel leaves (paan)",    image: "images/produce/betel-leaves.jpg",    alt: "A box of fresh betel leaves" }
      ]
    },
    {
      title: "Pakistani snacks & chai-time favorites",
      text: "Crunchy nimco, puffs, and something for every cup of chai.",
      featured: 5,
      seeAllLabel: "See all snacks",
      items: [
        { name: "Mix Nimco",                  image: "images/snacks/snack-mix-nimco.jpg",                 alt: "Nimco's Mix Nimco" },
        { name: "Chana Chilli",               image: "images/snacks/snack-chana-chilli.jpg",              alt: "Nimco's Chana Chilli" },
        { name: "Dal Moong",                  image: "images/snacks/snack-dal-moong.jpg",                 alt: "Nimco's Dal Moong" },
        { name: "Namak Paray",                image: "images/snacks/snack-namak-paray.jpg",               alt: "Nimco's Namak Paray" },
        { name: "Tea Puri",                   image: "images/snacks/snack-tea-puri.jpg",                  alt: "Nimco's Tea Puri" },
        { name: "Chilli Ringz",               image: "images/snacks/snack-chilli-ringz.jpg",              alt: "Nimco's Chilli Ringz" },
        { name: "Masala Puffs",               image: "images/snacks/snack-masala-puffs.jpg",              alt: "Nimco's Masala Puffs" },
        { name: "Salty Puffs",                image: "images/snacks/snack-salty-puffs.jpg",               alt: "Nimco's Salty Puffs" },
        { name: "Potato Crinkles",            image: "images/snacks/snack-potato-crinkles.jpg",           alt: "Nimco's spicy Potato Crinkles" },
        { name: "Spicy Potato Sticks",        image: "images/snacks/snack-spicy-potato-sticks.jpg",       alt: "Nimco's Spicy Potato Sticks" },
        { name: "Black Pepper Potato Sticks", image: "images/snacks/snack-black-pepper-potato-sticks.jpg", alt: "Nimco's Black Pepper Potato Sticks" },
        { name: "Salty Potato Sticks",        image: "images/snacks/snack-salty-potato-sticks.jpg",       alt: "Nimco's Salty Potato Sticks" }
      ]
    },
    {
      title: "Pantry staples",
      text: "Everyday cooking basics from brands you know from home.",
      items: [
        { name: "Bake Parlor macaroni", image: "images/snacks/bake-parlor-macaroni.jpg", alt: "Bake Parlor macaroni boxes on a store rack" }
      ]
    },
    {
      title: "Authentic Sri Lankan groceries",
      text: "Curry powders, masalas, pickles, biscuits, and more, all in one aisle.",
      video: "videos/sri-lankan-aisle.mp4",
      poster: "images/sri-lankan-aisle.jpg",
      alt: "A walk down Super Al-Amin's Sri Lankan grocery aisle"
    },
    {
      title: "Halal treats",
      text: "Grab-and-go snacks at the counter.",
      items: [
        { name: "Halal beef sticks",   image: "images/treats/halal-beef-sticks.jpg", alt: "Boxes of Sharifa halal beef sticks, original and jalapeño" },
        { name: "Dubai chocolate bar", image: "images/treats/dubai-chocolate.jpg",   alt: "A box of Dubai milk chocolate flavor bars" }
      ]
    }
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
